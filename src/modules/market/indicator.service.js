const DEFAULTS = Object.freeze({
  rsi: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  bollinger: 20,
  atr: 14,
  adx: 14,
  stochastic: 14,
  stochasticSignal: 3,
  cci: 20,
  mfi: 14,
  roc: 12,
  williamsR: 14,
  supertrendMultiplier: 3
});

function n(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function sma(values, period) {
  return values.map((_, index) => index + 1 < period
    ? null
    : mean(values.slice(index - period + 1, index + 1)));
}

function ema(values, period) {
  const output = Array(values.length).fill(null);
  if (values.length < period) return output;
  let previous = mean(values.slice(0, period));
  output[period - 1] = previous;
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i += 1) {
    previous += alpha * (values[i] - previous);
    output[i] = previous;
  }
  return output;
}

function wilder(values, period) {
  const output = Array(values.length).fill(null);
  if (values.length < period) return output;
  let current = mean(values.slice(0, period));
  output[period - 1] = current;
  for (let i = period; i < values.length; i += 1) {
    current = ((current * (period - 1)) + values[i]) / period;
    output[i] = current;
  }
  return output;
}

function rsi(closes, period) {
  const gains = [];
  const losses = [];
  for (let i = 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }
  const avgGain = wilder(gains, period);
  const avgLoss = wilder(losses, period);
  const output = Array(closes.length).fill(null);
  for (let i = 0; i < avgGain.length; i += 1) {
    if (avgGain[i] === null || avgLoss[i] === null) continue;
    output[i + 1] = avgLoss[i] === 0
      ? (avgGain[i] === 0 ? 50 : 100)
      : 100 - (100 / (1 + (avgGain[i] / avgLoss[i])));
  }
  return output;
}

function macd(closes, fast, slow, signalPeriod) {
  const fastLine = ema(closes, fast);
  const slowLine = ema(closes, slow);
  const line = closes.map((_, i) => (
    fastLine[i] === null || slowLine[i] === null ? null : fastLine[i] - slowLine[i]
  ));
  const first = line.findIndex((value) => value !== null);
  const signal = Array(closes.length).fill(null);
  if (first >= 0) {
    const compact = line.slice(first).filter((value) => value !== null);
    const signalCompact = ema(compact, signalPeriod);
    signalCompact.forEach((value, i) => { signal[first + i] = value; });
  }
  return {
    line,
    signal,
    histogram: line.map((value, i) => value === null || signal[i] === null ? null : value - signal[i])
  };
}

function bollinger(closes, period, multiplier = 2) {
  return closes.map((_, i) => {
    if (i + 1 < period) return null;
    const window = closes.slice(i - period + 1, i + 1);
    const middle = mean(window);
    const variance = mean(window.map((value) => (value - middle) ** 2));
    const deviation = Math.sqrt(variance);
    const upper = middle + multiplier * deviation;
    const lower = middle - multiplier * deviation;
    return {
      upper, middle, lower,
      bandwidth: middle === 0 ? null : ((upper - lower) / middle) * 100,
      percentB: upper === lower ? null : (closes[i] - lower) / (upper - lower)
    };
  });
}

function trueRanges(candles) {
  return candles.map((candle, i) => {
    if (i === 0) return candle.high - candle.low;
    const previous = candles[i - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previous),
      Math.abs(candle.low - previous)
    );
  });
}

function atr(candles, period) {
  return wilder(trueRanges(candles), period);
}

function adx(candles, period) {
  const plusDm = Array(candles.length).fill(0);
  const minusDm = Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i += 1) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
  }
  const tr = wilder(trueRanges(candles), period);
  const plusSmoothed = wilder(plusDm.slice(1), period);
  const minusSmoothed = wilder(minusDm.slice(1), period);
  const dx = Array(candles.length).fill(null);
  for (let i = 1; i < candles.length; i += 1) {
    const trValue = tr[i];
    const plus = plusSmoothed[i - 1];
    const minus = minusSmoothed[i - 1];
    if (!trValue || plus === null || minus === null) continue;
    const plusDi = (plus / trValue) * 100;
    const minusDi = (minus / trValue) * 100;
    const denominator = plusDi + minusDi;
    dx[i] = denominator === 0 ? 0 : (Math.abs(plusDi - minusDi) / denominator) * 100;
  }
  const compactStart = dx.findIndex((value) => value !== null);
  const output = Array(candles.length).fill(null);
  if (compactStart >= 0) {
    const compact = dx.slice(compactStart).filter((value) => value !== null);
    const values = wilder(compact, period);
    values.forEach((value, i) => { output[compactStart + i] = value; });
  }
  return output;
}

function stochastic(candles, period, signalPeriod) {
  const k = candles.map((candle, i) => {
    if (i + 1 < period) return null;
    const window = candles.slice(i - period + 1, i + 1);
    const highest = Math.max(...window.map((item) => item.high));
    const lowest = Math.min(...window.map((item) => item.low));
    return highest === lowest ? 50 : ((candle.close - lowest) / (highest - lowest)) * 100;
  });
  const validStart = k.findIndex((value) => value !== null);
  const d = Array(candles.length).fill(null);
  if (validStart >= 0) {
    const compact = k.slice(validStart).filter((value) => value !== null);
    sma(compact, signalPeriod).forEach((value, i) => { d[validStart + i] = value; });
  }
  return { k, d };
}

function stochasticRsi(rsiValues, period, signalPeriod) {
  const k = rsiValues.map((value, i) => {
    if (value === null || i + 1 < period) return null;
    const window = rsiValues.slice(i - period + 1, i + 1);
    if (window.some((item) => item === null)) return null;
    const high = Math.max(...window);
    const low = Math.min(...window);
    return high === low ? 50 : ((value - low) / (high - low)) * 100;
  });
  const start = k.findIndex((value) => value !== null);
  const d = Array(k.length).fill(null);
  if (start >= 0) {
    const compact = k.slice(start).filter((value) => value !== null);
    sma(compact, signalPeriod).forEach((value, i) => { d[start + i] = value; });
  }
  return { k, d };
}

function cci(candles, period) {
  return candles.map((candle, i) => {
    if (i + 1 < period) return null;
    const typical = candles.slice(i - period + 1, i + 1)
      .map((item) => (item.high + item.low + item.close) / 3);
    const avg = mean(typical);
    const deviation = mean(typical.map((value) => Math.abs(value - avg)));
    const current = (candle.high + candle.low + candle.close) / 3;
    return deviation === 0 ? 0 : (current - avg) / (0.015 * deviation);
  });
}

function mfi(candles, period) {
  const positive = Array(candles.length).fill(0);
  const negative = Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i += 1) {
    const currentTypical = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const previousTypical = (candles[i - 1].high + candles[i - 1].low + candles[i - 1].close) / 3;
    const flow = currentTypical * candles[i].volume;
    if (currentTypical > previousTypical) positive[i] = flow;
    if (currentTypical < previousTypical) negative[i] = flow;
  }
  return candles.map((_, i) => {
    if (i < period) return null;
    const pos = positive.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    const neg = negative.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    return neg === 0 ? (pos === 0 ? 50 : 100) : 100 - (100 / (1 + pos / neg));
  });
}

function obv(candles) {
  let value = 0;
  return candles.map((candle, i) => {
    if (i > 0) {
      if (candle.close > candles[i - 1].close) value += candle.volume;
      else if (candle.close < candles[i - 1].close) value -= candle.volume;
    }
    return value;
  });
}

function vwap(candles) {
  let priceVolume = 0;
  let volume = 0;
  return candles.map((candle) => {
    const typical = (candle.high + candle.low + candle.close) / 3;
    priceVolume += typical * candle.volume;
    volume += candle.volume;
    return volume === 0 ? null : priceVolume / volume;
  });
}

function orderFlow(candles) {
  let cumulativeDelta = 0;
  return candles.map((candle) => {
    const buyVolume = candle.takerBuyQuoteVolume;
    const sellVolume = Math.max(candle.quoteVolume - buyVolume, 0);
    const delta = buyVolume - sellVolume;
    cumulativeDelta += delta;
    return {
      buyVolume, sellVolume, delta, cumulativeDelta,
      buySellRatio: sellVolume === 0 ? null : buyVolume / sellVolume,
      deltaPercent: candle.quoteVolume === 0 ? null : (delta / candle.quoteVolume) * 100
    };
  });
}

function supertrend(candles, atrValues, multiplier) {
  const output = Array(candles.length).fill(null);
  let trend = 1;
  let upperBand = null;
  let lowerBand = null;
  for (let i = 0; i < candles.length; i += 1) {
    if (atrValues[i] === null) continue;
    const midpoint = (candles[i].high + candles[i].low) / 2;
    const basicUpper = midpoint + multiplier * atrValues[i];
    const basicLower = midpoint - multiplier * atrValues[i];
    upperBand = upperBand === null || basicUpper < upperBand || candles[i - 1]?.close > upperBand
      ? basicUpper : upperBand;
    lowerBand = lowerBand === null || basicLower > lowerBand || candles[i - 1]?.close < lowerBand
      ? basicLower : lowerBand;
    if (candles[i].close > upperBand) trend = 1;
    else if (candles[i].close < lowerBand) trend = -1;
    output[i] = {
      value: trend === 1 ? lowerBand : upperBand,
      direction: trend === 1 ? "bullish" : "bearish"
    };
  }
  return output;
}

export function calculateIndicators(inputCandles, options = {}) {
  if (!Array.isArray(inputCandles) || inputCandles.length === 0) {
    const error = new Error("Candles are required to calculate indicators.");
    error.statusCode = 400;
    throw error;
  }

  const periods = {
    rsi: options.rsiPeriod ?? DEFAULTS.rsi,
    macdFast: options.macdFast ?? DEFAULTS.macdFast,
    macdSlow: options.macdSlow ?? DEFAULTS.macdSlow,
    macdSignal: options.macdSignal ?? DEFAULTS.macdSignal,
    bollinger: options.bollingerPeriod ?? DEFAULTS.bollinger,
    atr: options.atrPeriod ?? DEFAULTS.atr,
    adx: options.adxPeriod ?? DEFAULTS.adx,
    stochastic: options.stochasticPeriod ?? DEFAULTS.stochastic,
    stochasticSignal: options.stochasticSignal ?? DEFAULTS.stochasticSignal,
    cci: options.cciPeriod ?? DEFAULTS.cci,
    mfi: options.mfiPeriod ?? DEFAULTS.mfi,
    roc: options.rocPeriod ?? DEFAULTS.roc,
    williamsR: options.williamsRPeriod ?? DEFAULTS.williamsR
  };

  for (const [name, period] of Object.entries(periods)) {
    if (!Number.isInteger(period) || period < 2 || period > 200) {
      const error = new Error(`${name} period must be an integer between 2 and 200.`);
      error.statusCode = 400;
      throw error;
    }
  }
  if (periods.macdFast >= periods.macdSlow) {
    const error = new Error("MACD fast period must be lower than MACD slow period.");
    error.statusCode = 400;
    throw error;
  }

  const candles = inputCandles.map((item) => ({
    openTime: n(item.openTime), closeTime: n(item.closeTime),
    open: n(item.open), high: n(item.high), low: n(item.low),
    close: n(item.close), volume: n(item.volume),
    quoteVolume: n(item.quoteVolume),
    takerBuyBaseVolume: n(item.takerBuyBaseVolume),
    takerBuyQuoteVolume: n(item.takerBuyQuoteVolume)
  }));

  const closes = candles.map((item) => item.close);
  const rsiValues = rsi(closes, periods.rsi);
  const macdValues = macd(closes, periods.macdFast, periods.macdSlow, periods.macdSignal);
  const atrValues = atr(candles, periods.atr);
  const stoch = stochastic(candles, periods.stochastic, periods.stochasticSignal);
  const stochRsi = stochasticRsi(rsiValues, periods.stochastic, periods.stochasticSignal);
  const bands = bollinger(closes, periods.bollinger);
  const adxValues = adx(candles, periods.adx);
  const cciValues = cci(candles, periods.cci);
  const mfiValues = mfi(candles, periods.mfi);
  const obvValues = obv(candles);
  const vwapValues = vwap(candles);
  const flow = orderFlow(candles);
  const trend = supertrend(candles, atrValues, n(options.supertrendMultiplier ?? DEFAULTS.supertrendMultiplier));
  const emaPeriods = [9, 21, 50, 100, 200];
  const emaValues = Object.fromEntries(emaPeriods.map((period) => [`ema${period}`, ema(closes, period)]));
  const smaPeriods = [20, 50, 100, 200];
  const smaValues = Object.fromEntries(smaPeriods.map((period) => [`sma${period}`, sma(closes, period)]));

  const rows = candles.map((candle, i) => {
    const rocBase = closes[i - periods.roc];
    const highest = i + 1 < periods.williamsR ? null : Math.max(...candles.slice(i - periods.williamsR + 1, i + 1).map((item) => item.high));
    const lowest = i + 1 < periods.williamsR ? null : Math.min(...candles.slice(i - periods.williamsR + 1, i + 1).map((item) => item.low));
    return {
      ...candle,
      indicators: {
        ...Object.fromEntries(emaPeriods.map((period) => [`ema${period}`, emaValues[`ema${period}`][i]])),
        ...Object.fromEntries(smaPeriods.map((period) => [`sma${period}`, smaValues[`sma${period}`][i]])),
        rsi: rsiValues[i],
        macd: macdValues.line[i],
        macdSignal: macdValues.signal[i],
        macdHistogram: macdValues.histogram[i],
        bollinger: bands[i],
        atr: atrValues[i],
        atrPercent: atrValues[i] === null || candle.close === 0 ? null : (atrValues[i] / candle.close) * 100,
        adx: adxValues[i],
        stochastic: { k: stoch.k[i], d: stoch.d[i] },
        stochasticRsi: { k: stochRsi.k[i], d: stochRsi.d[i] },
        cci: cciValues[i],
        mfi: mfiValues[i],
        obv: obvValues[i],
        vwap: vwapValues[i],
        roc: i < periods.roc || rocBase === 0 ? null : ((candle.close - rocBase) / rocBase) * 100,
        momentum: i < periods.roc ? null : candle.close - rocBase,
        williamsR: highest === null || highest === lowest ? null : ((highest - candle.close) / (highest - lowest)) * -100,
        supertrend: trend[i],
        ...flow[i]
      }
    };
  });

  return {
    count: rows.length,
    periods,
    methodology: {
      rsi: "Wilder RSI",
      ema: "Exponential moving average; SMA-seeded",
      macd: "EMA fast minus EMA slow; EMA signal",
      bollinger: "SMA with population standard deviation",
      atr: "Wilder smoothed true range",
      adx: "Wilder directional movement index",
      stochastic: "%K and SMA %D",
      stochasticRsi: "Stochastic transform of Wilder RSI",
      cci: "Typical price and mean absolute deviation",
      mfi: "Money Flow Index using typical price and base volume",
      obv: "On-Balance Volume",
      vwap: "Cumulative typical-price VWAP across returned candle window",
      cvd: "Estimated from Binance kline taker-buy quote volume; not trade-by-trade aggressor reconstruction",
      supertrend: "ATR bands with direction switching",
      volumeDelta: "Taker-buy quote volume minus estimated taker-sell quote volume"
    },
    latest: rows[rows.length - 1].indicators,
    candles: rows
  };
}
