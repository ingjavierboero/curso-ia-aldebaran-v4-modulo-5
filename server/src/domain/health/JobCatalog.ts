import { DuplicateJobName } from './errors.js';
import type { JobDefinition } from './JobDefinition.js';

/** Los procesos registrados. Un nombre repetido lanza `DuplicateJobName` y el catálogo queda igual (FR-04). */
export class JobCatalog {
  private readonly definitions = new Map<string, JobDefinition>();

  register(definition: JobDefinition): void {
    if (this.definitions.has(definition.name)) throw new DuplicateJobName(definition.name);
    this.definitions.set(definition.name, definition);
  }

  find(name: string): JobDefinition | null {
    return this.definitions.get(name) ?? null;
  }

  /** En orden de registro; devuelve una copia. */
  list(): JobDefinition[] {
    return [...this.definitions.values()];
  }
}
