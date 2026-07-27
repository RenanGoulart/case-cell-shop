import type { Clock, RandomGenerator, Sleeper, UuidGenerator } from "@/shared/ports/runtime.js";

export class FakeClock implements Clock {
  private current: Date;

  public constructor(initial: Date = new Date("2026-07-27T00:00:00.000Z")) {
    this.current = new Date(initial);
  }

  public now(): Date {
    return new Date(this.current);
  }

  public advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

export class FakeSleeper implements Sleeper {
  public readonly sleeps: number[] = [];

  public sleep(milliseconds: number): Promise<void> {
    this.sleeps.push(milliseconds);
    return Promise.resolve();
  }
}

export class SequenceUuidGenerator implements UuidGenerator {
  private nextId = 1;

  public randomUuid(): string {
    const suffix = String(this.nextId).padStart(12, "0");
    this.nextId += 1;
    return `00000000-0000-4000-8000-${suffix}`;
  }
}

export class SeededRandomGenerator implements RandomGenerator {
  private state: number;

  public constructor(seed: number) {
    this.state = seed >>> 0;
  }

  public next(): number {
    this.state = (1_664_525 * this.state + 1_013_904_223) >>> 0;
    return this.state / 0x1_0000_0000;
  }
}
