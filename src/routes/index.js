import { healthRoutes } from "./health.js";
import { registerAuthModule } from "../modules/auth/index.js";

export async function registerRoutes(fastify) {
  await fastify.register(healthRoutes, { prefix: "/api/v1" });
  await fastify.register(registerAuthModule, { prefix: "/api/v1" });
}
