import {
  studentProjectCategoryLabel,
  type StudentProject,
} from "@/lib/student-projects";

export function StudentProjectsView({ projects }: { projects: StudentProject[] }) {
  if (projects.length === 0) {
    return (
      <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
        No published projects yet.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {projects.map((project) => (
        <article key={project.id} className="card" style={{ padding: "1.25rem", display: "grid", gap: "0.5rem" }}>
          <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
            {project.thumbnail_url ? (
              // External mentor-supplied thumbnail URLs are not in the Next image domain allowlist.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={project.title}
                src={project.thumbnail_url}
                style={{ width: 96, height: 64, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
              />
            ) : null}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <strong>{project.title}</strong>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {studentProjectCategoryLabel(project.category)}
                </span>
                {project.featured ? (
                  <span style={{ fontSize: "0.75rem", color: "#f59e0b" }}>Featured</span>
                ) : null}
              </div>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                {project.student_name}
              </p>
              {project.description ? (
                <p style={{ margin: "0.4rem 0 0", fontSize: "0.9rem" }}>{project.description}</p>
              ) : null}
              <div style={{ marginTop: "0.5rem", display: "flex", gap: "1rem", fontSize: "0.85rem" }}>
                {project.live_url ? (
                  <a href={project.live_url} rel="noopener" target="_blank">
                    Live ↗
                  </a>
                ) : null}
                {project.github_url ? (
                  <a href={project.github_url} rel="noopener" target="_blank">
                    GitHub ↗
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
