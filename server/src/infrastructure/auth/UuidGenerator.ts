import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '../../application/shared/IdGenerator.js';

export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}
