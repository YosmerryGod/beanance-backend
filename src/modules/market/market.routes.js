export async function marketRoutes(fastify) {
  const market = fastify.marketService;

  // Public market overview built from the cached Binance 24-hour Futures tickers.
  fastify.get("/overview", async () => {
    const snapshot = market.listMarkets({ limit: 1500, offset: 0, sort: "volume" });
    const markets = snapshot.markets;
    const byVolume = [...markets].sort(
      (a, b) => Number(b.quoteVolume) - Number(a.quoteVolume)
    );

    return {
      exchange: "binance",
      market: "usdm_futures",
      totalMarkets: snapshot.total,
      topByVolume: byVolume.slice(0, 10),
      topGainers: [...markets]
        .sort((a, b) => Number(b.priceChangePercent) - Number(a.priceChangePercent))
        .slice(0, 10),
      topLosers: [...markets]
        .sort((a, b) => Number(a.priceChangePercent) - Number(b.priceChangePercent))
        .slice(0, 10),
      marketStatus: market.getStatus()
    };
  });

  // Public paginated market list with search and sorting.
  fastify.get("/markets", {
    schema: {
      querystring: {
        type: "object",
        additionalProperties: false,
        properties: {
          search: { type: "string", maxLength: 30 },
          sort: {
            type: "string",
            enum: ["volume", "change", "change_desc", "price"],
            default: "volume"
          },
          limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
          offset: { type: "integer", minimum: 0, maximum: 100000, default: 0 }
        }
      }
    }
  }, async (request) => market.listMarkets(request.query));

  // Public ticker detail for one USDT-M perpetual symbol.
  fastify.get("/markets/:symbol", {
    schema: {
      params: {
        type: "object",
        required: ["symbol"],
        properties: {
          symbol: { type: "string", minLength: 3, maxLength: 30, pattern: "^[A-Za-z0-9_]+$" }
        }
      }
    }
  }, async (request) => ({
    market: market.getMarket(request.params.symbol)
  }));

  // Public OHLCV candles. The service validates supported Binance intervals.
  fastify.get("/markets/:symbol/klines", {
    schema: {
      params: {
        type: "object",
        required: ["symbol"],
        properties: {
          symbol: { type: "string", minLength: 3, maxLength: 30, pattern: "^[A-Za-z0-9_]+$" }
        }
      },
      querystring: {
        type: "object",
        additionalProperties: false,
        required: ["interval"],
        properties: {
          interval: { type: "string", minLength: 2, maxLength: 3 },
          limit: { type: "integer", minimum: 1, maximum: 1500, default: 500 }
        }
      }
    }
  }, async (request) => market.getKlines(
    request.params.symbol,
    request.query.interval,
    request.query.limit
  ));

  // Public diagnostics for the upstream market data connection.
  fastify.get("/status", async () => market.getStatus());
}
