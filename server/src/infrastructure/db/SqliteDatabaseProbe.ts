import Database from 'better-sqlite3';
import type { DatabaseProbe } from '../../application/health/DatabaseProbe.js';

/** Corte de espera del sondeo ante una base bloqueada (NFR-01, ADR-005). */
export const PROBE_BUSY_TIMEOUT_MS = 500;

/**
 * Sondeo de la base sobre una conexión propia de solo lectura (ADR-005): un busy timeout de 500 ms
 * (opción `timeout` de better-sqlite3, que fija `busy_timeout`) acota la espera sin tocar la conexión
 * compartida, y la lectura de `sqlite_master` detecta un archivo bloqueado o ilegible. Cualquier
 * error es `false`; su texto no sale de acá. La conexión se abre en el primer sondeo; ante un error
 * se cierra, para que el siguiente sondeo reabra una nueva (archivo reemplazado o error persistente
 * en el handle). `close()` la cierra.
 */
export class SqliteDatabaseProbe implements DatabaseProbe {
  private connection: Database.Database | null = null;

  constructor(private readonly path: string) {}

  isAvailable(): boolean {
    try {
      this.open().prepare('SELECT 1 FROM sqlite_master LIMIT 1').get();
      return true;
    } catch {
      this.closeQuietly();
      return false;
    }
  }

  close(): void {
    const connection = this.connection;
    this.connection = null;
    connection?.close();
  }

  private closeQuietly(): void {
    try {
      this.close();
    } catch {
      // el handle ya estaba inservible: alcanza con soltarlo
    }
  }

  private open(): Database.Database {
    this.connection ??= new Database(this.path, {
      readonly: true,
      fileMustExist: true,
      timeout: PROBE_BUSY_TIMEOUT_MS,
    });
    return this.connection;
  }
}
