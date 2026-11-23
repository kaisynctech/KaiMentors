"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ChartDrawing } from "@/lib/chart-drawings";
import {
  CHART_PRICE_MAX,
  FEATURED_MARKETS,
  formatChartPrice,
  marketLabel,
  priceSourceNote,
  roundChartPrice,
  storageSymbol,
} from "@/lib/chart-markets";
import { isAnalysisDate, johannesburgToday, type ChartSignal, type SignalGuide } from "@/lib/chart-signal";
import type { IChartApi, IPriceLine, ISeriesApi, MouseEventParams, Time } from "lightweight-charts";
import { MarkPrimitive } from "./chart-mark-layer";
import { TradeJournal, type TradeSeed } from "./trade-journal";
import styles from "./gold-desk.module.css";

type Tool = "level" | "trend" | "zone" | "note";
type CandleSeries = ISeriesApi<"Candlestick", Time>;
type PendingPoint = { time: number; price: number };
type ChartMode = "student" | "mentor" | "readonly";

export type ChartPacket = {
  symbol: string;
  date: string | null;
  dates: string[];
  signal: ChartSignal | null;
};

const TOOLS: Array<{ id: Tool; label: string }> = [
  { id: "level", label: "Level" },
  { id: "trend", label: "Trend" },
  { id: "zone", label: "Zone" },
  { id: "note", label: "Note" },
];

function markLabel(mark: ChartDrawing) {
  if (mark.type === "level") return mark.label || `Level ${formatChartPrice(mark.price)}`;
  if (mark.type === "trend") return "Trend line";
  if (mark.type === "zone") return "Zone";
  return mark.text;
}

export function GoldDesk({
  traderId,
  mode = "student",
  embedded = false,
  guides = [],
  onPacket,
  initialSymbol = null,
  initialDate = null,
  tradeSeed = null,
  onSeedApplied,
}: {
  traderId: string;
  mode?: ChartMode;
  embedded?: boolean;
  guides?: SignalGuide[];
  onPacket?: (packet: ChartPacket) => void;
  initialSymbol?: string | null;
  initialDate?: string | null;
  tradeSeed?: TradeSeed | null;
  onSeedApplied?: () => void;
}) {
  const readOnly = mode === "readonly";
  const containerRef = useRef<HTMLDivElement>(null);
  const chartBundle = useRef<{
    chart: IChartApi;
    series: CandleSeries;
    primitive: MarkPrimitive;
    priceLines: IPriceLine[];
  } | null>(null);
  const toolRef = useRef<Tool>("level");
  const pendingRef = useRef<PendingPoint | null>(null);
  const guidesRef = useRef(guides);
  const onPacketRef = useRef(onPacket);
  const symbolRef = useRef(storageSymbol(initialSymbol ?? "") ?? "XAUUSD");
  const loadedDateRef = useRef<string | null>(null);
  const drawingsRef = useRef<ChartDrawing[]>([]);
  const skipSave = useRef(true);
  const skipClickRef = useRef(false);
  const freshRef = useRef(false);
  const dragRef = useRef<{ id: string; pointerId: number } | null>(null);
  const [interval, setIntervalValue] = useState<"15" | "60" | "D">("60");
  const [symbol, setSymbol] = useState(storageSymbol(initialSymbol ?? "") ?? "XAUUSD");
  const [chosenDate, setChosenDate] = useState(initialDate && isAnalysisDate(initialDate) ? initialDate : "");
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ symbol: string; label: string }>>([]);
  const [tool, setTool] = useState<Tool>("level");
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [pending, setPending] = useState<PendingPoint | null>(null);
  const [notePoint, setNotePoint] = useState<PendingPoint | null>(null);
  const [noteText, setNoteText] = useState("");
  const [levelEdits, setLevelEdits] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [priceStatus, setPriceStatus] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error" | "idle">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  toolRef.current = tool;
  pendingRef.current = pending;
  guidesRef.current = guides;
  onPacketRef.current = onPacket;
  symbolRef.current = symbol;
  loadedDateRef.current = loadedDate;
  drawingsRef.current = drawings;
  const guideKey = guides.map((guide) => `${guide.id}:${guide.price}:${guide.title}`).join("|");
  const today = johannesburgToday();
  const dayOptions = readOnly || dates.includes(today) ? dates : [today, ...dates];

  function syncMarks(next: ChartDrawing[]) {
    const bundle = chartBundle.current;
    if (!bundle) return;
    for (const line of bundle.priceLines) bundle.series.removePriceLine(line);
    const levels = next
      .filter((mark) => mark.type === "level")
      .map((mark) =>
        bundle.series.createPriceLine({
          price: mark.price,
          color: "#9a7209",
          lineWidth: 2,
          axisLabelVisible: true,
          title: mark.type === "level" ? mark.label || "Level" : "Level",
        }),
      );
    const signalLines = guidesRef.current.map((guide) =>
      bundle.series.createPriceLine({
        price: guide.price,
        color: guide.color,
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: guide.title,
      }),
    );
    bundle.priceLines = [...levels, ...signalLines];
    bundle.primitive.setDrawings(next);
  }

  function refreshPrices() {
    freshRef.current = true;
    setRefreshing(true);
    setRevision((current) => current + 1);
  }

  function nearestLevel(clientY: number) {
    const bundle = chartBundle.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!bundle || !rect) return null;
    const y = clientY - rect.top;
    let best: { id: string; dist: number } | null = null;
    for (const mark of drawingsRef.current) {
      if (mark.type !== "level") continue;
      const coord = bundle.series.priceToCoordinate(mark.price);
      if (coord == null) continue;
      const dist = Math.abs(coord - y);
      if (dist <= 12 && (!best || dist < best.dist)) best = { id: mark.id, dist };
    }
    return best?.id ?? null;
  }

  function startLevelDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (readOnly || event.button !== 0) return;
    const id = nearestLevel(event.clientY);
    if (!id) return;
    dragRef.current = { id, pointerId: event.pointerId };
    skipClickRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveLevelDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const bundle = chartBundle.current;
    if (!drag || !bundle || event.pointerId !== drag.pointerId) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const price = bundle.series.coordinateToPrice(event.clientY - rect.top);
    if (price == null || !Number.isFinite(price) || price <= 0 || price > CHART_PRICE_MAX) return;
    const rounded = roundChartPrice(price);
    setLevelEdits((current) => {
      if (!(drag.id in current)) return current;
      const next = { ...current };
      delete next[drag.id];
      return next;
    });
    setDrawings((current) =>
      current.map((mark) => (mark.type === "level" && mark.id === drag.id ? { ...mark, price: rounded } : mark)),
    );
  }

  function endLevelDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || event.pointerId !== dragRef.current.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => {
      skipClickRef.current = false;
    }, 400);
  }

  function commitLevel(id: string) {
    const raw = levelEdits[id];
    if (raw == null) return;
    const price = Number(raw);
    setLevelEdits((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (!Number.isFinite(price) || price <= 0 || price > CHART_PRICE_MAX) return;
    const rounded = roundChartPrice(price);
    setDrawings((current) =>
      current.map((mark) => (mark.type === "level" && mark.id === id ? { ...mark, price: rounded } : mark)),
    );
  }

  function chooseSymbol(next: string) {
    setPending(null);
    setResults([]);
    setQuery("");
    setChosenDate("");
    setSymbol(next);
  }

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      fetch(`/api/market/search?traderId=${encodeURIComponent(traderId)}&q=${encodeURIComponent(q)}`)
        .then((response) => response.json())
        .then((body) => {
          if (!cancelled) setResults(Array.isArray(body.markets) ? body.markets : []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, traderId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    skipSave.current = true;
    const marksPath = mode === "student" ? "/api/student/chart-markups" : "/api/academy/live-chart";
    const params = new URLSearchParams({ traderId, interval, symbol });
    if (chosenDate) params.set("date", chosenDate);
    else if (readOnly) params.set("start", "latest");

    async function load() {
      const candleParams = new URLSearchParams(params);
      if (freshRef.current) {
        candleParams.set("fresh", "1");
        freshRef.current = false;
      }
      const [{ createChart, CandlestickSeries, ColorType }, candleResponse, markResponse] =
        await Promise.all([
          import("lightweight-charts"),
          fetch(`/api/market/candles?${candleParams}`),
          fetch(`${marksPath}?${params}`),
        ]);
      if (disposed || !containerRef.current) return;

      const candleBody = await candleResponse.json().catch(() => ({}));
      const markBody = await markResponse.json().catch(() => ({}));
      if (!candleResponse.ok) {
        setRefreshing(false);
        setLoadError(candleBody.error ?? "This market is unavailable right now.");
        return;
      }
      if (!markResponse.ok) {
        setRefreshing(false);
        setLoadError(markBody.error ?? "Could not load the chart marks.");
        return;
      }

      const chart = createChart(containerRef.current, {
        autoSize: true,
        height: 480,
        layout: { background: { type: ColorType.Solid, color: "#ffffff" }, textColor: "#343a3f" },
        grid: { vertLines: { color: "#eceef0" }, horzLines: { color: "#eceef0" } },
        rightPriceScale: { borderColor: "#dce1e4" },
        timeScale: { borderColor: "#dce1e4" },
      });
      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#0f6b3c",
        downColor: "#b42318",
        borderUpColor: "#0f6b3c",
        borderDownColor: "#b42318",
        wickUpColor: "#0f6b3c",
        wickDownColor: "#b42318",
      });
      series.setData(
        (candleBody.candles ?? []).map((candle: { time: number; open: number; high: number; low: number; close: number }) => ({
          time: candle.time as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        })),
      );
      chart.timeScale().fitContent();
      const primitive = new MarkPrimitive();
      series.attachPrimitive(primitive);
      chartBundle.current = { chart, series, primitive, priceLines: [] };

      if (!readOnly) {
        chart.subscribeClick((param: MouseEventParams<Time>) => {
          if (skipClickRef.current) {
            skipClickRef.current = false;
            return;
          }
          const current = chartBundle.current;
          if (!current || !param.point || typeof param.time !== "number") return;
          const price = current.series.coordinateToPrice(param.point.y);
          if (price == null || !Number.isFinite(price)) return;
          const point = { time: param.time, price: Number(price) };
          const rounded = roundChartPrice(price);
          const activeTool = toolRef.current;

          if (activeTool === "level") {
            setDrawings((currentDrawings) => [
              ...currentDrawings,
              { id: crypto.randomUUID(), type: "level", price: rounded, label: "" },
            ]);
            return;
          }
          if (activeTool === "note") {
            setNotePoint(point);
            setNoteText("");
            return;
          }
          const previous = pendingRef.current;
          if (!previous) {
            setPending(point);
            return;
          }
          setPending(null);
          setDrawings((currentDrawings) => [
            ...currentDrawings,
            activeTool === "trend"
              ? {
                  id: crypto.randomUUID(),
                  type: "trend",
                  time1: previous.time,
                  price1: roundChartPrice(previous.price),
                  time2: point.time,
                  price2: roundChartPrice(point.price),
                }
              : {
                  id: crypto.randomUUID(),
                  type: "zone",
                  time1: previous.time,
                  price1: roundChartPrice(previous.price),
                  time2: point.time,
                  price2: roundChartPrice(point.price),
                },
          ]);
        });
      }

      const saved = Array.isArray(markBody.drawings) ? (markBody.drawings as ChartDrawing[]) : [];
      const nextDate = typeof markBody.date === "string" ? markBody.date : null;
      const nextDates = Array.isArray(markBody.dates) ? markBody.dates.filter((value: unknown) => typeof value === "string") : [];
      skipSave.current = true;
      loadedDateRef.current = nextDate;
      setLoadedDate(nextDate);
      setDates(nextDates);
      setDrawings(saved);
      syncMarks(saved);
      setLoadError(null);
      setRefreshing(false);
      setPriceStatus(
        `Updated ${new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`,
      );
      setSaveState(saved.length ? "saved" : "idle");
      onPacketRef.current?.({
        symbol,
        date: nextDate,
        dates: nextDates,
        signal: markBody.signal ?? null,
      });
    }

    load().catch(() => {
      if (!disposed) {
        setRefreshing(false);
        setLoadError("This market is unavailable right now.");
      }
    });

    return () => {
      disposed = true;
      chartBundle.current?.chart.remove();
      chartBundle.current = null;
    };
  }, [chosenDate, interval, mode, readOnly, revision, symbol, traderId]);

  useEffect(() => {
    syncMarks(drawings);
  }, [drawings, guideKey]);

  useEffect(() => {
    if (readOnly) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    const snapshot = drawings;
    const snapshotInterval = interval;
    const snapshotSymbol = symbolRef.current;
    const snapshotDate = loadedDateRef.current;
    if (!snapshotDate) return;
    const marksPath = mode === "student" ? "/api/student/chart-markups" : "/api/academy/live-chart";
    setSaveState("saving");
    const handle = window.setTimeout(async () => {
      const response = await fetch(marksPath, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          traderId,
          symbol: snapshotSymbol,
          interval: snapshotInterval,
          date: snapshotDate,
          drawings: snapshot,
        }),
      });
      setSaveState(response.ok ? "saved" : "error");
    }, 700);
    return () => window.clearTimeout(handle);
  }, [drawings]);

  function addNote() {
    if (!notePoint || !noteText.trim()) return;
    setDrawings((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type: "note",
        time: notePoint.time,
        price: roundChartPrice(notePoint.price),
        text: noteText.trim(),
      },
    ]);
    setNotePoint(null);
    setNoteText("");
  }

  async function deleteDay() {
    if (!loadedDate) return;
    const confirmed = window.confirm(
      mode === "mentor"
        ? "Delete this day's marks and signal for this market? Other days stay."
        : "Delete your marks for this day on this market? Other days stay.",
    );
    if (!confirmed) return;
    const marksPath = mode === "student" ? "/api/student/chart-markups" : "/api/academy/live-chart";
    const response = await fetch(marksPath, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traderId, symbol, date: loadedDate }),
    });
    if (!response.ok) {
      setSaveState("error");
      return;
    }
    setChosenDate("");
    setRevision((current) => current + 1);
  }

  return (
    <div className={embedded ? styles.panel : styles.desk}>
      <div className={styles.marketRow}>
        <label className={styles.dayPick}>
          Market
          <select onChange={(event) => chooseSymbol(event.target.value)} value={symbol}>
            {FEATURED_MARKETS.some((market) => market.symbol === symbol) ? null : (
              <option value={symbol}>{marketLabel(symbol)}</option>
            )}
            {FEATURED_MARKETS.map((market) => (
              <option key={market.symbol} value={market.symbol}>
                {market.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.search}>
          Search a market
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="EURUSD, AAPL, BTC"
            value={query}
          />
        </label>
        {results.length ? (
          <div className={styles.results}>
            {results.map((market) => (
              <button key={market.symbol} onClick={() => chooseSymbol(market.symbol)} type="button">
                {market.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <p className={styles.priceNote}>
        <span>{priceSourceNote(symbol)}</span>
        <button onClick={refreshPrices} type="button">
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        {priceStatus ? <span>{priceStatus}</span> : null}
      </p>
      <div className={styles.toolbar}>
        <label className={styles.dayPick}>
          Day
          <select
            onChange={(event) => {
              setPending(null);
              setChosenDate(event.target.value);
            }}
            value={chosenDate || loadedDate || ""}
          >
            {dayOptions.length === 0 ? <option value="">No saved days</option> : null}
            {dayOptions.map((day) => (
              <option key={day} value={day}>
                {day === today ? `${day} · today` : day}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.group}>
          {([
            ["15", "15m"],
            ["60", "1h"],
            ["D", "1D"],
          ] as const).map(([value, label]) => (
            <button
              className={interval === value ? styles.active : ""}
              key={value}
              onClick={() => {
                setPending(null);
                setIntervalValue(value);
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {readOnly ? null : (
          <div className={styles.group}>
            {TOOLS.map((item) => (
              <button
                className={tool === item.id ? styles.active : ""}
                key={item.id}
                onClick={() => {
                  setTool(item.id);
                  setPending(null);
                }}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        {readOnly || !loadedDate ? null : (
          <button onClick={() => void deleteDay()} type="button">
            Delete this day
          </button>
        )}
        <span className={styles.saveState}>
          {readOnly
            ? ""
            : saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                  ? "Could not save"
                  : ""}
        </span>
      </div>
      {pending ? <p className={styles.hint}>Click the second point.</p> : null}
      {notePoint ? (
        <form
          className={styles.noteForm}
          onSubmit={(event) => {
            event.preventDefault();
            addNote();
          }}
        >
          <input
            autoFocus
            maxLength={80}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder="Note at this price"
            value={noteText}
          />
          <button type="submit">Add note</button>
        </form>
      ) : null}
      {loadError ? <p className={styles.error}>{loadError}</p> : null}
      <div
        className={styles.chart}
        onPointerDown={startLevelDrag}
        onPointerMove={moveLevelDrag}
        onPointerUp={endLevelDrag}
        ref={containerRef}
      />
      <ul className={styles.marks}>
        {drawings.length === 0 ? (
          <li className={styles.empty}>
            {readOnly
              ? `No mentor marks on ${marketLabel(symbol)} for this day.`
              : `No marks on ${marketLabel(symbol)} for this day.`}
          </li>
        ) : null}
        {drawings.map((mark) => (
          <li key={mark.id}>
            {mark.type === "level" && !readOnly ? (
              <label className={styles.levelEdit}>
                Level
                <input
                  aria-label="Level price"
                  inputMode="decimal"
                  onBlur={() => commitLevel(mark.id)}
                  onChange={(event) =>
                    setLevelEdits((current) => ({ ...current, [mark.id]: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitLevel(mark.id);
                    }
                  }}
                  value={levelEdits[mark.id] ?? String(mark.price)}
                />
              </label>
            ) : (
              <span>{markLabel(mark)}</span>
            )}
            {readOnly ? null : (
              <button
                onClick={() => setDrawings((current) => current.filter((item) => item.id !== mark.id))}
                type="button"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {mode === "student" ? (
        <TradeJournal onSeedApplied={onSeedApplied} seed={tradeSeed} traderId={traderId} />
      ) : null}
    </div>
  );
}
