import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CreateClient, type CreateClientInput } from '../../src/application/client/CreateClient.js';
import type { PublicClient } from '../../src/application/client/dto/PublicClient.js';
import type { TransactionalRepositories, UnitOfWork } from '../../src/application/shared/UnitOfWork.js';
import type { Client } from '../../src/domain/client/Client.js';
import type { ClientRepository } from '../../src/domain/client/ClientRepository.js';
import { DuplicateCuit } from '../../src/domain/client/errors.js';
import { Email } from '../../src/domain/shared/Email.js';
import { User } from '../../src/domain/user/User.js';
import { DrizzleClientRepository } from '../../src/infrastructure/db/DrizzleClientRepository.js';
import { DrizzleUnitOfWork } from '../../src/infrastructure/db/DrizzleUnitOfWork.js';
import { DrizzleUserRepository } from '../../src/infrastructure/db/DrizzleUserRepository.js';
import { FakeClock } from '../support/FakeClock.js';
import { SequentialIdGenerator } from '../support/SequentialIdGenerator.js';
import { createTestDb, type TestDb } from '../support/sqliteTestDb.js';

let t: TestDb;

beforeEach(() => {
  t = createTestDb();
});

afterEach(() => {
  t.cleanup();
});

const INPUT: CreateClientInput = {
  businessName: 'Los Andes S.A.',
  cuit: '30711111111',
  address: 'Av. Siempre Viva 742',
  billingEmail: 'pagos@losandes.com',
  ivaCondition: 1,
};

/**
 * Vista de `clients` "como estaba al empezar": los controles previos no ven a los clientes creados
 * después de `startIds`. Es lo que leería un proceso que hizo su control antes de que el otro
 * confirmara. Todo lo demás (incluido `insert`) va a la base real.
 */
function asOfStart(
  real: ClientRepository,
  startIds: ReadonlySet<string>,
  cuitReads: Array<Client | null>,
): ClientRepository {
  const visible = (client: Client | null) => (client && startIds.has(client.id) ? client : null);
  return {
    insert: (client) => {
      real.insert(client);
    },
    update: (client) => {
      real.update(client);
    },
    findById: (id) => visible(real.findById(id)),
    findByCuit: (cuit) => {
      const result = visible(real.findByCuit(cuit));
      cuitReads.push(result);
      return result;
    },
    findByBillingEmail: (email) => visible(real.findByBillingEmail(email)),
    list: () => real.list().filter((client) => startIds.has(client.id)),
  };
}

describe('carrera de altas de clientes sobre SQLite real', () => {
  // Dos altas con el mismo CUIT al mismo tiempo: una se crea y la otra DuplicateCuit (AC-17, NFR-01)
  it('test_race_dos_altas_mismo_cuit_conflict', () => {
    const clock = new FakeClock();
    const users = new DrizzleUserRepository(t.db);
    const clientsRepo = new DrizzleClientRepository(t.db);
    const ids = new SequentialIdGenerator('c');
    const editor = new User({
      id: 'u-editor',
      name: 'Bruno Editor',
      email: Email.create('editor@empresa.com'),
      role: 'editor',
      status: 'activo',
      passwordHash: 'hashed:x',
      createdAt: clock.now(),
    });
    users.insert(editor);
    const realUow = new DrizzleUnitOfWork(t.db);
    const winnerUseCase = new CreateClient({ uow: realUow, ids, clock });

    // Esto NO es una carrera concurrente real: better-sqlite3 es síncrono, `CreateClient` no tiene
    // `await`, y la transacción IMMEDIATE ya serializa las altas (en un proceso y entre procesos), así
    // que el control previo alcanza. Lo que este test verifica es el UNIQUE de `clients.cuit` como
    // defensa en profundidad: se simula un control previo que leyó antes de que el otro confirmara.
    // El perdedor arranca, el ganador corre completo y confirma, y recién después el perdedor entra a
    // su transacción viendo `clients` como estaba al empezar. Lo frena el UNIQUE, traducido a
    // `DuplicateCuit`.
    const loserCuitReads: Array<Client | null> = [];
    let winner: PublicClient | null = null;
    const loserUow: UnitOfWork = {
      run<T>(fn: (repos: TransactionalRepositories) => T): T {
        const startIds = new Set(clientsRepo.list().map((client) => client.id));
        winner = winnerUseCase.execute(editor, { ...INPUT, billingEmail: 'ganador@losandes.com' });
        return realUow.run((repos) => fn({ ...repos, clients: asOfStart(repos.clients, startIds, loserCuitReads) }));
      },
    };
    const loserUseCase = new CreateClient({ uow: loserUow, ids, clock });

    expect(() => loserUseCase.execute(editor, { ...INPUT, billingEmail: 'perdedor@losandes.com' })).toThrow(
      DuplicateCuit,
    );

    // El perdedor consultó el CUIT antes de insertar y no vio al ganador: pasó el control previo.
    expect(loserCuitReads.length).toBeGreaterThanOrEqual(1);
    expect(loserCuitReads.every((read) => read === null)).toBe(true);
    expect(winner).not.toBeNull();
    expect(winner).toMatchObject({ cuit: '30711111111', billingEmail: 'ganador@losandes.com', status: 'activo' });
    const stored = clientsRepo.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.billingEmail.value).toBe('ganador@losandes.com');

    // Serializados por la transacción IMMEDIATE (el caso de dos procesos), el segundo lo frena el
    // control previo: tampoco se crea.
    expect(() => winnerUseCase.execute(editor, { ...INPUT, billingEmail: 'tercero@losandes.com' })).toThrow(
      DuplicateCuit,
    );
    expect(clientsRepo.list()).toHaveLength(1);
  });
});
