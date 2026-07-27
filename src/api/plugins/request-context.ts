import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";

export function requestContextHook(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  const correlationHeader = request.headers["x-correlation-id"];
  const correlationId =
    typeof correlationHeader === "string" && correlationHeader.length > 0
      ? correlationHeader
      : crypto.randomUUID();

  const contextualRequest = request as FastifyRequest & { log: FastifyRequest["log"] };
  contextualRequest.log = request.log.child({ requestId: request.id, correlationId });

  reply.header("x-request-id", request.id);
  reply.header("x-correlation-id", correlationId);
  done();
}
