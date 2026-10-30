const DEFAULT_PERIODS = Object.freeze({
  rsi: 14,
  ema: 20,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  bollinger: 20,
  atr: 14
});

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function emaSeries(values, period) {
  const output = Array(values.length).fill(null);
  if (!Number.isInteger(period) || period < 1 || values.length < period) return output;

  const multiplier = 2 / (period + 1);
  let previous = average(values.slice(0, period));
  output[period - 1] = previous;

  for (let index = period; index < values.length; index += 1) {
    previous = (values[index] - previous) * multiplier + previous;
    output[index] = previous;
  }

  return output;
}

function rsiSeries(closes, period = DEFAULT_PERIODS.rsi) {
  const output = Array(closes.length).fill(null);
  if (closes.length <= period || period < 1) return output;

  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = closes[index] - closes[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  const calculate = () => {
    if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
    const relativeStrength = averageGain / averageLoss;
    return 100 - (100 / (1 + relativeStrength));
  };

  output[period] = calculate();

  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    averageGain = ((averageGain * (period - 1)) + Math.max(change, 0)) / period;
    averageLoss = ((averageLoss * (period - 1)) + Math.max(-change, 0)) / period;
    output[index] = calculate();
  }

  return output;
}

function macdSeries(closes, fastPeriod, slowPeriod, signalPeriod) {
  const fast = emaSeries(closes, fastPeriod);
  const slow = emaSeries(closes, slowPeriod);
  const macd = closes.map((_, index) => (
    fast[index] === null || slow[index] === null ? null : fast[index] - slow[index]
  ));

  const validStart = macd.findIndex((value) => value !== null);
  const signal = Array(closes.length).fill(null);

  if (validStart >= 0) {
    const compact = macd.slice(validStart).filter((value) => value !== null);
    const compactSignal = emaSeries(compact, signalPeriod);
    compactSignal.forEach((value, index) => {
      signal[validStart + index] = value;
    });
  }

  const histogram = macd.map((value, index) => (
    value === null || signal[index] === null ? null : value - signal[index]
  ));

  return { macd, signal, histogram };
}

function bollingerSeries(closes, period, multiplier = 2) {
  return closes.map((_, index) => {
    if (index + 1 < period) return null;

    const window = closes.slice(index - period + 1, index + 1);
    const middle = average(window);
    const variance = window.reduce((sum, value) => sum + ((value - middle) ** 2), 0) / period;
    const deviation = Math.sqrt(variance);

    return {
      upper: middle + (multiplier * deviation),
      middle,
      lower: middle - (multiplier * deviation),
      bandwidth: middle === 0 ? null : ((multiplier * deviation * 2) / middle) * 100
    };
  });
}

function atrSeries(candles, period) {
  const trueRanges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;

    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });

  const output = Array(candles.length).fill(null);
  if (candles.length < period || period < 1) return output;

  let current = average(trueRanges.slice(0, period));
  output[period - 1] = current;

  for (let index = period; index < candles.length; index += 1) {
    current = ((current * (period - 1)) + trueRanges[index]) / period;
    output[index] = current;
  }

  return output;
}

function vwapSeries(candles) {
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;

  return candles.map((candle) => {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativePriceVolume += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;

    return cumulativeVolume === 0 ? null : cumulativePriceVolume / cumulativeVolume;
  });
}

function orderFlowSeries(candles) {
  let cumulativeDelta = 0;

  return candles.map((candle) => {
    const totalQuoteVolume = candle.quoteVolume;
    const takerBuyQuoteVolume = candle.takerBuyQuoteVolume;

    // Binance kline taker-buy quote volume is used to estimate buyer-initiated flow.
    const buyVolume = takerBuyQuoteVolume;
    const sellVolume = Math.max(totalQuoteVolume - takerBuyQuoteVolume, 0);
    const delta = buyVolume - sellVolume;

    cumulativeDelta += delta;

    return {
      buyVolume,
      sellVolume,
      delta,
      cumulativeDelta,
      buySellRatio: sellVolume === 0 ? null : buyVolume / sellVolume
    };
  });
}

export function calculateIndicators(inputCandles, options = {}) {
  if (!Array.isArray(inputCandles) || inputCandles.length === 0) {
    const error = new Error("Candles are required to calculate indicators.");
    error.statusCode = 400;
    throw error;
  }

  const periods = {
    rsi: options.rsiPeriod ?? DEFAULT_PERIODS.rsi,
    ema: options.emaPeriod ?? DEFAULT_PERIODS.ema,
    macdFast: options.macdFast ?? DEFAULT_PERIODS.macdFast,
    macdSlow: options.macdSlow ?? DEFAULT_PERIODS.macdSlow,
    macdSignal: options.macdSignal ?? DEFAULT_PERIODS.macdSignal,
    bollinger: options.bollingerPeriod ?? DEFAULT_PERIODS.bollinger,
    atr: options.atrPeriod ?? DEFAULT_PERIODS.atr
  };

  for (const [name, value] of Object.entries(periods)) {
    if (!Number.isInteger(value) || value < 1 || value > 200) {
      const error = new Error(`${name} period must be an integer between 1 and 200.`);
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
    openTime: number(item.openTime),
    closeTime: number(item.closeTime),
    open: number(item.open),
    high: number(item.high),
    low: number(item.low),
    close: number(item.close),
    volume: number(item.volume),
    quoteVolume: number(item.quoteVolume),
    takerBuyBaseVolume: number(item.takerBuyBaseVolume),
    takerBuyQuoteVolume: number(item.takerBuyQuoteVolume)
  }));

  const closes = candles.map((item) => item.close);
  const ema = emaSeries(closes, periods.ema);
  const rsi = rsiSeries(closes, periods.rsi);
  const macd = macdSeries(closes, periods.macdFast, periods.macdSlow, periods.macdSignal);
  const bollinger = bollingerSeries(closes, periods.bollinger);
  const atr = atrSeries(candles, periods.atr);
  const vwap = vwapSeries(candles);
  const orderFlow = orderFlowSeries(candles);

  const data = candles.map((candle, index) => ({
    ...candle,
    indicators: {
      ema: ema[index],
      rsi: rsi[index],
      macd: macd.macd[index],
      macdSignal: macd.signal[index],
      macdHistogram: macd.histogram[index],
      bollinger: bollinger[index],
      atr: atr[index],
      vwap: vwap[index],
      ...orderFlow[index]
    }
  }));

  const latest = data[data.length - 1];

  return {
    count: data.length,
    periods,
    methodology: {
      rsi: "Wilder RSI",
      ema: "Exponential moving average",
      macd: "EMA fast minus EMA slow; EMA signal",
      bollinger: "Simple moving average with population standard deviation",
      atr: "Wilder smoothed true range",
      vwap: "Cumulative typical-price volume weighted average",
      cvd: "Estimated from Binance kline taker-buy quote volume; not aggressor trade-by-trade reconstruction"
    },
    latest: latest.indicators,
    candles: data
  };
}
