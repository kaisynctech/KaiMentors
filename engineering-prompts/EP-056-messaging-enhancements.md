# EP-056 — Messaging enhancements

Five improvements to the messaging system:

1. Unread badge on the Messages nav item
2. Bell notifications for new messages (with Realtime updates)
3. Fallback polling when Realtime drops
4. Group conversations
5. In-thread message search

---

## Database changes

### Migration A — Add `conversation_id` to `notifications`

```sql
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL;
```

### Migration B — `notify_message_recipients` trigger

Fires on every `messages` INSERT. Inserts a `notifications` row for every conversation member
except the sender. Runs as the table owner (superuser) so it bypasses RLS.

```sql
CREATE OR REPLACE FUNCTION public.notify_message_recipients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name text;
  preview     text;
BEGIN
  -- Get sender display name.
  SELECT full_name INTO sender_name
  FROM public.profiles
  WHERE id = NEW.sender_user_id;

  -- Truncate body to 120 chars for the notification preview.
  preview := left(NEW.body, 120);

  -- Insert one notification per recipient (everyone except the sender).
  INSERT INTO public.notifications (user_id, trader_id, conversation_id, type, title, body)
  SELECT
    cm.user_id,
    NEW.trader_id,
    NEW.conversation_id,
    'new_message',
    coalesce(sender_name, 'Someone') || ' sent a message',
    preview
  FROM public.conversation_members cm
  WHERE cm.conversation_id = NEW.conversation_id
    AND cm.user_id <> NEW.sender_user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_insert_notify ON public.messages;
CREATE TRIGGER on_message_insert_notify
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_message_recipients();
```

### Migration C — `create_group_conversation` RPC

```sql
CREATE OR REPLACE FUNCTION public.create_group_conversation(
  target_title        text,
  target_application_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_trader_id    uuid := public.current_trader_id();
  created_conversation_id uuid;
BEGIN
  IF resolved_trader_id IS NULL THEN
    RAISE EXCEPTION 'mentor workspace not found';
  END IF;

  INSERT INTO public.conversations (trader_id, type, title, created_by)
  VALUES (resolved_trader_id, 'group', trim(target_title), auth.uid())
  RETURNING id INTO created_conversation_id;

  -- Add all workspace mentors.
  INSERT INTO public.conversation_members (trader_id, conversation_id, user_id, member_role)
  SELECT
    resolved_trader_id,
    created_conversation_id,
    member.user_id,
    CASE WHEN member.role = 'owner' THEN 'owner' ELSE 'moderator' END
  FROM public.trader_members member
  WHERE member.trader_id = resolved_trader_id;

  -- Add selected verified students.
  INSERT INTO public.conversation_members (trader_id, conversation_id, user_id, member_role)
  SELECT
    resolved_trader_id,
    created_conversation_id,
    application.student_user_id,
    'member'
  FROM public.student_applications application
  WHERE application.id = ANY(target_application_ids)
    AND application.trader_id = resolved_trader_id
    AND application.status = 'verified'
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN created_conversation_id;
END;
$$;
```

---

## API changes

### New: `app/api/messages/unread/route.ts`

Returns unread conversation count for the authenticated user's active workspace.

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMentorWorkspace } from "@/lib/workspace";

export async function GET() {
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ count: 0 });
  const { supabase, traderId, user } = workspace;

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

### Edit: `app/api/notifications/route.ts`

Add `conversation_id` to the select:

```ts
const { data } = await supabase
  .from("notifications")
  .select("id,type,title,body,is_read,created_at,booking_id,trader_id,conversation_id")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false })
  .limit(20);
```

### Edit: `app/api/messages/conversations/route.ts`

Add `group` type to the Zod schema:

```ts
const conversationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("direct"), applicationId: z.string().uuid() }),
  z.object({ type: z.literal("student_direct"), applicationId: z.string().uuid() }),
  z.object({ type: z.literal("announcement"), title: z.string().trim().min(2).max(160) }),
  z.object({
    type: z.literal("group"),
    title: z.string().trim().min(2).max(160),
    applicationIds: z.array(z.string().uuid()).min(1),
  }),
]);
```

Add the `group` branch to the `result` assignment:

```ts
parsed.data.type === "group"
  ? await supabase.rpc("create_group_conversation", {
      target_title: parsed.data.title,
      target_application_ids: parsed.data.applicationIds,
    })
  : // ... existing branches
```

---

## Component changes

### New: `components/messages-unread-dot.tsx`

Client component rendered in the Messages nav link. Fetches the unread count on mount and
subscribes to Realtime `messages` inserts to increment it without refetching.

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import styles from "./messages-unread-dot.module.css";

export function MessagesUnreadDot({ traderId }: { traderId: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch("/api/messages/unread")
      .then((r) => r.json())
      .then(({ count: c }) => setCount(c ?? 0));
  }, []);

  useEffect(() => {
    if (!traderId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`unread-dot:${traderId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `trader_id=eq.${traderId}` },
        () => setCount((n) => n + 1),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [traderId]);

  if (count === 0) return null;
  return (
    <span className={styles.dot} aria-label={`${count} unread messages`}>
      {count > 9 ? "9+" : count}
    </span>
  );
}
```

### New: `components/messages-unread-dot.module.css`

```css
.dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-foreground, #000);
  font-size: 0.6rem;
  font-weight: 700;
  line-height: 1;
  margin-left: auto;
}
```

### Edit: `components/dashboard-shell.tsx`

1. Import `MessagesUnreadDot`:
```ts
import { MessagesUnreadDot } from "@/components/messages-unread-dot";
```

2. Add `traderId?: string` to `DashboardShellProps`.

3. In `navigationLinks()`, render the dot alongside the Messages label. Replace the current
   simple link map with a version that handles the Messages item specially:

```tsx
function navigationLinks(closeAfterNavigation = false) {
  return navigation.map(([label, href, Icon], index) => (
    <Link
      className={activePath ? (activePath === href ? styles.active : "") : index === 0 ? styles.active : ""}
      href={href}
      key={href}
      onClick={closeAfterNavigation ? () => setMobileOpen(false) : undefined}
    >
      <Icon size={18} />
      {label}
      {label === "Messages" && mode === "trader" && traderId ? (
        <MessagesUnreadDot traderId={traderId} />
      ) : null}
    </Link>
  ));
}
```

4. All dashboard pages that call `DashboardShell` and already have `traderId` from
   `getMentorWorkspace()` should pass `traderId={traderId}`. The two pages that don't
   (`branding`, `settings`) can omit it — the dot simply won't render.

### Edit: `components/notification-bell.tsx`

Three changes:

#### a. Add `conversation_id` to the `Notification` interface:
```ts
interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  booking_id: string | null;
  conversation_id: string | null;  // ← add
}
```

#### b. Load unread count eagerly on mount (so badge shows without opening bell)

Replace the lazy `load()` approach with an eager unread count fetch. Add below the existing
`useState` declarations:

```ts
// Eagerly fetch unread count on mount so the badge is visible immediately.
useEffect(() => {
  fetch("/api/notifications")
    .then((r) => r.json())
    .then((data: Notification[]) => {
      setNotifications(data);
      setLoaded(true);
    })
    .catch(() => {});
}, []);
```

Remove the `if (loaded) return;` guard from the `load()` function (keep `load()` for
manual refresh on bell open).

#### c. Subscribe to Realtime for new notifications

Add below the mount effect:

```ts
useEffect(() => {
  const supabase = createClient();
  // Import createClient from "@/lib/supabase/browser" — add import at top.
  const channel = supabase
    .channel("notification-bell")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications" },
      (payload) => {
        const n = payload.new as Notification;
        setNotifications((prev) => [n, ...prev]);
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}, []);
```

Add `import { createClient } from "@/lib/supabase/browser";` to the imports.

#### d. Navigate to conversation on `new_message` click

In the notification list item `onClick`, check the type:

```tsx
onClick={() => {
  if (!n.is_read) void markRead(n.id);
  if (n.type === "new_message" && n.conversation_id) {
    window.location.href = `/dashboard/messages?conversation=${n.conversation_id}`;
    setOpen(false);
  }
}}
```

---

### Edit: `components/messages-workspace.tsx`

#### a. Add `threadSearch` state and filter

Add after existing `useState` declarations:
```ts
const [threadSearch, setThreadSearch] = useState("");
```

Replace the `messages.map(...)` render with a filtered version:
```ts
const visibleMessages = useMemo(() => {
  const q = threadSearch.trim().toLowerCase();
  if (!q) return messages;
  return messages.filter((m) => m.body.toLowerCase().includes(q));
}, [messages, threadSearch]);
```

Change `messages.map(...)` in JSX to `visibleMessages.map(...)`.

Add a search bar in the thread panel, inside `<header className={styles.threadHeader}>`,
after the existing `<small>` tag:

```tsx
<div className={styles.threadSearch}>
  <Search size={14} />
  <input
    aria-label="Search messages"
    onChange={(e) => setThreadSearch(e.target.value)}
    placeholder="Search messages…"
    type="search"
    value={threadSearch}
  />
</div>
```

Add to `messages-workspace.module.css`:
```css
.threadSearch {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.threadSearch input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 0.8rem;
  color: var(--text-primary);
  outline: none;
}
.threadSearch svg {
  color: var(--text-muted);
  flex-shrink: 0;
}
```

Also clear `threadSearch` when `activeId` changes:
```ts
useEffect(() => {
  setThreadSearch("");
  if (activeId) void loadMessages(activeId);
  else setMessages([]);
}, [activeId, loadMessages]);
```

#### b. Add polling fallback

Add a new `useEffect` after the Realtime one:

```ts
useEffect(() => {
  if (!activeId) return;
  const interval = setInterval(() => {
    void loadMessages(activeId);
  }, 30_000);
  return () => clearInterval(interval);
}, [activeId, loadMessages]);
```

#### c. Add group conversation creation

Add `"group"` to the `createMode` type:
```ts
const [createMode, setCreateMode] = useState<"direct" | "announcement" | "group" | null>(null);
```

Add a "New group conversation" button in the mentor sidebar (after the announcement button):
```tsx
{mode === "mentor" ? (
  <button
    className={styles.announcementButton}
    onClick={() => setCreateMode("group")}
    type="button"
  >
    <UsersRound size={15} /> New group conversation
  </button>
) : null}
```

Update `createConversation` to handle the `group` payload:

```ts
const payload =
  createMode === "direct"
    ? { type: "direct", applicationId: formData.get("applicationId") }
    : createMode === "group"
      ? {
          type: "group",
          title: formData.get("title"),
          applicationIds: (formData.getAll("applicationIds[]") as string[]),
        }
      : { type: "announcement", title: formData.get("title") };
```

Build `newTitle` for the local state:
```ts
const newTitle =
  createMode === "direct"
    ? (students.find((s) => s.applicationId === formData.get("applicationId"))?.fullName ?? "Student")
    : String(formData.get("title"));
```

Add the group creation form inside the `createMode` modal, after the `announcement` branch:

```tsx
{createMode === "group" ? (
  <>
    <label>
      Group name
      <input maxLength={160} name="title" placeholder="Study Group A" required />
    </label>
    <label>
      Add students
      <select multiple name="applicationIds[]" required size={Math.min(students.length, 6)}>
        {students.map((student) => (
          <option key={student.applicationId} value={student.applicationId}>
            {student.fullName}{student.email ? ` — ${student.email}` : ""}
          </option>
        ))}
      </select>
      <small>Hold Ctrl / Cmd to select multiple</small>
    </label>
  </>
) : null}
```

---

## Acceptance criteria

- [ ] Messages nav item shows an unread count badge when there are unread messages; clears
  after visiting Messages and reading conversations
- [ ] Bell shows a badge for new messages without opening it; clicking a `new_message`
  notification navigates to the correct conversation
- [ ] Bell badge updates in real time when a new message arrives
- [ ] When Realtime drops, messages still refresh every 30 seconds automatically
- [ ] Mentor can create a group conversation with a name and multiple students; all members
  can send and receive messages in real time
- [ ] In-thread search filters visible messages; clears when switching conversations
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Deploy with `vercel --prod`

## Implementation order

1. Apply migrations A, B, C (database)
2. New API route (`/api/messages/unread`)
3. Edit existing API routes (notifications, conversations)
4. New components (`MessagesUnreadDot`, CSS)
5. Edit `notification-bell.tsx`
6. Edit `dashboard-shell.tsx`
7. Edit `messages-workspace.tsx` (polling + search + group)
8. Pass `traderId` to `DashboardShell` on all mentor dashboard pages that have it
9. Build, commit, deploy
