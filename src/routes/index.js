import { healthRoutes } from "./health.js";
import { registerAuthModule } from "../modules/auth/index.js";
import { walletRoutes } from "../modules/wallet/wallet.routes.js";
import { exchangeRoutes } from "../modules/exchanges/exchange.routes.js";
import { marketRoutes } from "../modules/market/market.routes.js";

export async function registerRoutes(fastify) {
  await fastify.register(healthRoutes, { prefix: "/api/v1" });
  await fastify.register(registerAuthModule, { prefix: "/api/v1" });
  await fastify.register(walletRoutes, { prefix: "/api/v1/wallets" });
  await fastify.register(exchangeRoutes, { prefix: "/api/v1/exchanges" });
  // Public Binance USD-M Futures market endpoints.
  await fastify.register(marketRoutes, { prefix: "/api/v1/market" });
}
