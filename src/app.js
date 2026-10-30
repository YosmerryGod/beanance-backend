import Fastify from "fastify";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { OAuth2Client } from "google-auth-library";
import { registerRoutes } from "./routes/index.js";
import { createDatabase } from "./db/index.js";
import { createAuthService } from "./modules/auth/auth.service.js";
import { createEmailSender } from "./modules/auth/email.service.js";
import { createWalletService } from "./modules/wallet/wallet.service.js";
import { createExchangeService } from "./modules/exchanges/exchange.service.js";
import { createMarketService } from "./modules/market/market.service.js";

export async function buildApp(config) {
  const fastify = Fastify({
    logger: {
      level: config.nodeEnv === "production" ? "info" : "debug"
    },
    trustProxy: config.nodeEnv === "production"
  });

  const database = createDatabase(config.databasePath);
  const googleClient = new OAuth2Client(config.googleClientId || undefined);
  const emailSender = config.emailSender || createEmailSender(config);

  fastify.decorate("database", database);
  // Test configurations may omit encryption keys; production loadConfig requires both keys.
  const walletEncryptionKey = config.walletEncryptionKey || (config.nodeEnv === "production" ? "" : "11".repeat(32));
  const exchangeEncryptionKey = config.exchangeEncryptionKey || (config.nodeEnv === "production" ? "" : "22".repeat(32));
  fastify.decorate("walletService", createWalletService(database, walletEncryptionKey));
  fastify.decorate("exchangeService", createExchangeService(database, exchangeEncryptionKey));
  // Public Binance Futures market data runs independently of user exchange credentials.
  const marketService = createMarketService(fastify.log, database);
  fastify.decorate("marketService", marketService);
  fastify.addHook("onReady", async () => marketService.start());
  fastify.addHook("onClose", async () => marketService.close());
  fastify.decorate(
    "authService",
    createAuthService(
      database,
      googleClient,
      config.googleClientId,
      emailSender,
      config.jwtSecret
    )
  );

  fastify.addHook("onClose", async () => {
    database.close();
  });

  await fastify.register(helmet);
  await fastify.register(jwt, {
    secret: config.jwtSecret
  });
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
