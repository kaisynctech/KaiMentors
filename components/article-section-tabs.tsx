"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type { GoldBrief } from "@/lib/fxstreet-gold";

export function ArticleSectionTabs({
  notes,
  notesLabel,
  news,
}: {
  notes: ReactNode;
  notesLabel: string;
  news?: ReactNode;
}) {
  const [tab, setTab] = useState<"notes" | "news">("notes");

  if (!news) return <div>{notes}</div>;

  return (
    <div>
      <div role="tablist" aria-label="Articles" style={tabListStyle}>
        <TabButton selected={tab === "notes"} onClick={() => setTab("notes")}>
          {notesLabel}
        </TabButton>
        <TabButton selected={tab === "news"} onClick={() => setTab("news")}>
          News
        </TabButton>
      </div>
      <div role="tabpanel" hidden={tab !== "notes"}>
        {notes}
      </div>
      <div role="tabpanel" hidden={tab !== "news"}>
        {news}
      </div>
    </div>
  );
}

function TabButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        borderBottom: `2px solid ${selected ? "#111314" : "transparent"}`,
        marginBottom: -1,
        padding: "0.55rem 1.1rem",
        fontSize: "0.9rem",
        fontWeight: 650,
        color: selected ? "inherit" : "var(--muted)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function GoldNewsPanel({ gold }: { gold: Pick<GoldBrief, "items" | "sourceUrl"> }) {
  return (
    <section style={cardStyle}>
      <p style={eyebrowStyle}>FXStreet</p>
      <h2 style={{ margin: "0.35rem 0 0", fontSize: "1.25rem" }}>What FXStreet is reporting</h2>
      {gold.items.length > 0 ? (
        <ul style={{ margin: "0.9rem 0 0", paddingLeft: "1.1rem", display: "grid", gap: "0.7rem" }}>
          {gold.items.map((item) => (
            <li key={item.url}>
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                {item.title}
              </a>
              {item.summary ? <p style={{ margin: "0.2rem 0 0", color: "var(--muted)" }}>{item.summary}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: "0.9rem 0 0", color: "var(--muted)" }}>
          FXStreet did not return a gold update just now. Their coverage is still one click away.
        </p>
      )}
      <a href={gold.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: "0.9rem" }}>
        Read gold coverage on FXStreet
      </a>
    </section>
  );
}

const tabListStyle: CSSProperties = {
  display: "flex",
  gap: "0.25rem",
  borderBottom: "1px solid var(--border)",
  marginBottom: "1.25rem",
};

const cardStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "1rem",
  maxWidth: 680,
  background: "white",
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--muted)",
};
