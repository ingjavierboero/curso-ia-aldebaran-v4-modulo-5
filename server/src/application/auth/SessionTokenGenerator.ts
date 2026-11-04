export interface GeneratedSessionToken {
  /** Valor que viaja en la cookie; nunca se persiste. */
  token: string;
  /** Lo único que se guarda en `sessions.token_hash`. */
  tokenHash: string;
}

export interface SessionTokenGenerator {
  generate(): GeneratedSessionToken;
  hash(token: string): string;
}
