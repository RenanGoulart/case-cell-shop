import type { ErpMode } from "../../config/env.js";
import {
  createForcedErpDecision,
  createProbabilisticErpDecision,
  type ErpDecision,
  type ErpResult,
} from "../../modules/orders/domain/erp-result.js";
import type { ErpClient } from "../../modules/orders/ports/processing-ports.js";
import type { RandomGenerator, Sleeper } from "../../shared/ports/runtime.js";
import type { OrderProcessingMessage } from "../../worker/schemas/order-processing-message.js";

export interface SimulatedErpClientOptions {
  readonly mode: ErpMode;
  readonly randomGenerator: RandomGenerator;
  readonly sleeper: Sleeper;
  readonly timeoutMs: number;
}

export class SimulatedErpClient implements ErpClient {
  private readonly decision: ErpDecision;

  public constructor(private readonly options: SimulatedErpClientOptions) {
    this.decision =
      options.mode === "probabilistic"
        ? createProbabilisticErpDecision(options.randomGenerator)
        : createForcedErpDecision(options.mode);
  }

  public async processOrder(
    message: OrderProcessingMessage,
  ): Promise<{ readonly result: ErpResult }> {
    void message;
    const result = this.decision.next();

    if (result === "timeout") {
      await this.options.sleeper.sleep(this.options.timeoutMs);
      return { result: "timeout" };
    }

    return { result };
  }
}
