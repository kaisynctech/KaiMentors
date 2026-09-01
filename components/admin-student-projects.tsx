"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createProject,
  updateProject,
  deleteProject,
  togglePublished,
  toggleFeatured,
} from "@/app/admin/student-projects/actions";

const CATEGORIES = [
  { value: "web-app", label: "Web App" },
  { value: "ai-agent", label: "AI Agent" },
  { value: "automation", label: "Automation" },
  { value: "mobile-app", label: "Mobile App" },
  { value: "other", label: "Other" },
];

interface Project {
  id: string;
  title: string;
  student_name: string;
  description: string | null;
  category: string;
  live_url: string | null;
  github_url: string | null;
  thumbnail_url: string | null;
  tools: string[];
  featured: boolean;
  published: boolean;
  created_at: string;
}

function ProjectForm({
  initial,
  onSubmit,
  onCancel,
  loading,
}: {
  initial?: Partial<Project>;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
      style={{ display: "grid", gap: "0.75rem", maxWidth: 560 }}
    >
      <label style={lbl}>
        Title *
        <input name="title" required defaultValue={initial?.title ?? ""} style={inp} />
      </label>
      <label style={lbl}>
        Student name *
        <input name="student_name" required defaultValue={initial?.student_name ?? ""} style={inp} />
      </label>
      <label style={lbl}>
        Category *
        <select name="category" required defaultValue={initial?.category ?? "web-app"} style={inp}>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </label>
      <label style={lbl}>
        Description
        <textarea name="description" rows={3} defaultValue={initial?.description ?? ""} style={{ ...inp, resize: "vertical" }} />
      </label>
      <label style={lbl}>
        Live URL
        <input name="live_url" type="url" placeholder="https://…" defaultValue={initial?.live_url ?? ""} style={inp} />
      </label>
      <label style={lbl}>
        GitHub URL
        <input name="github_url" type="url" placeholder="https://github.com/…" defaultValue={initial?.github_url ?? ""} style={inp} />
      </label>
      <label style={lbl}>
        Thumbnail URL
        <input name="thumbnail_url" type="url" placeholder="https://… (image link)" defaultValue={initial?.thumbnail_url ?? ""} style={inp} />
      </label>
      <label style={lbl}>
        Tools used <span style={{ color: "#888", fontSize: "0.78rem" }}>(comma-separated)</span>
        <input name="tools" placeholder="ChatGPT, n8n, Vercel" defaultValue={(initial?.tools ?? []).join(", ")} style={inp} />
      </label>
      <div style={{ display: "flex", gap: "1.5rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
          <input type="checkbox" name="published" defaultChecked={initial?.published ?? false} />
          Publish immediately
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
          <input type="checkbox" name="featured" defaultChecked={initial?.featured ?? false} />
          Feature on homepage
        </label>
      </div>
      <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
        <button type="submit" className="btn primary" disabled={loading} style={{ opacity: loading ? 0.6 : 1 }}>
          {loading ? "Saving…" : "Save project"}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export function AdminStudentProjects({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function refresh() { router.refresh(); }

  function handleCreate(fd: FormData) {
    startTransition(async () => {
      await createProject(fd);
      setShowForm(false);
      refresh();
    });
  }

  function handleUpdate(id: string, fd: FormData) {
    startTransition(async () => {
      await updateProject(id, fd);
      setEditing(null);
      refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteProject(id);
      setConfirmDelete(null);
      refresh();
    });
  }

  function handleTogglePublished(id: string, current: boolean) {
    startTransition(async () => { await togglePublished(id, current); refresh(); });
  }

  function handleToggleFeatured(id: string, current: boolean) {
    startTransition(async () => { await toggleFeatured(id, current); refresh(); });
  }

  const categoryLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ margin: 0, color: "var(--muted)" }}>{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
        {!showForm && !editing && (
          <button className="btn primary" onClick={() => setShowForm(true)}>+ New project</button>
        )}
      </div>

      {/* New project form */}
      {showForm && (
        <div className="card" style={{ padding: "1.5rem" }}>
          <h3 style={{ marginTop: 0 }}>New project</h3>
          <ProjectForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} loading={isPending} />
        </div>
      )}

      {/* Project rows */}
      {projects.length === 0 && !showForm && (
        <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
          No projects yet. Click &ldquo;New project&rdquo; to post the first one.
        </div>
      )}

      {projects.map((p) => (
        <div key={p.id} className="card" style={{ padding: "1.25rem", display: "grid", gap: "0.75rem" }}>
          {editing?.id === p.id ? (
            <>
              <h3 style={{ marginTop: 0 }}>Edit project</h3>
              <ProjectForm
                initial={p}
                onSubmit={(fd) => handleUpdate(p.id, fd)}
                onCancel={() => setEditing(null)}
                loading={isPending}
              />
            </>
          ) : (
            <>
              {/* Top row */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                {p.thumbnail_url && (
                  <img src={p.thumbnail_url} alt={p.title} style={{ width: 80, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <strong>{p.title}</strong>
                    <span style={badge("var(--surface-2)", "var(--muted)")}>{categoryLabel(p.category)}</span>
                    {p.published && <span style={badge("#0e4a2e", "#4ade80")}>Published</span>}
                    {p.featured && <span style={badge("#3b2000", "#f59e0b")}>Featured</span>}
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
                    {p.student_name} · {new Date(p.created_at).toLocaleDateString()}
                  </div>
                  {p.description && <p style={{ margin: "0.3rem 0 0", fontSize: "0.88rem" }}>{p.description}</p>}
                  {p.tools.length > 0 && (
                    <div style={{ marginTop: "0.3rem", display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                      {p.tools.map((t) => <span key={t} style={badge("var(--surface-2)", "var(--muted)")}>{t}</span>)}
                    </div>
                  )}
                  <div style={{ marginTop: "0.4rem", display: "flex", gap: "1rem", fontSize: "0.82rem" }}>
                    {p.live_url && <a href={p.live_url} target="_blank" rel="noopener" style={{ color: "var(--cyan)" }}>Live ↗</a>}
                    {p.github_url && <a href={p.github_url} target="_blank" rel="noopener" style={{ color: "var(--muted)" }}>GitHub ↗</a>}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                <button className="btn ghost" style={{ fontSize: "0.8rem", padding: "4px 12px" }} onClick={() => setEditing(p)}>Edit</button>
                <button
                  className="btn ghost"
                  style={{ fontSize: "0.8rem", padding: "4px 12px" }}
                  disabled={isPending}
                  onClick={() => handleTogglePublished(p.id, p.published)}
                >
                  {p.published ? "Unpublish" : "Publish"}
                </button>
                <button
                  className="btn ghost"
                  style={{ fontSize: "0.8rem", padding: "4px 12px" }}
                  disabled={isPending}
                  onClick={() => handleToggleFeatured(p.id, p.featured)}
                >
                  {p.featured ? "Unfeature" : "Feature"}
                </button>
                {confirmDelete === p.id ? (
                  <>
                    <button className="btn" style={{ fontSize: "0.8rem", padding: "4px 12px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }} disabled={isPending} onClick={() => handleDelete(p.id)}>
                      Confirm delete
                    </button>
                    <button className="btn ghost" style={{ fontSize: "0.8rem", padding: "4px 12px" }} onClick={() => setConfirmDelete(null)}>Cancel</button>
                  </>
                ) : (
                  <button className="btn ghost" style={{ fontSize: "0.8rem", padding: "4px 12px", color: "#dc2626" }} onClick={() => setConfirmDelete(p.id)}>Delete</button>
                )}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.88rem", fontWeight: 500 };
const inp: React.CSSProperties = { padding: "0.45rem 0.65rem", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "var(--surface-2)", color: "inherit", fontSize: "0.9rem", width: "100%", boxSizing: "border-box" };
function badge(bg: string, color: string): React.CSSProperties {
  return { background: bg, color, borderRadius: 4, padding: "1px 7px", fontSize: "0.74rem", fontWeight: 600, whiteSpace: "nowrap" };
}
