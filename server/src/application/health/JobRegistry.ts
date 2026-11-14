import { JobCatalog } from '../../domain/health/JobCatalog.js';
import type { JobDefinition } from '../../domain/health/JobDefinition.js';

/**
 * Los procesos automáticos de la app, en memoria. Lo llena el composition root al arrancar; un
 * nombre repetido lanza `DuplicateJobName` (FR-04).
 */
export class JobRegistry {
  private readonly catalog = new JobCatalog();

  register(definition: JobDefinition): void {
    this.catalog.register(definition);
  }

  find(name: string): JobDefinition | null {
    return this.catalog.find(name);
  }

  /** En orden de registro; devuelve una copia. */
  list(): JobDefinition[] {
    return this.catalog.list();
  }
}
