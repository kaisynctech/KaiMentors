"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { marketLabel } from "@/lib/chart-markets";
import type { JournalTrade, TradeDirection } from "@/lib/student-trades";
import { summarizeTrades, tradePoints } from "@/lib/student-trades";
import styles from "./gold-desk.module.css";

export type TradeSeed = {
  key: string;
  symbol: string;
  direction: TradeDirection;
  entry: number;
  stop: number;
  openedOn: string;
  notes: string;
};

type Draft = {
  symbol: string;
  direction: TradeDirection;
  entryPrice: string;
  exitPrice: string;
  stopLoss: string;
  size: string;
  openedOn: string;
  closedOn: string;
  notes: string;
};

const emptyDraft = (): Draft => ({
  symbol: "XAUUSD",
  direction: "buy",
  entryPrice: "",
  exitPrice: "",
  stopLoss: "",
  size: "",
  openedOn: new Date().toISOString().slice(0, 10),
  closedOn: "",
  notes: "",
});

function draftFromTrade(trade: JournalTrade): Draft {
  return {
    symbol: trade.symbol ?? "XAUUSD",
    direction: trade.direction,
    entryPrice: String(trade.entryPrice),
    exitPrice: trade.exitPrice == null ? "" : String(trade.exitPrice),
    stopLoss: trade.stopLoss == null ? "" : String(trade.stopLoss),
    size: trade.size == null ? "" : String(trade.size),
    openedOn: trade.openedOn,
    closedOn: trade.closedOn ?? "",
    notes: trade.notes ?? "",
  };
}

function payloadFromDraft(traderId: string, draft: Draft) {
  const numberOrNull = (value: string) => (value.trim() === "" ? null : Number(value));
  return {
    traderId,
    symbol: draft.symbol,
    direction: draft.direction,
    entryPrice: Number(draft.entryPrice),
    exitPrice: numberOrNull(draft.exitPrice),
    stopLoss: numberOrNull(draft.stopLoss),
    size: numberOrNull(draft.size),
    openedOn: draft.openedOn,
    closedOn: draft.closedOn.trim() ? draft.closedOn : null,
    notes: draft.notes.trim() ? draft.notes.trim() : null,
  };
}

export function TradeJournal({
  traderId,
  seed = null,
  onSeedApplied,
}: {
  traderId: string;
  seed?: TradeSeed | null;
  onSeedApplied?: () => void;
}) {
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fromSignal, setFromSignal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const summary = useMemo(() => summarizeTrades(trades), [trades]);

  useEffect(() => {
    if (!seed) return;
    setEditingId(null);
    setFromSignal(true);
    setDraft({
      symbol: seed.symbol,
      direction: seed.direction,
      entryPrice: String(seed.entry),
      exitPrice: "",
      stopLoss: String(seed.stop),
      size: "",
      openedOn: seed.openedOn,
      closedOn: "",
      notes: seed.notes,
    });
    onSeedApplied?.();
  }, [seed]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/student/trades?traderId=${traderId}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "Could not load your trades.");
        if (!cancelled) setTrades(body.trades ?? []);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, [traderId]);

  async function saveTrade(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const response = await fetch(
        editingId ? `/api/student/trades/${editingId}` : "/api/student/trades",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadFromDraft(traderId, draft)),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "Could not save that trade.");
        return;
      }
      const saved = body.trade as JournalTrade;
      setTrades((current) => {
        const next = current.filter((trade) => trade.id !== saved.id);
        return [saved, ...next].sort((a, b) => b.openedOn.localeCompare(a.openedOn));
      });
      setDraft(emptyDraft());
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function removeTrade(trade: JournalTrade) {
    setError(null);
    const response = await fetch(
      `/api/student/trades/${trade.id}?traderId=${traderId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not delete that trade.");
      return;
    }
    setTrades((current) => current.filter((item) => item.id !== trade.id));
    if (editingId === trade.id) {
      setEditingId(null);
      setDraft(emptyDraft());
    }
  }

  return (
    <section className={styles.journal}>
      <div>
        <p className={styles.eyebrow}>Your trades</p>
        <h2>Win rate</h2>
        <p className={styles.intro}>
          Log the trades you take. Open trades stay out of the win rate until you add an exit.
        </p>
        {fromSignal ? (
          <p className={styles.hint}>Filled from your mentor&apos;s signal. Add the exit when the trade is closed.</p>
        ) : null}
      </div>
      <div className={styles.stats}>
        <article>
          <span>Win rate</span>
          <strong>{summary.winRate == null ? "—" : `${summary.winRate}%`}</strong>
        </article>
        <article>
          <span>Closed</span>
          <strong>
            {summary.wins}W · {summary.losses}L
            {summary.flat ? ` · ${summary.flat} flat` : ""}
          </strong>
        </article>
        <article>
          <span>Net points</span>
          <strong>{summary.closed ? summary.netPoints.toFixed(2) : "—"}</strong>
        </article>
        <article>
          <span>Average R</span>
          <strong>{summary.averageR == null ? "—" : summary.averageR.toFixed(2)}</strong>
        </article>
      </div>
      <p className={styles.meta}>
        {summary.open} open · {summary.closed} closed
        {summary.averagePoints == null ? "" : ` · average ${summary.averagePoints.toFixed(2)} points`}
      </p>
      <form className={styles.form} onSubmit={saveTrade}>
        <label>
          Direction
          <select
            onChange={(event) =>
              setDraft((current) => ({ ...current, direction: event.target.value as TradeDirection }))
            }
            value={draft.direction}
          >
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </label>
        <label>
          Entry
          <input
            inputMode="decimal"
            onChange={(event) => setDraft((current) => ({ ...current, entryPrice: event.target.value }))}
            required
            step="any"
            type="number"
            value={draft.entryPrice}
          />
        </label>
        <label>
          Exit
          <input
            inputMode="decimal"
            onChange={(event) => setDraft((current) => ({ ...current, exitPrice: event.target.value }))}
            placeholder="Leave blank if open"
            step="any"
            type="number"
            value={draft.exitPrice}
          />
        </label>
        <label>
          Stop
          <input
            inputMode="decimal"
            onChange={(event) => setDraft((current) => ({ ...current, stopLoss: event.target.value }))}
            placeholder="Optional"
            step="any"
            type="number"
            value={draft.stopLoss}
          />
        </label>
        <label>
          Opened
          <input
            onChange={(event) => setDraft((current) => ({ ...current, openedOn: event.target.value }))}
            required
            type="date"
            value={draft.openedOn}
          />
        </label>
        <label>
          Closed
          <input
            onChange={(event) => setDraft((current) => ({ ...current, closedOn: event.target.value }))}
            type="date"
            value={draft.closedOn}
          />
        </label>
        <label className={styles.notes}>
          Note
          <input
            maxLength={500}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            placeholder="What you saw in the structure"
            value={draft.notes}
          />
        </label>
        <div className={styles.formActions}>
          <button disabled={saving} type="submit">
            {saving ? "Saving…" : editingId ? "Update trade" : "Add trade"}
          </button>
          {editingId ? (
            <button
              onClick={() => {
                setEditingId(null);
                setDraft(emptyDraft());
              }}
              type="button"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
      {error ? <p className={styles.error}>{error}</p> : null}
      {trades.length === 0 ? (
        <p className={styles.empty}>No trades logged yet.</p>
      ) : (
        <ul className={styles.tradeList}>
          {trades.map((trade) => {
            const points = tradePoints(trade);
            return (
              <li key={trade.id}>
                <div>
                  <strong>
                    {trade.direction === "buy" ? "Buy" : "Sell"} {marketLabel(trade.symbol ?? "XAUUSD")}
                  </strong>
                  <span>
                    {trade.openedOn}
                    {trade.exitPrice == null ? " · Open" : ` · ${points! > 0 ? "Win" : points === 0 ? "Flat" : "Loss"} ${points!.toFixed(2)}`}
                  </span>
                  <span>
                    {trade.entryPrice}
                    {trade.exitPrice == null ? "" : ` → ${trade.exitPrice}`}
                    {trade.notes ? ` · ${trade.notes}` : ""}
                  </span>
                </div>
                <div className={styles.rowActions}>
                  <button onClick={() => { setEditingId(trade.id); setDraft(draftFromTrade(trade)); }} type="button">
                    Edit
                  </button>
                  <button onClick={() => removeTrade(trade)} type="button">
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
