import { describe, expect, it } from "vitest";

import {
  buildOrderProcessingPublishOptions,
  isUnroutablePublish,
} from "@/adapters/messaging/rabbitmq.js";

describe("RabbitMQ order publisher contract", () => {
  it("publishes persistent mandatory messages with correlation and message id", () => {
    expect(
      buildOrderProcessingPublishOptions({ eventId: "event-1", correlationId: "corr-1" }),
    ).toMatchObject({
      persistent: true,
      mandatory: true,
      contentType: "application/json",
      messageId: "event-1",
      correlationId: "corr-1",
    });
  });

  it("classifies mandatory returned messages as unroutable publish failures", () => {
    expect(isUnroutablePublish({ replyCode: 312 })).toBe(true);
    expect(isUnroutablePublish({ replyCode: 200 })).toBe(false);
  });
});
