"use client";

import { useState } from "react";
import { formatChartPrice, marketLabel } from "@/lib/chart-markets";
import { formatAnalysisDate, signalGuides } from "@/lib/chart-signal";
import { GoldDesk, type ChartPacket } from "./gold-desk";
import type { TradeSeed } from "./trade-journal";
import styles from "./gold-desk.module.css";

export type ChartFocus = { symbol: string; date: string | null };

function SignalCard({
  packet,
  onLog,
}: {
  packet: ChartPacket | null;
  onLog?: (packet: ChartPacket) => void;
}) {
  if (!packet) {
    return (
      <section className={styles.signal}>
        <p className={styles.eyebrow}>Daily analysis</p>
        <p className={styles.empty}>Loading the analysis…</p>
      </section>
    );
  }
  const { date, signal, symbol } = packet;
  return (
    <section className={styles.signal}>
      <p className={styles.eyebrow}>
        {date ? `${marketLabel(symbol)} · ${formatAnalysisDate(date)}` : "Daily analysis"}
      </p>
      {!date ? <p className={styles.empty}>Your mentor has not posted an analysis yet.</p> : null}
      {date && !signal ? <p className={styles.empty}>No signal on this day.</p> : null}
      {signal ? (
        <>
          <strong className={signal.direction === "buy" ? styles.buy : styles.sell}>
            {signal.direction === "buy" ? "Buy" : "Sell"} {marketLabel(symbol)}
          </strong>
          <p className={styles.meta}>
            Entry {formatChartPrice(signal.entry)} · Stop {formatChartPrice(signal.stop)} · Target {formatChartPrice(signal.target)}
          </p>
          {signal.note ? <p className={styles.intro}>{signal.note}</p> : null}
          {onLog ? (
            <button onClick={() => onLog(packet)} type="button">
              Log this trade
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function DailyAnalysis({
  traderId,
  focus,
  onLog,
}: {
  traderId: string;
  focus: ChartFocus | null;
  onLog: (packet: ChartPacket) => void;
}) {
  const [packet, setPacket] = useState<ChartPacket | null>(null);

  return (
    <div className={styles.panel}>
      <SignalCard onLog={onLog} packet={packet} />
      <GoldDesk
        embedded
        guides={signalGuides(packet?.signal)}
        initialDate={focus?.date}
        initialSymbol={focus?.symbol}
        mode="readonly"
        onPacket={setPacket}
        traderId={traderId}
      />
    </div>
  );
}

export function StudentLiveChart({
  traderId,
  focus = null,
  openDaily = false,
}: {
  traderId: string;
  focus?: ChartFocus | null;
  openDaily?: boolean;
}) {
  const [tab, setTab] = useState<"mine" | "daily">(openDaily ? "daily" : "mine");
  const [seed, setSeed] = useState<TradeSeed | null>(null);

  function logSignal(packet: ChartPacket) {
    if (!packet.signal || !packet.date) return;
    const note = [marketLabel(packet.symbol), `target ${formatChartPrice(packet.signal.target)}`, packet.signal.note]
      .filter(Boolean)
      .join(". ")
      .slice(0, 500);
    setSeed({
      key: `${packet.symbol}|${packet.date}|${packet.signal.entry}|${Date.now()}`,
      symbol: packet.symbol,
      direction: packet.signal.direction,
      entry: packet.signal.entry,
      stop: packet.signal.stop,
      openedOn: packet.date,
      notes: note,
    });
    setTab("mine");
  }

  return (
    <div className={styles.desk}>
      <div>
        <p className={styles.eyebrow}>Live chart</p>
        <h1>Live chart</h1>
        <p className={styles.intro}>
          My chart keeps your own marks for each market and each day. Daily analysis is your mentor&apos;s
          chart. Older days stay until someone deletes them.
        </p>
      </div>
      <div className={styles.group} role="tablist">
        <button
          aria-selected={tab === "mine"}
          className={tab === "mine" ? styles.active : ""}
          onClick={() => setTab("mine")}
          role="tab"
          type="button"
        >
          My chart
        </button>
        <button
          aria-selected={tab === "daily"}
          className={tab === "daily" ? styles.active : ""}
          onClick={() => setTab("daily")}
          role="tab"
          type="button"
        >
          Daily analysis
        </button>
      </div>
      {tab === "mine" ? (
        <GoldDesk embedded onSeedApplied={() => setSeed(null)} tradeSeed={seed} traderId={traderId} />
      ) : (
        <DailyAnalysis focus={focus} onLog={logSignal} traderId={traderId} />
      )}
    </div>
  );
}
