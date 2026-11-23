import assert from "node:assert/strict";
import test from "node:test";
import { chartFocusHref, formatChartPrice, parseYahooSearch, priceSourceNote, storageSymbol } from "../lib/chart-markets.ts";
import { chartSignalSchema, johannesburgToday, signalGuides } from "../lib/chart-signal.ts";
import { parseYahooGoldChart } from "../lib/gold-candles.ts";
import { summarizeTrades, tradePoints } from "../lib/student-trades.ts";

test("buy wins when price rises and sell wins when price falls", () => {
  assert.equal(tradePoints({ direction: "buy", entryPrice: 100, exitPrice: 110 }), 10);
  assert.equal(tradePoints({ direction: "sell", entryPrice: 100, exitPrice: 90 }), 10);
  assert.equal(tradePoints({ direction: "buy", entryPrice: 100, exitPrice: null }), null);
});

test("win rate ignores open trades and uses closed results only", () => {
  const summary = summarizeTrades([
    {
      id: "1",
      direction: "buy",
      entryPrice: 2300,
      exitPrice: 2310,
      stopLoss: 2290,
      size: 0.1,
      openedOn: "2026-11-01",
      closedOn: "2026-11-01",
      notes: null,
    },
    {
      id: "2",
      direction: "sell",
      entryPrice: 2320,
      exitPrice: 2330,
      stopLoss: null,
      size: null,
      openedOn: "2026-11-02",
      closedOn: "2026-11-02",
      notes: null,
    },
    {
      id: "3",
      direction: "buy",
      entryPrice: 2300,
      exitPrice: null,
      stopLoss: 2290,
      size: null,
      openedOn: "2026-11-03",
      closedOn: null,
      notes: null,
    },
  ]);

  assert.equal(summary.closed, 2);
  assert.equal(summary.open, 1);
  assert.equal(summary.wins, 1);
  assert.equal(summary.losses, 1);
  assert.equal(summary.winRate, 50);
  assert.equal(summary.netPoints, 0);
  assert.equal(summary.averageR, 1);
});

test("gold candle parser skips incomplete Yahoo bars", () => {
  const candles = parseYahooGoldChart({
    chart: {
      result: [
        {
          timestamp: [100, 200],
          indicators: {
            quote: [{ open: [1, null], high: [2, 4], low: [0.5, 3], close: [1.5, 3.5] }],
          },
        },
      ],
    },
  });
  assert.deepEqual(candles, [{ time: 100, open: 1, high: 2, low: 0.5, close: 1.5 }]);
});

test("daily analysis uses the Johannesburg calendar day and signal lines", () => {
  assert.equal(johannesburgToday(new Date("2026-11-12T21:30:00Z")), "2026-11-12");
  assert.equal(johannesburgToday(new Date("2026-11-12T22:30:00Z")), "2026-11-13");
  const parsed = chartSignalSchema.parse({
    direction: "buy",
    entry: 4000,
    stop: 3990,
    target: 4020,
    note: "Watch the high",
  });
  assert.deepEqual(
    signalGuides(parsed).map((guide) => guide.title),
    ["Buy", "Stop", "Target"],
  );
  assert.equal(chartSignalSchema.safeParse({ direction: "buy", entry: 0, stop: 1, target: 2, note: "" }).success, false);
});

test("markets keep gold as XAUUSD and accept Yahoo symbols", () => {
  assert.equal(storageSymbol("gc=f"), "XAUUSD");
  assert.equal(storageSymbol("XAUUSD"), "XAUUSD");
  assert.equal(storageSymbol("EURUSD=X"), "EURUSD");
  assert.equal(storageSymbol("AAPL"), "AAPL");
  assert.equal(storageSymbol("not a symbol"), null);
  assert.equal(formatChartPrice(4075.714), "4075.71");
  assert.equal(formatChartPrice(1.08432), "1.08432");
  assert.match(priceSourceNote("XAUUSD"), /COMEX futures/);
  assert.equal(
    chartFocusHref("/student/charts?portal=pasii", "EURUSD", "2026-11-12", true),
    "/student/charts?portal=pasii&symbol=EURUSD&date=2026-11-12&view=daily",
  );
  assert.deepEqual(
    parseYahooSearch({
      quotes: [
        { symbol: "EURUSD=X", shortname: "EUR/USD", quoteType: "CURRENCY" },
        { symbol: "M6E=F", shortname: "Euro FX", quoteType: "FUTURE" },
        { symbol: "EURUSD=X", shortname: "EUR/USD", quoteType: "CURRENCY" },
        { symbol: "noise", quoteType: "OPTION" },
      ],
    }),
    [
      { symbol: "EURUSD", label: "EUR/USD" },
      { symbol: "M6E=F", label: "Euro FX" },
    ],
  );
});
