/** Un enlace de recuperación vence a los 10 minutos de emitido (FEAT-008, FR-06). */
export const RESET_TOKEN_TTL_MS = 10 * 60_000;

/** Entre dos emails de recuperación al mismo usuario pasan al menos 5 minutos (FEAT-008, FR-15). */
export const RESET_EMAIL_COOLDOWN_MS = 5 * 60_000;

export interface PasswordResetTokenProps {
  id: string;
  userId: string;
  /** hex SHA-256 del token; el token en claro nunca se guarda. */
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  /** Se cambió la contraseña con este token. */
  usedAt: Date | null;
  /** Lo anuló otro token o un cambio de contraseña. */
  invalidatedAt: Date | null;
}

export class PasswordResetToken {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly invalidatedAt: Date | null;

  constructor(props: PasswordResetTokenProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.tokenHash = props.tokenHash;
    // Copias defensivas, como en Session.
    this.createdAt = new Date(props.createdAt.getTime());
    this.expiresAt = new Date(props.expiresAt.getTime());
    this.usedAt = props.usedAt ? new Date(props.usedAt.getTime()) : null;
    this.invalidatedAt = props.invalidatedAt ? new Date(props.invalidatedAt.getTime()) : null;
  }

  static issue(params: { id: string; userId: string; tokenHash: string; now: Date }): PasswordResetToken {
    return new PasswordResetToken({
      id: params.id,
      userId: params.userId,
      tokenHash: params.tokenHash,
      createdAt: params.now,
      expiresAt: new Date(params.now.getTime() + RESET_TOKEN_TTL_MS),
      usedAt: null,
      invalidatedAt: null,
    });
  }

  /** Sirve si no se usó, no se anuló y no venció (a los 10 minutos exactos ya no sirve). */
  isUsable(now: Date): boolean {
    return this.usedAt === null && this.invalidatedAt === null && now.getTime() < this.expiresAt.getTime();
  }
}

/** Se puede emitir un token nuevo si no hay uno previo o el último tiene al menos 5 minutos. */
export function canIssueResetToken(latestCreatedAt: Date | null, now: Date): boolean {
  return latestCreatedAt === null || now.getTime() - latestCreatedAt.getTime() >= RESET_EMAIL_COOLDOWN_MS;
}
