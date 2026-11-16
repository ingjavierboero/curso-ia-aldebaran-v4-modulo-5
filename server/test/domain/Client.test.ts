import { describe, expect, it } from 'vitest';
import { Client, parseAddress, parseBusinessName } from '../../src/domain/client/Client.js';
import { Cuit } from '../../src/domain/client/Cuit.js';
import {
  DuplicateBillingEmail,
  DuplicateCuit,
  InvalidClientData,
  ProductAlreadyAssigned,
} from '../../src/domain/client/errors.js';
import { IvaCondition } from '../../src/domain/client/IvaCondition.js';
import { Email } from '../../src/domain/shared/Email.js';

function validData() {
  return {
    businessName: '  Los Andes S.A. ',
    cuit: Cuit.parse('30-71111111-1'),
    address: ' Av. Siempre Viva 742 ',
    billingEmail: Email.create('Pagos@LosAndes.com'),
    ivaCondition: IvaCondition.of(1),
  };
}

function newClient(): Client {
  return Client.create({ id: 'c-1', ...validData(), createdAt: new Date('2026-11-16T12:00:00.000Z') });
}

describe('Client', () => {
  // Razón social y domicilio: trim, 1–200 (S-01, AC-02)
  it('test_client_datos_invalidos_rechazados', () => {
    expect(parseBusinessName('  Los Andes ')).toBe('Los Andes');
    expect(parseBusinessName('x'.repeat(200))).toHaveLength(200);
    expect(parseAddress(' Calle 1 ')).toBe('Calle 1');

    expect(() => parseBusinessName('')).toThrow(InvalidClientData);
    expect(() => parseBusinessName('   ')).toThrow(InvalidClientData);
    expect(() => parseBusinessName('x'.repeat(201))).toThrow(InvalidClientData);
    expect(() => parseBusinessName(undefined as unknown as string)).toThrow(InvalidClientData);
    expect(() => parseAddress('')).toThrow(InvalidClientData);
    expect(() => parseAddress('x'.repeat(201))).toThrow(InvalidClientData);

    const createdAt = new Date('2026-11-16T12:00:00.000Z');
    expect(() => Client.create({ id: 'c-1', ...validData(), businessName: '', createdAt })).toThrow(InvalidClientData);
    expect(() => Client.create({ id: 'c-1', ...validData(), businessName: 'x'.repeat(201), createdAt })).toThrow(
      InvalidClientData,
    );
    expect(() => Client.create({ id: 'c-1', ...validData(), address: ' ', createdAt })).toThrow(InvalidClientData);
    expect(() => newClient().withData({ ...validData(), businessName: '' })).toThrow(InvalidClientData);
  });

  // Alta Activa; baja y reactivación idempotentes, sin tocar el resto (FR-01, FR-03, AC-04)
  it('test_client_baja_y_reactivacion_idempotentes', () => {
    const client = newClient();
    expect(client.status).toBe('activo');
    expect(client.isActive()).toBe(true);
    expect(client.businessName).toBe('Los Andes S.A.');
    expect(client.address).toBe('Av. Siempre Viva 742');
    expect(client.cuit.value).toBe('30711111111');
    expect(client.billingEmail.value).toBe('pagos@losandes.com');
    expect(client.ivaCondition.code).toBe(1);
    expect(client.createdAt.toISOString()).toBe('2026-11-16T12:00:00.000Z');

    const inactive = client.deactivated();
    expect(inactive).not.toBe(client);
    expect(inactive.status).toBe('inactivo');
    expect(inactive.isActive()).toBe(false);
    expect(inactive.id).toBe('c-1');
    expect(inactive.businessName).toBe('Los Andes S.A.');
    expect(client.status).toBe('activo');
    // idempotente: dar de baja un Inactivo lo deja igual
    expect(inactive.deactivated()).toBe(inactive);

    const active = inactive.reactivated();
    expect(active.status).toBe('activo');
    expect(inactive.status).toBe('inactivo');
    expect(active.reactivated()).toBe(active);
  });

  it('Client.withData devuelve un cliente nuevo con los datos cambiados, sin tocar id, estado ni fecha de alta', () => {
    const client = newClient().deactivated();
    const changed = client.withData({
      businessName: ' Los Andes SRL ',
      cuit: Cuit.parse('20123456786'),
      address: 'Calle 2',
      billingEmail: Email.create('cobros@losandes.com'),
      ivaCondition: IvaCondition.of(6),
    });

    expect(changed).not.toBe(client);
    expect(changed.id).toBe('c-1');
    expect(changed.businessName).toBe('Los Andes SRL');
    expect(changed.cuit.value).toBe('20123456786');
    expect(changed.address).toBe('Calle 2');
    expect(changed.billingEmail.value).toBe('cobros@losandes.com');
    expect(changed.ivaCondition.code).toBe(6);
    expect(changed.status).toBe('inactivo');
    expect(changed.createdAt.toISOString()).toBe('2026-11-16T12:00:00.000Z');
    expect(client.businessName).toBe('Los Andes S.A.');
  });

  it('los errores de unicidad de clientes y asignaciones tienen nombre y mensaje en español', () => {
    const cases: ReadonlyArray<readonly [Error, string, string]> = [
      [new DuplicateCuit(), 'DuplicateCuit', 'Ya existe un cliente con ese CUIT'],
      [new DuplicateBillingEmail(), 'DuplicateBillingEmail', 'Ya existe un cliente con ese email de facturación'],
      [new ProductAlreadyAssigned(), 'ProductAlreadyAssigned', 'El producto ya está asignado a ese cliente'],
    ];
    for (const [error, name, message] of cases) {
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(name);
      expect(error.message).toBe(message);
    }
  });

  it('Client copia createdAt: mutar la Date pasada no cambia el cliente', () => {
    const createdAt = new Date('2026-11-16T12:00:00.000Z');
    const client = Client.create({ id: 'c-2', ...validData(), createdAt });

    createdAt.setTime(0);

    expect(client.createdAt.toISOString()).toBe('2026-11-16T12:00:00.000Z');
  });
});
