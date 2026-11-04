import type { Clock } from '../../src/domain/shared/Clock.js';

export class FakeClock implements Clock {
  private current: Date;

  constructor(start: Date | string = '2026-11-04T12:00:00.000Z') {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(date: Date | string): void {
    this.current = new Date(date);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
