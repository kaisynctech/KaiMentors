# EP-057 — Student dashboard enhancements

Three additions to the student home page and shell:

1. **Upcoming session card** — student's next booked 1-on-1 on the dashboard home
2. **Unread messages badge** — dot on the Messages nav item in the student sidebar
3. **Quick-action strip** — "Book a session", "Message mentor", "Live Classes" shortcuts for verified students

---

## No database migrations required

All data already exists in `bookings` and `conversation_members`.

---

## Step 1 — Edit: `components/messages-unread-dot.tsx`

Add an `apiPath` prop so the component can serve both the mentor (`/api/messages/unread`) and the
student (`/api/student/messages/unread?traderId=...`) without duplicating logic.

Replace the entire file:

```tsx
"use client";

import { useEffect, useState } from "react";
import styles from "./messages-unread-dot.module.css";

export function MessagesUnreadDot({
  traderId,
  apiPath,
}: {
  traderId?: string;
  apiPath?: string;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!traderId) return;
    const path = apiPath ?? "/api/messages/unread";
    function load() {
      fetch(path)
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then(({ count: n }: { count: number }) => setCount(n));
    }
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [traderId, apiPath]);

  if (!count) return null;
  return <span aria-label={`${count} unread`} className={styles.dot} />;
}
```

---

## Step 2 — New: `app/api/student/messages/unread/route.ts`

Student-scoped unread count. Reads `traderId` from a query param rather than a workspace cookie.

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const traderId = searchParams.get("traderId");
  if (!traderId) return NextResponse.json({ count: 0 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ count: 0 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 });

  const { data } = await supabase
    .from("conversation_members")
    .select("last_read_at, conversation:conversations(last_message_at)")
    .eq("user_id", user.id)
    .eq("trader_id", traderId);

  const count = (data ?? []).filter((row) => {
    const conv = Array.isArray(row.conversation)
      ? row.conversation[0]
      : row.conversation;
    if (!conv?.last_message_at) return false;
    if (!row.last_read_at) return true;
    return new Date(conv.last_message_at) > new Date(row.last_read_at);
  }).length;

  return NextResponse.json({ count });
}
```

---

## Step 3 — Edit: `components/student-shell.tsx`

Add `traderId?: string` to the props interface and pass it through to `StudentShellClient`.

```tsx
interface StudentShellProps {
  academyName: string;
  logoPath: string | null;
  isVerified: boolean;
  basePath: string;
  querySuffix: string;
  displayName: string;
  traderId?: string;          // ← add
  children: React.ReactNode;
}

export async function StudentShell({
  academyName,
  logoPath,
  isVerified,
  basePath,
  querySuffix,
  displayName,
  traderId,                   // ← add
  children,
}: StudentShellProps) {
  // ... existing logo logic unchanged ...

  return (
    <StudentShellClient
      academyName={academyName}
      basePath={basePath}
      displayName={displayName}
      isVerified={isVerified}
      logoUrl={logoUrl}
      querySuffix={querySuffix}
      traderId={traderId}     // ← add
    >
      {children}
    </StudentShellClient>
  );
}
```

---

## Step 4 — Edit: `components/student-shell-client.tsx`

Add the unread dot to the Messages nav item.

### 4a. Add imports

```ts
import { MessagesUnreadDot } from "@/components/messages-unread-dot";
```

### 4b. Add `traderId` to the props interface

```ts
interface StudentShellClientProps {
  academyName: string;
  logoUrl: string | null;
  isVerified: boolean;
  basePath: string;
  querySuffix: string;
  displayName: string;
  traderId?: string;    // ← add
  children: React.ReactNode;
}
```

Destructure it:

```ts
export function StudentShellClient({
  academyName,
  logoUrl,
  isVerified,
  basePath,
  querySuffix,
  displayName,
  traderId,           // ← add
  children,
}: StudentShellClientProps) {
```

### 4c. Replace the nav link render

In `SidebarContent`, replace the `navItems.map(...)` block with a version that injects the
unread dot on the Messages link:

```tsx
<nav aria-label="Student portal" className={styles.nav}>
  {navItems.map((item) => (
    <Link
      className={`${styles.navLink} ${isActive(item.href) ? styles.navLinkActive : ""}`}
      href={item.href}
      key={item.href}
      onClick={onLinkClick}
    >
      <item.icon className={styles.navLinkIcon} size={16} />
      {item.label}
      {item.locked ? (
        <LockKeyhole className={styles.lockIcon} size={13} />
      ) : item.label === "Messages" && isVerified && traderId ? (
        <MessagesUnreadDot
          apiPath={`/api/student/messages/unread?traderId=${traderId}`}
          traderId={traderId}
        />
      ) : null}
    </Link>
  ))}
</nav>
```

---

## Step 5 — Edit: `app/student/page.tsx`

### 5a. Add upcoming session to the data fetch

Add a `nextSession` variable alongside the existing verified-only data:

```ts
let nextSession: {
  id: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  session_type: { name: string; duration_minutes: number } | null;
} | null = null;
```

Inside the `if (isVerified)` block, add it to the `Promise.all`:

```ts
const [progressResult, liveResult, announcementsResult, coursesResult, sessionResult] =
  await Promise.all([
    // ... existing four queries unchanged ...
    supabase
      .from("bookings")
      .select(
        "id,starts_at,ends_at,status,session_type:booking_session_types!session_type_id(name,duration_minutes)",
      )
      .eq("student_user_id", user.id)
      .eq("trader_id", application.trader_id)
      .in("status", ["confirmed", "pending"])
      .gte("starts_at", now)
      .order("starts_at")
      .limit(1)
      .maybeSingle(),
  ]);
```

After the existing assignments:

```ts
nextSession = (sessionResult.data ?? null) as typeof nextSession;
```

### 5b. Pass `traderId` to `StudentShell`

```tsx
<StudentShell
  academyName={academyName}
  basePath={basePath}
  displayName={displayName}
  isVerified={isVerified}
  logoPath={portal?.logo_path ?? null}
  querySuffix={querySuffix}
  traderId={application.trader_id}   // ← add
>
```

### 5c. Add the upcoming session card to the JSX

Insert this section **before** the "Next live class" section (after the continue-learning block):

```tsx
{/* Upcoming session */}
{nextSession ? (
  <section className={styles.section}>
    <div className={styles.sectionHead}>
      <h2>Upcoming session</h2>
      <Link
        className={styles.sectionLink}
        href={`${basePath}/bookings/sessions${querySuffix}`}
      >
        My sessions →
      </Link>
    </div>
    <div className={styles.liveCard}>
      <div className={styles.liveTimeBadge}>
        <span className={styles.liveTimeDay}>
          {new Date(nextSession.starts_at).toLocaleDateString(undefined, {
            weekday: "short",
          })}
        </span>
        <span className={styles.liveTimeHour}>
          {new Date(nextSession.starts_at).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </span>
      </div>
      <div className={styles.liveBody}>
        <p className={styles.liveTitle}>
          {(nextSession.session_type as { name?: string } | null)?.name ?? "1-on-1 session"}
        </p>
        <p className={styles.liveMeta}>
          {new Date(nextSession.starts_at).toLocaleDateString(undefined, {
            dateStyle: "long",
          })}
          {nextSession.ends_at
            ? ` · ends ${new Date(nextSession.ends_at).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}`
            : ""}
          {" · "}
          <span className={styles.sessionStatusBadge} data-status={nextSession.status}>
            {nextSession.status}
          </span>
        </p>
      </div>
    </div>
  </section>
) : null}
```

### 5d. Add the quick-action strip to the JSX

Insert this section **immediately after** the stats row (`</div>` closing the `statsRow`):

```tsx
{/* Quick actions */}
<div className={styles.quickActions}>
  <Link className={styles.quickAction} href={`${basePath}/bookings${querySuffix}`}>
    <CalendarCheck size={20} />
    <span>Book a session</span>
  </Link>
  <Link className={styles.quickAction} href={`${basePath}/messages${querySuffix}`}>
    <MessageSquare size={20} />
    <span>Messages</span>
  </Link>
  <Link className={styles.quickAction} href={`${basePath}/live-classes${querySuffix}`}>
    <Video size={20} />
    <span>Live classes</span>
  </Link>
</div>
```

Add the required icon imports at the top of the file (some already exist — add only what's missing):

```ts
import {
  AlertCircle,
  BookOpen,
  CalendarCheck,   // ← add
  CheckCircle2,
  Clock3,
  ExternalLink,
  MessageSquare,   // ← add
  Video,
} from "lucide-react";
```

### 5e. Add new CSS classes to `app/student/student.module.css`

```css
/* Quick actions strip */
.quickActions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.quickAction {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  flex: 1;
  min-width: 90px;
  padding: 1rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 0.5rem);
  background: var(--surface);
  color: var(--text-primary);
  text-decoration: none;
  font-size: 0.75rem;
  font-weight: 500;
  text-align: center;
  transition: background 0.15s, border-color 0.15s;
}

.quickAction:hover {
  background: var(--surface-hover, var(--surface));
  border-color: var(--accent);
  color: var(--accent);
}

/* Session status badge */
.sessionStatusBadge {
  text-transform: capitalize;
  font-weight: 600;
}

.sessionStatusBadge[data-status="confirmed"] {
  color: var(--success, #22c55e);
}

.sessionStatusBadge[data-status="pending"] {
  color: var(--warning, #f59e0b);
}
```

---

## Step 6 — Pass `traderId` to `StudentShell` on all other student pages

Every page that renders `<StudentShell>` already has `application.trader_id` available. Add
`traderId={app.trader_id}` (or `application.trader_id` — match whichever variable name the page
uses) to the `<StudentShell>` call in each of these pages:

- `app/student/messages/page.tsx`
- `app/student/bookings/sessions/page.tsx`
- `app/student/bookings/page.tsx` (if it exists)
- `app/student/live-classes/page.tsx`
- `app/student/courses/page.tsx`
- `app/student/groups/page.tsx`

The prop is optional (`traderId?: string`) so any page not updated simply renders without the
dot — no breakage.

---

## Acceptance criteria

- [ ] Verified student's dashboard shows an "Upcoming session" card with the session type name,
  date, time, and status when a `confirmed` or `pending` booking exists in the future; card is
  absent when no upcoming session exists
- [ ] "My sessions →" link in the card header navigates to `bookings/sessions`
- [ ] Quick-action strip ("Book a session", "Messages", "Live classes") appears below the stats
  row for verified students; each link navigates to the correct page
- [ ] Messages nav item in the student sidebar shows an unread count dot when unread
  conversations exist; dot disappears after visiting Messages and reading them
- [ ] Unread dot is absent for unverified students (lock icon takes precedence)
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Deploy with `vercel --prod`

## Implementation order

1. Edit `messages-unread-dot.tsx` (add `apiPath` prop)
2. Create `app/api/student/messages/unread/route.ts`
3. Edit `components/student-shell.tsx` (add `traderId` prop)
4. Edit `components/student-shell-client.tsx` (accept `traderId`, inject dot on Messages link)
5. Edit `app/student/page.tsx` (session query, pass `traderId`, add cards and CSS)
6. Pass `traderId` to `StudentShell` on remaining student pages
7. Build, commit, deploy
