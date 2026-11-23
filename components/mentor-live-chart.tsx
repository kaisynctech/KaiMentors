"use client";

import { useEffect, useState, type FormEvent } from "react";
import { marketLabel } from "@/lib/chart-markets";
import type { ChartSignal } from "@/lib/chart-signal";
import { formatAnalysisDate, signalGuides } from "@/lib/chart-signal";
import { GoldDesk, type ChartPacket } from "./gold-desk";
import styles from "./gold-desk.module.css";

type Draft = {
  direction: "buy" | "sell";
  entry: string;
  stop: string;
  target: string;
  note: string;
};

const emptyDraft: Draft = { direction: "buy", entry: "", stop: "", target: "", note: "" };

function draftFromSignal(signal: ChartSignal): Draft {
  return {
    direction: signal.direction,
    entry: String(signal.entry),
    stop: String(signal.stop),
    target: String(signal.target),
    note: signal.note,
  };
}

export function MentorLiveChart({
  traderId,
  symbol = null,
  date = null,
}: {
  traderId: string;
  symbol?: string | null;
  date?: string | null;
}) {
  const [packet, setPacket] = useState<ChartPacket | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saved, setSaved] = useState<ChartSignal | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const packetKey = packet ? `${packet.symbol}|${packet.date}|${JSON.stringify(packet.signal)}` : "";

  useEffect(() => {
    if (!packet) return;
    setSaved(packet.signal);
    setDraft(packet.signal ? draftFromSignal(packet.signal) : emptyDraft);
    setStatus("");
  }, [packetKey]);

  async function saveSignal(signal: ChartSignal | null) {
    if (!packet?.date || !packet.symbol) return;
    setSaving(true);
    setError(null);
    const response = await fetch("/api/academy/live-chart", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traderId, symbol: packet.symbol, date: packet.date, signal }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(body.error ?? "Could not save that signal.");
      return;
    }
    setSaved(body.signal ?? null);
    setStatus(signal ? "Signal saved. Students can see it on Daily analysis and the dashboard." : "Signal cleared.");
    if (!signal) setDraft(emptyDraft);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const entry = Number(draft.entry);
    const stop = Number(draft.stop);
    const target = Number(draft.target);
    if (![entry, stop, target].every((value) => Number.isFinite(value) && value > 0)) {
      setError("Entry, stop and target need a price.");
      return;
    }
    void saveSignal({
      direction: draft.direction,
      entry,
      stop,
      target,
      note: draft.note.trim(),
    });
  }

  return (
    <div className={styles.panel}>
      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.notes}>
          <p className={styles.eyebrow}>
            {packet?.date ? `${marketLabel(packet.symbol)} · ${formatAnalysisDate(packet.date)}` : "Signal"}
          </p>
          <h2>Signal</h2>
          <p className={styles.intro}>
            Pick the market and the day on the chart. Marks and this signal stay on that day until you delete it.
            Students see it on Daily analysis and on their dashboard.
          </p>
        </div>
        <label>
          Direction
          <select
            onChange={(event) =>
              setDraft((current) => ({ ...current, direction: event.target.value as Draft["direction"] }))
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
            min="0"
            onChange={(event) => setDraft((current) => ({ ...current, entry: event.target.value }))}
            required
            step="any"
            type="number"
            value={draft.entry}
          />
        </label>
        <label>
          Stop
          <input
            min="0"
            onChange={(event) => setDraft((current) => ({ ...current, stop: event.target.value }))}
            required
            step="any"
            type="number"
            value={draft.stop}
          />
        </label>
        <label>
          Target
          <input
            min="0"
            onChange={(event) => setDraft((current) => ({ ...current, target: event.target.value }))}
            required
            step="any"
            type="number"
            value={draft.target}
          />
        </label>
        <label className={styles.notes}>
          Note
          <input
            maxLength={280}
            onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
            placeholder="What you want students to watch"
            value={draft.note}
          />
        </label>
        <div className={styles.formActions}>
          <button disabled={saving || !packet?.date} type="submit">
            {saving ? "Saving…" : "Save signal"}
          </button>
          {saved ? (
            <button disabled={saving} onClick={() => void saveSignal(null)} type="button">
              Clear signal
            </button>
          ) : null}
        </div>
      </form>
      {error ? <p className={styles.error}>{error}</p> : null}
      {status ? <p className={styles.hint}>{status}</p> : null}
      <GoldDesk
        embedded
        guides={signalGuides(saved)}
        initialDate={date}
        initialSymbol={symbol}
        mode="mentor"
        onPacket={setPacket}
        traderId={traderId}
      />
    </div>
  );
}
