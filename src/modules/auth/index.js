import { authRoutes } from "./auth.routes.js";

export async function registerAuthModule(fastify) {
  await fastify.register(authRoutes, { prefix: "/auth" });
}
