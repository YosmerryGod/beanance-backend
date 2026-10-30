import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { registerRoutes } from "./routes/index.js";
import { createDatabase } from "./db/index.js";

export async function buildApp(config) {
  const fastify = Fastify({
    logger: {
      level: config.nodeEnv === "production" ? "info" : "debug"
    },
    trustProxy: config.nodeEnv === "production"
  });

  const database = createDatabase(config.databasePath);

  fastify.decorate("database", database);

  fastify.addHook("onClose", async () => {
    database.close();
  });

  await fastify.register(helmet);
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute"
  });

  await fastify.register(registerRoutes);

  fastify.setNotFoundHandler(async (request, reply) => {
    return reply.code(404).send({
      error: "Not Found",
      message: "The requested resource does not exist."
    });
  });

  fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    const statusCode = error.statusCode && error.statusCode < 500
      ? error.statusCode
      : 500;

    return reply.code(statusCode).send({
      error: statusCode === 500 ? "Internal Server Error" : error.name,
      message: statusCode === 500 ? "An unexpected error occurred." : error.message
    });
  });

  return fastify;
}
