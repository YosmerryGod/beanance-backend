import { healthRoutes } from "./health.js";

export async function registerRoutes(fastify) {
  await fastify.register(healthRoutes, { prefix: "/api/v1" });
}
