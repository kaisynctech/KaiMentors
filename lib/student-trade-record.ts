import { z } from "zod";
import { storageSymbol } from "@/lib/chart-markets";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const tradeInputSchema = z
  .object({
    traderId: z.string().uuid(),
    symbol: z.string().trim().max(24).optional(),
    direction: z.enum(["buy", "sell"]),
    entryPrice: z.number().positive().max(10_000_000),
    exitPrice: z.number().positive().max(10_000_000).nullable().optional(),
    stopLoss: z.number().positive().max(10_000_000).nullable().optional(),
    size: z.number().positive().max(1000).nullable().optional(),
    openedOn: date,
    closedOn: date.nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const closedOn = value.exitPrice != null && !value.closedOn ? value.openedOn : value.closedOn;
    if (closedOn && closedOn < value.openedOn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The close date cannot be before the open date.",
        path: ["closedOn"],
      });
    }
  });

export function tradeRow(input: z.infer<typeof tradeInputSchema>, studentUserId: string) {
  const exitPrice = input.exitPrice ?? null;
  return {
    trader_id: input.traderId,
    student_user_id: studentUserId,
    symbol: storageSymbol(input.symbol ?? "") ?? "XAUUSD",
    direction: input.direction,
    entry_price: input.entryPrice,
    exit_price: exitPrice,
    stop_loss: input.stopLoss ?? null,
    size: input.size ?? null,
    opened_on: input.openedOn,
    closed_on: exitPrice == null ? null : input.closedOn || input.openedOn,
    notes: input.notes?.trim() ? input.notes.trim() : null,
  };
}

export function presentTrade(row: {
  id: string;
  symbol?: string | null;
  direction: string;
  entry_price: number | string;
  exit_price: number | string | null;
  stop_loss: number | string | null;
  size: number | string | null;
  opened_on: string;
  closed_on: string | null;
  notes: string | null;
}) {
  return {
    id: row.id,
    symbol: row.symbol ?? "XAUUSD",
    direction: row.direction,
    entryPrice: Number(row.entry_price),
    exitPrice: row.exit_price == null ? null : Number(row.exit_price),
    stopLoss: row.stop_loss == null ? null : Number(row.stop_loss),
    size: row.size == null ? null : Number(row.size),
    openedOn: row.opened_on,
    closedOn: row.closed_on,
    notes: row.notes,
  };
}
