import amqplib, { type Channel, type ChannelModel } from "amqplib";

export const orderProcessingExchange = "casecellshop.order-processing";
export const orderProcessingQueue = "casecellshop.order-processing.queue";
export const orderProcessingDlq = "casecellshop.order-processing.dlq";
export const orderProcessingRoutingKey = "order.process";

export interface RabbitMqAdapter {
  readonly connection: ChannelModel;
  readonly channel: Channel;
  close(): Promise<void>;
}

export async function createRabbitMqAdapter(rabbitMqUrl: string): Promise<RabbitMqAdapter> {
  const connection = await amqplib.connect(rabbitMqUrl);
  const channel = await connection.createChannel();

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
