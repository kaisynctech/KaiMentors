"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createMarketArticle,
  deleteMarketArticle,
  updateMarketArticle,
} from "@/app/dashboard/articles/actions";
import { ArticleSectionTabs, GoldNewsPanel } from "@/components/article-section-tabs";
import type { GoldBrief } from "@/lib/fxstreet-gold";
import type { MarketArticle } from "@/lib/market-articles";

function ArticleForm({
  initial,
  onSubmit,
  onCancel,
  loading,
}: {
  initial?: Partial<MarketArticle>;
  onSubmit: (formData: FormData) => void;
  onCancel?: () => void;
  loading: boolean;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
      }}
      style={{ display: "grid", gap: "0.75rem", maxWidth: 680 }}
    >
      <label style={labelStyle}>
        Title
        <input name="title" required minLength={3} maxLength={160} defaultValue={initial?.title ?? ""} style={inputStyle} />
      </label>
      <label style={labelStyle}>
        What happened yesterday
        <textarea name="yesterday" required rows={5} defaultValue={initial?.yesterday ?? ""} style={inputStyle} />
      </label>
      <label style={labelStyle}>
        What we are watching today
        <textarea name="today" required rows={5} defaultValue={initial?.today ?? ""} style={inputStyle} />
      </label>
      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.9rem" }}>
        <input type="checkbox" name="published" defaultChecked={initial?.published ?? true} />
        Publish on the website and in the student portal
      </label>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Saving…" : initial?.id ? "Save note" : "Post note"}
        </button>
        {onCancel ? (
          <button className="btn ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function MentorMarketArticles({
  articles,
  gold,
  notesLabel,
}: {
  articles: MarketArticle[];
  gold?: Pick<GoldBrief, "items" | "sourceUrl"> | null;
  notesLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        setEditing(null);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not save the note.");
      }
    });
  }

  return (
    <ArticleSectionTabs
      notesLabel={notesLabel}
      notes={
        <div style={{ display: "grid", gap: "1.5rem" }}>
      <p style={{ maxWidth: 680, color: "var(--muted)", fontSize: "0.92rem", lineHeight: 1.5 }}>
        {gold
          ? `Write the morning note in your own words. Published notes appear on the website under ${notesLabel}. The News tab is the FXStreet gold brief, and those articles stay on FXStreet.`
          : "Write the article in your own words. Published articles appear on the website and in the student portal."}
      </p>
      {error ? <p style={{ color: "#dc2626" }}>{error}</p> : null}
      <ArticleForm
        loading={isPending}
        onSubmit={(formData) => run(() => createMarketArticle(formData))}
      />
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {articles.map((article) => (
          <article key={article.id} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "1rem" }}>
            {editing === article.id ? (
              <ArticleForm
                initial={article}
                loading={isPending}
                onCancel={() => setEditing(null)}
                onSubmit={(formData) => run(() => updateMarketArticle(article.id, formData))}
              />
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                  <strong>{article.title}</strong>
                  <span style={article.published ? badge("#14532d", "#86efac") : badge("#3f3f46", "#d4d4d8")}>
                    {article.published ? "Published" : "Draft"}
                  </span>
                </div>
                <p style={{ margin: "0.6rem 0 0.2rem", fontSize: "0.8rem", color: "var(--muted)" }}>Yesterday</p>
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{article.yesterday}</p>
                <p style={{ margin: "0.6rem 0 0.2rem", fontSize: "0.8rem", color: "var(--muted)" }}>Today</p>
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{article.today}</p>
                <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.8rem" }}>
                  <button className="btn ghost" type="button" onClick={() => setEditing(article.id)}>Edit</button>
                  {confirmDelete === article.id ? (
                    <>
                      <button className="btn" type="button" disabled={isPending} onClick={() => run(() => deleteMarketArticle(article.id))}>
                        Confirm delete
                      </button>
                      <button className="btn ghost" type="button" onClick={() => setConfirmDelete(null)}>Cancel</button>
                    </>
                  ) : (
                    <button className="btn ghost" type="button" onClick={() => setConfirmDelete(article.id)}>Delete</button>
                  )}
                </div>
              </>
            )}
          </article>
        ))}
      </div>
        </div>
      }
      news={gold ? <GoldNewsPanel gold={gold} /> : undefined}
    />
  );
}

const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.88rem", fontWeight: 500 };
const inputStyle: React.CSSProperties = { padding: "0.45rem 0.65rem", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "var(--surface-2)", color: "inherit", fontSize: "0.9rem", width: "100%", boxSizing: "border-box" };
function badge(background: string, color: string): React.CSSProperties {
  return { background, color, borderRadius: 4, padding: "1px 7px", fontSize: "0.74rem", fontWeight: 600 };
}
