import Link from "next/link";

export function DiscordLinkCard({
  audience,
  configured,
  serverName,
  accountName,
  students,
  connectHref,
  notice,
}: {
  audience: "mentor" | "student";
  configured: boolean;
  serverName: string | null;
  accountName: string | null;
  students?: Array<{ name: string; discord: string }>;
  connectHref: string;
  notice: string | null;
}) {
  return (
    <section style={{ border: "1px solid var(--border)", borderRadius: 16, background: "white", padding: "22px 24px", marginTop: 20, maxWidth: 680 }}>
      <h2 style={{ margin: "0 0 8px", fontSize: "1.15rem" }}>Discord</h2>
      {audience === "mentor" ? (
        <p style={{ margin: "0 0 14px", color: "var(--muted)", lineHeight: 1.5 }}>
          Connect the Discord server where you teach. Students connect their own Discord accounts from their dashboard, so the academy can match each student to a Discord user.
        </p>
      ) : (
        <p style={{ margin: "0 0 14px", color: "var(--muted)", lineHeight: 1.5 }}>
          Connect the Discord account you use for Bandile&apos;s group. This records who you are. It does not add or remove you from the group.
        </p>
      )}
      {notice ? <p style={{ margin: "0 0 12px" }}>{notice}</p> : null}
      {!configured ? (
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          Discord is ready in the academy, and it still needs the Discord application keys on the server before anyone can connect.
        </p>
      ) : audience === "mentor" ? (
        serverName ? (
          <>
            <p style={{ margin: "0 0 8px" }}>Server connected: <strong>{serverName}</strong></p>
            <p style={{ margin: "0 0 12px" }}>Connected by Discord account <strong>{accountName}</strong>.</p>
            <form action="/api/discord/unlink" method="post">
              <button className="btn ghost" type="submit">Disconnect server</button>
            </form>
            <h3 style={{ margin: "18px 0 8px", fontSize: "0.95rem" }}>Students who have connected</h3>
            {(students ?? []).length === 0 ? <p style={{ margin: 0, color: "var(--muted)" }}>No student has connected Discord yet.</p> : (
              <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                {(students ?? []).map((student) => (
                  <li key={student.discord}>{student.name} — {student.discord}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <Link className="btn" href={connectHref}>Link Discord server</Link>
        )
      ) : accountName ? (
        <>
          <p style={{ margin: "0 0 12px" }}>Connected as <strong>{accountName}</strong>.</p>
          <form action="/api/discord/unlink" method="post">
            <button className="btn ghost" type="submit">Disconnect Discord</button>
          </form>
        </>
      ) : (
        <Link className="btn" href={connectHref}>Link Discord</Link>
      )}
    </section>
  );
}
