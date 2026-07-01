# EP-054 — Messaging fixes: mentor compose + student initiation

## Problems

### 1. Mentor creates a conversation but the compose box never appears

After a mentor creates a direct conversation the API call succeeds and returns a
`conversationId`. The code then calls `router.refresh()` followed by
`setActiveId(result.conversationId)`. Because `router.refresh()` in Next.js App Router does
a soft re-render that does **not** reset `useState`, `conversationRows` still holds the old
list and does not contain the new conversation. `activeConversation` resolves to `null`,
`canPost` is `false`, and the compose form is never rendered.

**Fix:** After a successful creation, add the new conversation directly to `conversationRows`
state and set it active — no refresh needed.

### 2. Students cannot initiate a message to their mentor

The student messages page shows existing conversations but provides no way to start one.
The existing `create_direct_conversation` RPC is mentor-only — it checks
`is_trader_member(resolved_trader_id)` and raises `forbidden` for students.
A student-safe RPC is needed, plus a "Message your mentor" button on the student side.

---

## Changes

### Step 1 — Migration: `create_student_conversation` RPC

Apply this migration via the Supabase dashboard or CLI:

```sql
CREATE OR REPLACE FUNCTION public.create_student_conversation(
  target_application_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_trader_id    uuid;
  target_student_id     uuid;
  target_student_name   text;
  created_conversation_id uuid;
BEGIN
  -- Verify caller is the verified student of this application.
  SELECT application.trader_id, application.student_user_id, profile.full_name
  INTO resolved_trader_id, target_student_id, target_student_name
  FROM public.student_applications application
  JOIN public.profiles profile ON profile.id = application.student_user_id
  WHERE application.id = target_application_id
    AND application.status = 'verified'
    AND application.student_user_id = auth.uid();

  IF resolved_trader_id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Upsert conversation — idempotent, returns existing ID if already created.
  INSERT INTO public.conversations (
    trader_id, type, title, direct_student_user_id, created_by
  )
  VALUES (
    resolved_trader_id, 'direct', target_student_name, target_student_id, auth.uid()
  )
  ON CONFLICT (trader_id, direct_student_user_id)
    WHERE type = 'direct'
  DO UPDATE SET title = EXCLUDED.title
  RETURNING id INTO created_conversation_id;

  -- Add all workspace mentors + the student as members (idempotent).
  INSERT INTO public.conversation_members (
    trader_id, conversation_id, user_id, member_role
  )
  SELECT
    resolved_trader_id,
    created_conversation_id,
    member.user_id,
    CASE WHEN member.role = 'owner' THEN 'owner' ELSE 'moderator' END
  FROM public.trader_members member
  WHERE member.trader_id = resolved_trader_id
  UNION ALL
  SELECT
    resolved_trader_id,
    created_conversation_id,
    target_student_id,
    'member'
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN created_conversation_id;
END;
$$;
```

---

### Step 2 — Edit: `app/api/messages/conversations/route.ts`

Add `student_direct` as a valid conversation type. Replace the `conversationSchema` and the
`result` block:

```ts
const conversationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("direct"),
    applicationId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("student_direct"),
    applicationId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("announcement"),
    title: z.string().trim().min(2).max(160),
  }),
]);
```

Replace the `result` assignment:

```ts
const result =
  parsed.data.type === "direct"
    ? await supabase.rpc("create_direct_conversation", {
        target_application_id: parsed.data.applicationId,
      })
    : parsed.data.type === "student_direct"
      ? await supabase.rpc("create_student_conversation", {
          target_application_id: parsed.data.applicationId,
        })
      : await supabase.rpc("create_announcement_conversation", {
          target_title: parsed.data.title,
        });
```

---

### Step 3 — Edit: `components/messages-workspace.tsx`

#### 3a. Add `studentApplicationId` prop

Add `studentApplicationId?: string` to the props interface and destructure it:

```ts
export function MessagesWorkspace({
  conversations,
  students,
  userId,
  traderId,
  mode,
  initialConversationId,
  studentApplicationId,   // ← add
}: {
  conversations: ConversationSummary[];
  students: CommunityStudent[];
  userId: string;
  traderId: string;
  mode: "mentor" | "student";
  initialConversationId?: string;
  studentApplicationId?: string;   // ← add
})
```

#### 3b. Fix `createConversation` — update local state instead of router.refresh()

Replace the entire `createConversation` function:

```ts
async function createConversation(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!createMode) return;
  setCreating(true);
  setError("");
  const formData = new FormData(event.currentTarget);
  const payload =
    createMode === "direct"
      ? { type: "direct", applicationId: formData.get("applicationId") }
      : { type: "announcement", title: formData.get("title") };

  const response = await fetch("/api/messages/conversations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  setCreating(false);
  if (!response.ok) {
    setError(result.error ?? "The conversation could not be created.");
    return;
  }

  // Build a local summary so the new conversation is immediately selectable.
  const newTitle =
    createMode === "direct"
      ? (students.find((s) => s.applicationId === formData.get("applicationId"))
          ?.fullName ?? "Student")
      : String(formData.get("title"));

  const newConversation: ConversationSummary = {
    id: result.conversationId,
    type: createMode,
    title: newTitle,
    lastMessageAt: null,
    lastMessage: null,
    unread: false,
  };

  setConversationRows((prev) => [newConversation, ...prev]);
  setCreateMode(null);
  setActiveId(result.conversationId);
  // No router.refresh() — local state is the source of truth until next page load.
}
```

#### 3c. Add `startMentorConversation` for students

Add this function below `createConversation`:

```ts
async function startMentorConversation() {
  if (!studentApplicationId) return;
  setCreating(true);
  setError("");
  const response = await fetch("/api/messages/conversations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "student_direct", applicationId: studentApplicationId }),
  });
  const result = await response.json();
  setCreating(false);
  if (!response.ok) {
    setError(result.error ?? "Could not start a conversation.");
    return;
  }
  // If a conversation already existed the RPC returns its ID — add it if not present.
  setConversationRows((prev) => {
    if (prev.some((c) => c.id === result.conversationId)) return prev;
    return [
      {
        id: result.conversationId,
        type: "direct" as const,
        title: "Academy support",
        lastMessageAt: null,
        lastMessage: null,
        unread: false,
      },
      ...prev,
    ];
  });
  setActiveId(result.conversationId);
}
```

#### 3d. Add "Message your mentor" button in the sidebar (student mode)

In the sidebar section, below the `{mode === "mentor" ? ... : null}` announcement button
block, add:

```tsx
{mode === "student" && studentApplicationId && !conversationRows.some((c) => c.type === "direct") ? (
  <button
    className={styles.announcementButton}
    disabled={creating}
    onClick={startMentorConversation}
    type="button"
  >
    {creating ? <Loader2 className={styles.spin} size={15} /> : <MessageCircle size={15} />}
    Message your mentor
  </button>
) : null}
```

---

### Step 4 — Edit: `app/student/messages/page.tsx`

Pass `studentApplicationId` to `MessagesWorkspace`:

```tsx
<MessagesWorkspace
  conversations={conversations}
  mode="student"
  studentApplicationId={application.id}   // ← add
  students={[]}
  traderId={application.trader_id}
  userId={user.id}
/>
```

---

## Acceptance criteria

- [ ] Mentor clicks "+", selects a verified student, clicks "Create conversation" → modal
  closes and the compose box is immediately visible in the thread panel
- [ ] Mentor types a message and sends → message appears in the thread
- [ ] Student goes to Messages → "Message your mentor" button is visible when no direct
  conversation exists
- [ ] Student clicks "Message your mentor" → conversation created, compose box appears
- [ ] Student types a message and sends → message appears; mentor sees it in real time
- [ ] Sending a second time when a direct conversation already exists opens the existing one
  (no duplicate conversations)
- [ ] Announcement channels remain read-only for students
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Deploy with `vercel --prod`
