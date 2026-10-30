import WebSocket from "ws";

const REST = "https://fapi.binance.com";
const WS = "wss://fstream.binance.com/ws";
const MAX_TRADES = 2000;
const MAX_DEPTH_LEVELS = 100;
const MAX_HEATMAP_POINTS = 240;
const SNAPSHOT_INTERVAL_MS = 5000;

function serviceError(message, statusCode = 502) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getDepthSnapshot(symbol) {
  const response = await fetch(`${REST}/fapi/v1/depth?symbol=${symbol}&limit=1000`, {
    signal: AbortSignal.timeout(10000)
  });
  const payload = await response.json();
  if (!response.ok) throw serviceError(payload?.msg || "Binance depth snapshot failed.");
  return payload;
}

function numericLevels(levels) {
  return (levels || []).map(([price, quantity]) => ({
    price: Number(price),
    quantity: Number(quantity),
    notional: Number(price) * Number(quantity)
  })).filter((level) => Number.isFinite(level.price) && Number.isFinite(level.quantity) && level.quantity > 0);
}

export function createLiquidityService(logger, database) {
  const sessions = new Map();
  let stopped = false;
  const insertTrade = database.prepare("INSERT OR IGNORE INTO market_agg_trades (symbol, trade_id, price, quantity, quote_volume, side, trade_time) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const updateCvdState = database.prepare("INSERT INTO market_cvd_state (symbol, cumulative_delta, buy_quote_volume, sell_quote_volume, last_trade_id, last_trade_time, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(symbol) DO UPDATE SET cumulative_delta = excluded.cumulative_delta, buy_quote_volume = excluded.buy_quote_volume, sell_quote_volume = excluded.sell_quote_volume, last_trade_id = excluded.last_trade_id, last_trade_time = excluded.last_trade_time, updated_at = CURRENT_TIMESTAMP");
  const insertSnapshot = database.prepare("INSERT INTO market_liquidity_snapshots (symbol, last_update_id, captured_at, bids_json, asks_json) VALUES (?, ?, ?, ?, ?)");
  const loadCvdState = database.prepare("SELECT * FROM market_cvd_state WHERE symbol = ?");
  const loadTrades = database.prepare("SELECT trade_id AS tradeId, price, quantity, quote_volume AS quoteVolume, side, trade_time AS timestamp FROM market_agg_trades WHERE symbol = ? ORDER BY trade_time DESC, trade_id DESC LIMIT ?");
  const loadSnapshots = database.prepare("SELECT captured_at AS timestamp, last_update_id AS lastUpdateId, bids_json, asks_json FROM market_liquidity_snapshots WHERE symbol = ? ORDER BY captured_at DESC LIMIT ?");
  const cleanupOldHistory = database.prepare("DELETE FROM market_liquidity_snapshots WHERE captured_at < ?");
  const cleanupOldTrades = database.prepare("DELETE FROM market_agg_trades WHERE trade_time < ?");
  const persistTrade = database.transaction((session, point) => {
    const inserted = insertTrade.run(session.symbol, point.tradeId, point.price, point.quantity, point.quoteVolume, point.side, point.timestamp);
    if (inserted.changes === 0) return false;
    if (point.side === "buy") { session.buyVolume += point.quoteVolume; session.cvd += point.quoteVolume; }
    else { session.sellVolume += point.quoteVolume; session.cvd -= point.quoteVolume; }
    updateCvdState.run(session.symbol, session.cvd, session.buyVolume, session.sellVolume, point.tradeId, point.timestamp);
    return true;
  });
  let lastCleanupAt = 0;

  function createSession(symbol) {
    const session = {
      symbol,
      aggSocket: null,
      depthSocket: null,
      aggReconnectTimer: null,
      depthReconnectTimer: null,
      snapshotTimer: null,
      snapshotBusy: false,
      depthReady: false,
      lastUpdateId: 0,
      depthBuffer: [],
      bids: new Map(),
      asks: new Map(),
      trades: [],
      cvd: 0,
      buyVolume: 0,
      sellVolume: 0,
      lastTradeAt: null,
      lastDepthAt: null,
      heatmap: [],
      startedAt: new Date().toISOString()
    };
    const savedState = loadCvdState.get(symbol);
    if (savedState) {
      session.cvd = Number(savedState.cumulative_delta);
      session.buyVolume = Number(savedState.buy_quote_volume);
      session.sellVolume = Number(savedState.sell_quote_volume);
      session.lastTradeAt = savedState.last_trade_time ? new Date(savedState.last_trade_time).toISOString() : null;
    }
    session.trades = loadTrades.all(symbol, MAX_TRADES).reverse().map((trade) => ({ ...trade, tradeId: Number(trade.tradeId), timestamp: Number(trade.timestamp) }));
    session.heatmap = loadSnapshots.all(symbol, MAX_HEATMAP_POINTS).reverse().map((point) => ({ timestamp: Number(point.timestamp), lastUpdateId: Number(point.lastUpdateId), bids: JSON.parse(point.bids_json), asks: JSON.parse(point.asks_json) }));
    sessions.set(symbol, session);
    connectAggTrades(session);
    connectDepth(session);
    session.snapshotTimer = setInterval(() => {
      if (session.depthReady) captureHeatmap(session);
    }, SNAPSHOT_INTERVAL_MS);
    session.snapshotTimer.unref?.();
    return session;
  }

  function getSession(symbol) {
    const normalized = String(symbol || "").toUpperCase();
    if (!/^[A-Z0-9_]{3,30}$/.test(normalized)) {
      throw serviceError("Invalid futures symbol.", 400);
    }
    return sessions.get(normalized) || createSession(normalized);
  }

  function scheduleReconnect(session, kind) {
    const timerKey = kind === "agg" ? "aggReconnectTimer" : "depthReconnectTimer";
    if (stopped || session[timerKey]) return;
    session[timerKey] = setTimeout(() => {
      session[timerKey] = null;
      if (kind === "agg") connectAggTrades(session);
      else connectDepth(session);
    }, 3000);
    session[timerKey].unref?.();
  }

  function connectAggTrades(session) {
    if (stopped) return;
    const socket = new WebSocket(`${WS}/${session.symbol.toLowerCase()}@aggTrade`);
    session.aggSocket = socket;

    socket.on("message", (raw) => {
      try {
        const trade = JSON.parse(raw.toString());
        const price = Number(trade.p);
        const quantity = Number(trade.q);
        if (!(price > 0) || !(quantity > 0)) return;

        // Binance "m" means buyer is maker, therefore the aggressive side is sell.
        const side = trade.m ? "sell" : "buy";
        const quoteVolume = price * quantity;
        const point = { tradeId: Number(trade.a), price, quantity, quoteVolume, side, timestamp: Number(trade.T) };
        if (!persistTrade(session, point)) return;
        session.trades.push(point);
        if (session.trades.length > MAX_TRADES) session.trades.splice(0, session.trades.length - MAX_TRADES);
        session.lastTradeAt = new Date(trade.T).toISOString();
      } catch (error) {
        logger.warn({ err: error, symbol: session.symbol }, "Invalid Binance aggTrade event");
      }
    });
    socket.on("error", (error) => logger.warn({ err: error, symbol: session.symbol }, "aggTrade stream error"));
    socket.on("close", () => {
      if (session.aggSocket === socket) session.aggSocket = null;
      if (!stopped) scheduleReconnect(session, "agg");
    });
  }

  function applyDepthEvent(session, event) {
    const applySide = (map, updates) => {
      for (const [priceText, quantityText] of updates || []) {
        const price = Number(priceText);
        const quantity = Number(quantityText);
        if (!(price > 0) || !Number.isFinite(quantity)) continue;
        if (quantity === 0) map.delete(price);
        else map.set(price, quantity);
      }
    };
    applySide(session.bids, event.b);
    applySide(session.asks, event.a);
    session.lastUpdateId = event.u;
    session.lastDepthAt = new Date(event.E || Date.now()).toISOString();
  }

  function connectDepth(session) {
    if (stopped) return;
    session.depthReady = false;
    session.depthBuffer = [];
    const socket = new WebSocket(`${WS}/${session.symbol.toLowerCase()}@depth@100ms`);
    session.depthSocket = socket;

    socket.on("message", async (raw) => {
      let event;
      try {
        event = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!Number.isInteger(event.U) || !Number.isInteger(event.u)) return;

      if (!session.depthReady) {
        session.depthBuffer.push(event);
        if (session.depthBuffer.length > 5000) session.depthBuffer.shift();
        if (!session.snapshotBusy) await synchronizeDepth(session, socket);
        return;
      }

      // pu links consecutive diff events; a gap invalidates the local book.
      if (event.pu !== undefined && event.pu !== session.lastUpdateId) {
        session.depthReady = false;
        session.depthBuffer = [event];
        if (!session.snapshotBusy) await synchronizeDepth(session, socket);
        return;
      }
      if (event.u <= session.lastUpdateId) return;
      if (event.U > session.lastUpdateId + 1) {
        session.depthReady = false;
        session.depthBuffer = [event];
        if (!session.snapshotBusy) await synchronizeDepth(session, socket);
        return;
      }
      applyDepthEvent(session, event);
    });

    socket.on("error", (error) => logger.warn({ err: error, symbol: session.symbol }, "Depth stream error"));
    socket.on("close", () => {
      if (session.depthSocket === socket) session.depthSocket = null;
      session.depthReady = false;
      if (!stopped) scheduleReconnect(session, "depth");
    });
  }

  async function synchronizeDepth(session, socket) {
    session.snapshotBusy = true;
    try {
      const snapshot = await getDepthSnapshot(session.symbol);
      if (socket !== session.depthSocket || socket.readyState !== WebSocket.OPEN) return;

      session.bids = new Map(numericLevels(snapshot.bids).map((x) => [x.price, x.quantity]));
      session.asks = new Map(numericLevels(snapshot.asks).map((x) => [x.price, x.quantity]));
      session.lastUpdateId = snapshot.lastUpdateId;

      // Discard buffered events already represented by the snapshot.
      session.depthBuffer = session.depthBuffer.filter((event) => event.u > session.lastUpdateId);
      const first = session.depthBuffer[0];
      if (!first || !(first.U <= session.lastUpdateId + 1 && first.u >= session.lastUpdateId + 1)) {
        session.depthReady = false;
        session.depthBuffer = [];
        // A fresh stream is required when the snapshot and buffered sequence do not bridge.
        socket.close();
        return;
      }

      for (const event of session.depthBuffer) {
        if (event.u <= session.lastUpdateId) continue;
        if (event.U > session.lastUpdateId + 1) {
          session.depthReady = false;
          socket.close();
          return;
        }
        applyDepthEvent(session, event);
      }
      session.depthBuffer = [];
      session.depthReady = true;
      captureHeatmap(session);
    } catch (error) {
      logger.warn({ err: error, symbol: session.symbol }, "Order book snapshot synchronization failed");
      if (socket === session.depthSocket) socket.close();
    } finally {
      session.snapshotBusy = false;
    }
  }

  function sortedBook(session) {
    const bids = [...session.bids.entries()]
      .map(([price, quantity]) => ({ price, quantity, notional: price * quantity }))
      .sort((a, b) => b.price - a.price)
      .slice(0, MAX_DEPTH_LEVELS);
    const asks = [...session.asks.entries()]
      .map(([price, quantity]) => ({ price, quantity, notional: price * quantity }))
      .sort((a, b) => a.price - b.price)
      .slice(0, MAX_DEPTH_LEVELS);
    return { bids, asks };
  }

  function captureHeatmap(session) {
    const { bids, asks } = sortedBook(session);
    const point = {
      timestamp: Date.now(),
      lastUpdateId: session.lastUpdateId,
      bids: bids.slice(0, 40).map(({ price, quantity }) => [price, quantity]),
      asks: asks.slice(0, 40).map(({ price, quantity }) => [price, quantity])
    };
    session.heatmap.push(point);
    if (session.heatmap.length > MAX_HEATMAP_POINTS) session.heatmap.shift();
    insertSnapshot.run(session.symbol, point.lastUpdateId, point.timestamp, JSON.stringify(point.bids), JSON.stringify(point.asks));
    if (point.timestamp - lastCleanupAt > 60 * 60 * 1000) {
      const cutoff = point.timestamp - 7 * 24 * 60 * 60 * 1000;
      cleanupOldHistory.run(cutoff);
      cleanupOldTrades.run(cutoff);
      lastCleanupAt = point.timestamp;
    }
  }

  function getCvd(symbol, limit = 200) {
    const session = getSession(symbol);
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), MAX_TRADES);
    const trades = loadTrades.all(session.symbol, safeLimit).reverse().map((trade) => ({ ...trade, tradeId: Number(trade.tradeId), timestamp: Number(trade.timestamp) }));
    const delta = trades.reduce((sum, trade) => sum + (trade.side === "buy" ? trade.quoteVolume : -trade.quoteVolume), 0);
    return {
      symbol: session.symbol,
      source: "binance_aggTrade",
      methodology: "Aggressor side inferred from Binance aggTrade buyer-is-maker flag; quote volume in USDT",
      cumulativeDeltaSinceStreamStart: session.cvd,
      buyQuoteVolumeSinceStreamStart: session.buyVolume,
      sellQuoteVolumeSinceStreamStart: session.sellVolume,
      recentDelta: delta,
      recentTradeCount: trades.length,
      lastTradeAt: session.lastTradeAt,
      trades
    };
  }

  function getOrderBook(symbol) {
    const session = getSession(symbol);
    const { bids, asks } = sortedBook(session);
    const bidNotional = bids.reduce((sum, level) => sum + level.notional, 0);
    const askNotional = asks.reduce((sum, level) => sum + level.notional, 0);
    return {
      symbol: session.symbol,
      synchronized: session.depthReady,
      lastUpdateId: session.lastUpdateId || null,
      lastUpdateAt: session.lastDepthAt,
      bids,
      asks,
      bidNotional,
      askNotional,
      bidAskNotionalRatio: askNotional > 0 ? bidNotional / askNotional : null,
      source: "binance_diff_depth_100ms"
    };
  }

  function getLiquidityHeatmap(symbol, limit = 120) {
    const session = getSession(symbol);
    const safeLimit = Math.min(Math.max(Number(limit) || 120, 1), MAX_HEATMAP_POINTS);
    return {
      symbol: session.symbol,
      source: "binance_diff_depth_100ms",
      synchronized: session.depthReady,
      unit: "base_asset_quantity",
      points: loadSnapshots.all(session.symbol, safeLimit).reverse().map((point) => ({ timestamp: Number(point.timestamp), lastUpdateId: Number(point.lastUpdateId), bids: JSON.parse(point.bids_json), asks: JSON.parse(point.asks_json) })),
      retention: "7 days",
      note: "Depth snapshots are stored in SQLite and retained for up to seven days."
    };
  }

  function getStatus() {
    return {
      trackedSymbols: sessions.size,
      symbols: [...sessions.values()].map((session) => ({
        symbol: session.symbol,
        aggTradeConnected: session.aggSocket?.readyState === WebSocket.OPEN,
        depthConnected: session.depthSocket?.readyState === WebSocket.OPEN,
        orderBookSynchronized: session.depthReady,
        bufferedDepthEvents: session.depthBuffer.length,
        recentTrades: session.trades.length,
        heatmapPoints: session.heatmap.length
      }))
    };
  }

  function close() {
    stopped = true;
    for (const session of sessions.values()) {
      if (session.aggReconnectTimer) clearTimeout(session.aggReconnectTimer);
      if (session.depthReconnectTimer) clearTimeout(session.depthReconnectTimer);
      if (session.snapshotTimer) clearInterval(session.snapshotTimer);
      session.aggSocket?.removeAllListeners();
      session.depthSocket?.removeAllListeners();
      session.aggSocket?.close();
      session.depthSocket?.close();
    }
    sessions.clear();
  }

  return { getCvd, getOrderBook, getLiquidityHeatmap, getStatus, close };
}
