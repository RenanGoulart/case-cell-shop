export interface Clock {
  now(): Date;
}

export interface Sleeper {
  sleep(milliseconds: number): Promise<void>;
}

export interface UuidGenerator {
  randomUuid(): string;
}

export interface RandomGenerator {
  next(): number;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export const systemSleeper: Sleeper = {
  sleep: (milliseconds) =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
};

export const cryptoUuidGenerator: UuidGenerator = {
  randomUuid: () => crypto.randomUUID(),
};

export const mathRandomGenerator: RandomGenerator = {
  next: () => Math.random(),
};
