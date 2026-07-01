# EP-055 — Realtime: new student-initiated conversations appear without refresh

## Problem

The Realtime subscription in `MessagesWorkspace` listens to `INSERT` events on the `messages`
table filtered by `trader_id`. When a student creates a new conversation and sends their first
message, the mentor receives the Realtime event — but the conversation isn't in their local
`conversationRows` state, so the handler silently discards it. The mentor must manually
refresh the page to see the new conversation.

## Root cause

The handler does:
```ts
if (conversationId === activeId) {
  void loadMessages(conversationId);
} else {
  setConversationRows((current) =>
    current.map((conversation) =>
      conversation.id === conversationId ? { ...conversation, unread: true, ... } : conversation,
    ),
  );
}
```

If `conversationId` is not in `current`, the `map` produces no change — the new conversation
is lost.

There is also a stale-closure issue: `conversationRows` captured inside the `useEffect`
callback is frozen at the time the effect ran. A ref mirror is needed to check the latest
state from inside the async Realtime handler.

## Fix — `components/messages-workspace.tsx`

### 1. Add a `conversationRowsRef` that stays current

Add this after the existing `useState` declarations:

```ts
const conversationRowsRef = useRef(conversationRows);
useEffect(() => {
  conversationRowsRef.current = conversationRows;
}, [conversationRows]);
```

### 2. Replace the Realtime `useEffect`

Replace the entire second `useEffect` (the one that sets up the Supabase channel):

```ts
useEffect(() => {
  const supabase = createClient();
  const channel = supabase
    .channel(`messages:${traderId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `trader_id=eq.${traderId}`,
      },
      async (payload) => {
        const conversationId = String(payload.new.conversation_id);

        if (conversationId === activeId) {
          void loadMessages(conversationId);
          return;
        }

        const known = conversationRowsRef.current.some(
          (c) => c.id === conversationId,
        );

        if (known) {
          // Update last-message preview and mark unread.
          setConversationRows((current) =>
            current.map((c) =>
              c.id === conversationId
                ? {
                    ...c,
                    lastMessage: String(payload.new.body),
                    lastMessageAt: String(payload.new.created_at),
                    unread: true,
                  }
                : c,
            ),
          );
        } else {
          // Unknown conversation — fetch it and prepend to list.
          const { data } = await supabase
            .from("conversations")
            .select("id, type, title, last_message_at, last_message_preview")
            .eq("id", conversationId)
            .maybeSingle();

          if (data) {
            setConversationRows((current) => {
              // Guard against duplicate if two events arrive simultaneously.
              if (current.some((c) => c.id === data.id)) return current;
              return [
                {
                  id: data.id,
                  type: data.type as ConversationSummary["type"],
                  title: data.title ?? "Conversation",
                  lastMessageAt: data.last_message_at ?? null,
                  lastMessage:
                    data.last_message_preview ?? String(payload.new.body),
                  unread: true,
                },
                ...current,
              ];
            });
          }
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}, [activeId, loadMessages, traderId]);
```

### Required import

`ConversationSummary` is already imported from `@/lib/community` — no new imports needed.
`useRef` is already in the React import — confirm it is listed:
```ts
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
```

---

## Acceptance criteria

- [ ] Student creates a new conversation and sends a message → it appears in the mentor's
  sidebar in real time without any page refresh
- [ ] Mentor clicks the new conversation → thread loads and compose box is available
- [ ] Messages in existing conversations still update in real time (no regression)
- [ ] No duplicate conversation entries if multiple Realtime events arrive quickly
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Deploy with `vercel --prod`
