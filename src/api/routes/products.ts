import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  errorResponseSchema,
  productsResponseSchema,
  requestHeadersSchema,
} from "../schemas/http.js";
import { AppError, toErrorEnvelope } from "../../shared/errors.js";
import type { ListProductsResult } from "../../modules/catalog/application/list-products.js";

export interface ProductsListExecutor {
  execute(): Promise<ListProductsResult>;
}

export interface ProductsRouteDependencies {
  readonly listProducts: ProductsListExecutor;
}

export const productsRouteSchema = {
  headers: requestHeadersSchema,
  response: {
    200: productsResponseSchema,
    204: z.void(),
    503: errorResponseSchema,
  },
};

export function createProductsHandler(dependencies: ProductsRouteDependencies) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await dependencies.listProducts.execute();

      if (result.status === 204) {
        reply.status(204);
        return undefined;
      }

      reply.header("x-catalog-source", result.source);
      reply.status(200);
      return [...result.products];
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError("CATALOG_UNAVAILABLE", "Catalog is temporarily unavailable", 503);

      reply.status(appError.httpStatus);
      return toErrorEnvelope(appError, request.id);
    }
  };
}
