export function AcademyUnavailable({ academyName }: { academyName: string }) {
  return (
    <section
      style={{
        maxWidth: "28rem",
        margin: "4rem auto",
        padding: "2rem",
        borderRadius: "1rem",
        border: "1px solid var(--border)",
        background: "var(--surface, #fff)",
        textAlign: "center",
      }}
    >
      <p className="eyebrow">{academyName}</p>
      <h1 style={{ margin: "0.5rem 0 1rem", fontSize: "1.35rem", fontWeight: 800 }}>
        Temporarily unavailable
      </h1>
      <p style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
        This academy is temporarily unavailable. Please check back later or contact your mentor.
      </p>
    </section>
  );
}
