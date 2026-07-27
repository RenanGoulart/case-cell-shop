import amqplib, { type ChannelModel, type ConfirmChannel, type Options } from "amqplib";

import type { OrderProcessingMessage } from "../../worker/schemas/order-processing-message.js";

export const orderProcessingExchange = "casecellshop.order-processing";
export const orderProcessingQueue = "casecellshop.order-processing.queue";
export const orderProcessingDlq = "casecellshop.order-processing.dlq";
export const orderProcessingRoutingKey = "order.process";

export interface RabbitMqAdapter {
  readonly connection: ChannelModel;
  readonly channel: ConfirmChannel;
  close(): Promise<void>;
}

export interface OrderProcessingPublishInput {
  readonly eventId: string;
  readonly correlationId: string;
}

export interface RabbitMqReturnFrame {
  readonly replyCode: number;
}

export function buildOrderProcessingPublishOptions(
  input: OrderProcessingPublishInput,
): Options.Publish {
  return {
    persistent: true,
    mandatory: true,
    contentType: "application/json",
    messageId: input.eventId,
    correlationId: input.correlationId,
  };
}

export function isUnroutablePublish(frame: RabbitMqReturnFrame): boolean {
  return frame.replyCode === 312;
}

export class RabbitMqOrderPublisher {
  public constructor(private readonly channel: ConfirmChannel) {}

  public async publish(message: OrderProcessingMessage): Promise<void> {
    const returnedMessages: RabbitMqReturnFrame[] = [];
    const returned = (returnedMessage: RabbitMqReturnFrame) => {
      returnedMessages.push(returnedMessage);
    };

    this.channel.once("return", returned);

    const accepted = this.channel.publish(
      orderProcessingExchange,
      orderProcessingRoutingKey,
      Buffer.from(JSON.stringify(message)),
      buildOrderProcessingPublishOptions({
        eventId: message.eventId,
        correlationId: message.correlationId,
      }),
    );

    if (!accepted) {
      this.channel.off("return", returned);
      throw new Error("RabbitMQ channel backpressure rejected publish");
    }

    await this.channel.waitForConfirms();
    this.channel.off("return", returned);

    if (returnedMessages.some(isUnroutablePublish)) {
      throw new Error("RabbitMQ order processing message was unroutable");
    }
  }
}

export async function createRabbitMqAdapter(rabbitMqUrl: string): Promise<RabbitMqAdapter> {
  const connection = await amqplib.connect(rabbitMqUrl);
  const channel = await connection.createConfirmChannel();

  await channel.assertExchange(orderProcessingExchange, "direct", { durable: true });
  await channel.assertQueue(orderProcessingDlq, { durable: true });
  await channel.assertQueue(orderProcessingQueue, {
    durable: true,
    deadLetterExchange: "",
    deadLetterRoutingKey: orderProcessingDlq,
  });
  await channel.bindQueue(orderProcessingQueue, orderProcessingExchange, orderProcessingRoutingKey);
  await channel.prefetch(1);

  return {
    connection,
    channel,
    async close() {
      await channel.close();
      await connection.close();
    },
  };
}
