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

  reply.header("x-request-id", request.id);
  reply.header("x-correlation-id", correlationId);
  done();
}
