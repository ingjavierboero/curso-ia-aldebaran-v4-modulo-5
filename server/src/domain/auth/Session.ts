/** Una sesión vence tras 24 h sin actividad (FR-09, deslizante). */
export const SESSION_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export interface SessionProps {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  lastActivityAt: Date;
}

export class Session {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly lastActivityAt: Date;

  constructor(props: SessionProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.tokenHash = props.tokenHash;
    // Copias defensivas: la entidad no comparte la Date con quien la creó ni entre sus campos.
    this.createdAt = new Date(props.createdAt.getTime());
    this.lastActivityAt = new Date(props.lastActivityAt.getTime());
  }

  isExpired(now: Date): boolean {
    return now.getTime() - this.lastActivityAt.getTime() >= SESSION_IDLE_TIMEOUT_MS;
  }
}
