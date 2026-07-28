import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "@/api/app.js";
import { testAppConfig } from "@tests/helpers/app-config.js";

const redisMock = vi.hoisted(() => {
  let open = false;
  const client = {
    get isOpen() {
      return open;
    },
    connect: vi.fn(() => {
      open = true;
      return Promise.resolve();
    }),
    quit: vi.fn(() => {
      open = false;
      return Promise.resolve();
    }),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  };

  return {
    client,
    reset() {
      open = false;
      client.connect.mockClear();
      client.quit.mockClear();
      client.get.mockClear();
      client.set.mockClear();
      client.del.mockClear();
    },
  };
});

vi.mock("redis", () => ({
  createClient: vi.fn(() => redisMock.client),
}));

describe("API Redis lifecycle", () => {
  beforeEach(() => {
    redisMock.reset();
  });

  it("opens Redis when the app is built and closes it when the app closes", async () => {
    const app = await buildApp(testAppConfig());

    expect(redisMock.client.connect).toHaveBeenCalledTimes(1);
    expect(redisMock.client.isOpen).toBe(true);
    expect(redisMock.client.quit).not.toHaveBeenCalled();

    await app.close();

    expect(redisMock.client.quit).toHaveBeenCalledTimes(1);
    expect(redisMock.client.isOpen).toBe(false);
  });
});
