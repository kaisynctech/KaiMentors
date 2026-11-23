export type TradeDirection = "buy" | "sell";

export type JournalTrade = {
  id: string;
  symbol?: string;
  direction: TradeDirection;
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  size: number | null;
  openedOn: string;
  closedOn: string | null;
  notes: string | null;
};

export type TradeSummary = {
  open: number;
  closed: number;
  wins: number;
  losses: number;
  flat: number;
  winRate: number | null;
  netPoints: number;
  averagePoints: number | null;
  averageR: number | null;
};

function roundPoints(value: number) {
  return Math.round(value * 100) / 100;
}

/** Points in the trade's favour. Buy wins when price rises. Sell wins when price falls. */
export function tradePoints(trade: {
  direction: TradeDirection;
  entryPrice: number;
  exitPrice: number | null;
}): number | null {
  if (trade.exitPrice == null) return null;
  const raw =
    trade.direction === "buy"
      ? trade.exitPrice - trade.entryPrice
      : trade.entryPrice - trade.exitPrice;
  return roundPoints(raw);
}

export function tradeR(trade: {
  direction: TradeDirection;
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
}): number | null {
  const points = tradePoints(trade);
  if (points == null || trade.stopLoss == null) return null;
  const risk = Math.abs(trade.entryPrice - trade.stopLoss);
  if (risk < 0.01) return null;
  return Math.round((points / risk) * 100) / 100;
}

export function summarizeTrades(trades: JournalTrade[]): TradeSummary {
  const closed = trades
    .map((trade) => ({ trade, points: tradePoints(trade), r: tradeR(trade) }))
    .filter((row) => row.points != null);
  const wins = closed.filter((row) => row.points! > 0);
  const losses = closed.filter((row) => row.points! < 0);
  const flat = closed.filter((row) => row.points === 0);
  const net = closed.reduce((sum, row) => sum + row.points!, 0);
  const rValues = closed.map((row) => row.r).filter((value): value is number => value != null);
  const rNet = rValues.reduce((sum, value) => sum + value, 0);

  return {
    open: trades.length - closed.length,
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    flat: flat.length,
    winRate: closed.length ? Math.round((wins.length / closed.length) * 1000) / 10 : null,
    netPoints: roundPoints(net),
    averagePoints: closed.length ? roundPoints(net / closed.length) : null,
    averageR: rValues.length ? Math.round((rNet / rValues.length) * 100) / 100 : null,
  };
}
