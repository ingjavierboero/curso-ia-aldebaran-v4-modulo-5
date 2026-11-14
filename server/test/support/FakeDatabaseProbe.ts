import type { DatabaseProbe } from '../../src/application/health/DatabaseProbe.js';

/** Sondeo controlable desde el test; cuenta cuántas veces se consultó. */
export class FakeDatabaseProbe implements DatabaseProbe {
  available = true;
  calls = 0;

  isAvailable(): boolean {
    this.calls += 1;
    return this.available;
  }
}
