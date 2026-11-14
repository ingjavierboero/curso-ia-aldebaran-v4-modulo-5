import { InvalidJobDefinition } from './errors.js';

export const JOB_NAME_MAX_LENGTH = 64;

export interface JobDefinitionProps {
  name: string;
  intervalMs: number;
}

/**
 * Un proceso automático registrado (FR-04): nombre (trim, de 1 a 64 caracteres) e intervalo esperado
 * entre ejecuciones (entero mayor que cero). Lo inválido lanza `InvalidJobDefinition`.
 */
export class JobDefinition {
  readonly name: string;
  readonly intervalMs: number;

  constructor(props: JobDefinitionProps) {
    if (typeof props.name !== 'string') throw new InvalidJobDefinition();
    const name = props.name.trim();
    if (name.length === 0 || name.length > JOB_NAME_MAX_LENGTH) throw new InvalidJobDefinition();
    if (!Number.isInteger(props.intervalMs) || props.intervalMs <= 0) throw new InvalidJobDefinition();
    this.name = name;
    this.intervalMs = props.intervalMs;
  }
}
