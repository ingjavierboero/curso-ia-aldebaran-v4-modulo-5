/** Puerto asíncrono: el hash (argon2id) nunca se ejecuta dentro de una UnitOfWork (ADR-003). */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}
