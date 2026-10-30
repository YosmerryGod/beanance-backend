import WebSocket from "ws";

const BINANCE_FUTURES_REST = "https://fapi.binance.com";
const BINANCE_FUTURES_MARKET_WS = "wss://fstream.binance.com/market/stream?streams=!ticker@arr";
const DEFAULT_KLINE_LIMIT = 500;
const MAX_KLINE_LIMIT = 1500;
const ALLOWED_INTERVALS = new Set([
  "1m", "3m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M"
]);

function createServiceError(message, statusCode, code = undefined) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code !== undefined) error.binanceCode = code;
  return error;
}

function normalizeTicker(ticker) {
  return {
    symbol: ticker.s,
    price: ticker.c,
    priceChange: ticker.p,
    priceChangePercent: ticker.P,
    weightedAveragePrice: ticker.w,
    openPrice: ticker.o,
    highPrice: ticker.h,
    lowPrice: ticker.l,
    baseVolume: ticker.v,
    quoteVolume: ticker.q,
    openTime: ticker.O,
    closeTime: ticker.C,
    tradeCount: ticker.n,
    eventTime: ticker.E
  };
}

export function createMarketService(logger) {
  const markets = new Map();
  const activeSymbols = new Set();

  let socket = null;
  let reconnectTimer = null;
  let refreshTimer = null;
  let stopped = false;
  let socketConnected = false;
  let lastMessageAt = null;
  let lastRestSyncAt = null;

  async function binanceGet(path, params = {}) {
    const query = new URLSearchParams(params);
    const url = `${BINANCE_FUTURES_REST}${path}${query.size ? `?${query}` : ""}`;

    let response;

    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000)
      });
    } catch {
      throw createServiceError("Binance Futures is temporarily unreachable.", 502);
    }

    let payload;

    try {
      payload = await response.json();
    } catch {
      throw createServiceError("Binance returned an invalid response.", 502);
    }

    if (!response.ok) {
      throw createServiceError(
        payload?.msg || "Binance Futures market request failed.",
        response.status >= 500 ? 502 : 400,
        payload?.code
      );
    }

    return payload;
  }

  async function syncExchangeInfo() {
    const info = await binanceGet("/fapi/v1/exchangeInfo");

    activeSymbols.clear();

    for (const item of info.symbols || []) {
      if (
        item.status === "TRADING" &&
        item.contractType === "PERPETUAL" &&
        item.quoteAsset === "USDT"
      ) {
        activeSymbols.add(item.symbol);
      }
    }
  }

  async function syncAllTickers() {
    const tickers = await binanceGet("/fapi/v1/ticker/24hr");

    for (const ticker of tickers) {
      if (activeSymbols.has(ticker.symbol)) {
        markets.set(ticker.symbol, normalizeTicker(ticker));
      }
    }

    lastRestSyncAt = new Date().toISOString();
  }

  async function refreshSnapshot() {
    await syncExchangeInfo();
    await syncAllTickers();
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectTickerStream();
    }, 3000);

    reconnectTimer.unref?.();
  }

  function connectTickerStream() {
    if (stopped) return;

    try {
      socket = new WebSocket(BINANCE_FUTURES_MARKET_WS, {
        handshakeTimeout: 10000
      });
    } catch (error) {
      logger.error({ err: error }, "Could not create Binance market WebSocket");
      scheduleReconnect();
      return;
    }

    socket.on("open", () => {
      socketConnected = true;
      logger.info("Connected to Binance USD-M Futures market stream");
    });

    socket.on("message", (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString());
        const payload = message.data;

        if (!Array.isArray(payload)) return;

        const receivedAt = new Date().toISOString();

        for (const ticker of payload) {
          if (!activeSymbols.has(ticker.s)) continue;

          markets.set(ticker.s, {
            ...normalizeTicker(ticker),
            receivedAt
          });
        }

        lastMessageAt = receivedAt;
      } catch (error) {
        logger.warn({ err: error }, "Ignored invalid Binance market stream message");
      }
    });

    socket.on("error", (error) => {
      logger.warn({ err: error }, "Binance market WebSocket error");
    });

    socket.on("close", () => {
      socketConnected = false;
      socket = null;
      if (!stopped) {
        logger.warn("Binance market WebSocket disconnected; reconnecting");
        scheduleReconnect();
      }
    });
  }

  async function start() {
    stopped = false;

    try {
      await refreshSnapshot();
      logger.info(
        { symbols: activeSymbols.size },
        "Loaded Binance USD-M Futures market snapshot"
      );
    } catch (error) {
      logger.error({ err: error }, "Initial Binance market snapshot failed");
    }

    connectTickerStream();

    // Refresh metadata and REST snapshot periodically as a recovery fallback.
    refreshTimer = setInterval(async () => {
      try {
        await refreshSnapshot();
      } catch (error) {
        logger.warn({ err: error }, "Binance market REST refresh failed");
      }
    }, 5 * 60 * 1000);

    refreshTimer.unref?.();
  }

  function listMarkets({ search = "", sort = "volume", limit = 100, offset = 0 } = {}) {
    const normalizedSearch = search.trim().toUpperCase();

    let result = [...markets.values()];

    if (normalizedSearch) {
      result = result.filter((item) => item.symbol.includes(normalizedSearch));
    }

    if (sort === "change") {
      result.sort((a, b) => Number(b.priceChangePercent) - Number(a.priceChangePercent));
    } else if (sort === "change_desc") {
      result.sort((a, b) => Number(a.priceChangePercent) - Number(b.priceChangePercent));
    } else if (sort === "price") {
      result.sort((a, b) => Number(b.price) - Number(a.price));
    } else {
      result.sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume));
    }

    return {
      total: result.length,
      limit,
      offset,
      markets: result.slice(offset, offset + limit)
    };
  }

  function getMarket(symbol) {
    const market = markets.get(symbol.toUpperCase());

    if (!market) {
      throw createServiceError("Futures market symbol not found.", 404);
    }

    return market;
  }

  async function getKlines(symbol, interval, limit = DEFAULT_KLINE_LIMIT) {
    const normalizedSymbol = symbol.toUpperCase();

    if (!activeSymbols.has(normalizedSymbol)) {
      throw createServiceError("Futures market symbol not found.", 404);
    }

    if (!ALLOWED_INTERVALS.has(interval)) {
      throw createServiceError("Unsupported candle interval.", 400);
    }

    const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_KLINE_LIMIT, 1), MAX_KLINE_LIMIT);
    const rows = await binanceGet("/fapi/v1/klines", {
      symbol: normalizedSymbol,
      interval,
      limit: String(safeLimit)
    });

    return {
      symbol: normalizedSymbol,
      interval,
      candles: rows.map((row) => ({
        openTime: row[0],
        open: row[1],
        high: row[2],
        low: row[3],
        close: row[4],
        volume: row[5],
        closeTime: row[6],
        quoteVolume: row[7],
        tradeCount: row[8],
        takerBuyBaseVolume: row[9],
        takerBuyQuoteVolume: row[10]
      }))
    };
  }

  async function getFuturesAnalytics(symbol, period = "5m", limit = 30) {
    const normalizedSymbol = symbol.toUpperCase();
    if (!activeSymbols.has(normalizedSymbol)) {
      throw createServiceError("Futures market symbol not found.", 404);
    }

    const allowedPeriods = new Set(["5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d"]);
    if (!allowedPeriods.has(period)) {
      throw createServiceError("Unsupported analytics period.", 400);
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 500);
    const params = { symbol: normalizedSymbol, period, limit: String(safeLimit) };

    const [premium, openInterest, openInterestHistory, globalLongShort, takerRatio, depth] =
      await Promise.all([
        binanceGet("/fapi/v1/premiumIndex", { symbol: normalizedSymbol }),
        binanceGet("/fapi/v1/openInterest", { symbol: normalizedSymbol }),
        binanceGet("/futures/data/openInterestHist", params),
        binanceGet("/futures/data/globalLongShortAccountRatio", params),
        binanceGet("/futures/data/takerlongshortRatio", params),
        binanceGet("/fapi/v1/depth", { symbol: normalizedSymbol, limit: "100" })
      ]);

    const currentTicker = markets.get(normalizedSymbol) || null;
    const bids = (depth.bids || []).map(([price, quantity]) => ({
      price: Number(price), quantity: Number(quantity), notional: Number(price) * Number(quantity)
    }));
    const asks = (depth.asks || []).map(([price, quantity]) => ({
      price: Number(price), quantity: Number(quantity), notional: Number(price) * Number(quantity)
    }));

    const bidNotional = bids.reduce((sum, item) => sum + item.notional, 0);
    const askNotional = asks.reduce((sum, item) => sum + item.notional, 0);

    return {
      symbol: normalizedSymbol,
      period,
      ticker: currentTicker,
      markPrice: premium.markPrice,
      indexPrice: premium.indexPrice,
      estimatedSettlePrice: premium.estimatedSettlePrice,
      lastFundingRate: premium.lastFundingRate,
      nextFundingTime: premium.nextFundingTime,
      openInterest: {
        quantity: openInterest.openInterest,
        timestamp: openInterest.time
      },
      openInterestHistory,
      globalLongShortAccountRatio: globalLongShort,
      takerBuySellRatio: takerRatio,
      orderBook: {
        lastUpdateId: depth.lastUpdateId,
        bids,
        asks,
        bidNotional,
        askNotional,
        bidAskNotionalRatio: askNotional === 0 ? null : bidNotional / askNotional,
        note: "REST depth snapshot; not a synchronized diff-depth order book"
      }
    };
  }

  function getStatus() {
    return {
      exchange: "binance",
      market: "usdm_futures",
      websocketConnected: socketConnected,
      marketCount: activeSymbols.size,
      cachedTickerCount: markets.size,
      lastMessageAt,
      lastRestSyncAt
    };
  }

  function close() {
    stopped = true;

    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (refreshTimer) clearInterval(refreshTimer);

    reconnectTimer = null;
    refreshTimer = null;

    if (socket) {
      socket.removeAllListeners();
      socket.close();
      socket = null;
    }

    socketConnected = false;
  }

  return {
    start,
    close,
    listMarkets,
    getMarket,
    getKlines,
    getFuturesAnalytics,
    getStatus
  };
}
