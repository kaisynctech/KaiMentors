"use client";

import {
  Bell,
  FileUp,
  Loader2,
  MessageCircle,
  Plus,
  Search,
  Send,
  UsersRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CommunityStudent,
  ConversationMessage,
  ConversationSummary,
} from "@/lib/community";
import { createClient } from "@/lib/supabase/browser";
import styles from "./messages-workspace.module.css";

export function MessagesWorkspace({
  conversations,
  students,
  userId,
  traderId,
  mode,
  initialConversationId,
  studentApplicationId,
}: {
  conversations: ConversationSummary[];
  students: CommunityStudent[];
  userId: string;
  traderId: string;
  mode: "mentor" | "student";
  initialConversationId?: string;
  studentApplicationId?: string;
}) {
  const router = useRouter();
  const [conversationRows, setConversationRows] = useState(conversations);
  const [activeId, setActiveId] = useState(
    conversations.some((row) => row.id === initialConversationId)
      ? initialConversationId ?? ""
      : conversations[0]?.id ?? "",
  );
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(Boolean(activeId));
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createMode, setCreateMode] = useState<
    "direct" | "announcement" | null
  >(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationRowsRef = useRef(conversationRows);
  useEffect(() => {
    conversationRowsRef.current = conversationRows;
  }, [conversationRows]);

  const activeConversation =
    conversationRows.find((conversation) => conversation.id === activeId) ??
    null;
  const visibleConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversationRows;
    return conversationRows.filter((conversation) =>
      `${conversation.title} ${conversation.lastMessage ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [conversationRows, search]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoading(true);
    setError("");
    const response = await fetch(
      `/api/messages?conversationId=${encodeURIComponent(conversationId)}`,
      { cache: "no-store" },
    );
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(payload.error ?? "Messages could not be loaded.");
      return;
    }
    setMessages(payload.messages);
    setConversationRows((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unread: false }
          : conversation,
      ),
    );
    requestAnimationFrame(() =>
      bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
    );
  }, []);

  useEffect(() => {
    if (activeId) void loadMessages(activeId);
    else setMessages([]);
  }, [activeId, loadMessages]);

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

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeId) return;
    setSending(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    formData.set("conversationId", activeId);
    formData.set("clientMessageId", crypto.randomUUID());
    const response = await fetch("/api/messages", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    setSending(false);
    if (!response.ok) {
      setError(payload.error ?? "The message could not be sent.");
      return;
    }
    formRef.current?.reset();
    await loadMessages(activeId);
    router.refresh();
  }

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

  async function openAttachment(attachmentId: string) {
    setError("");
    const response = await fetch(
      `/api/messages/attachments/${attachmentId}`,
    );
    const payload = await response.json();
    if (!response.ok || !payload.url) {
      setError(payload.error ?? "The attachment could not be opened.");
      return;
    }
    window.open(payload.url, "_blank", "noopener,noreferrer");
  }

  const canPost =
    activeConversation &&
    (mode === "mentor" || activeConversation.type !== "announcement");

  return (
    <div className={styles.workspace}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeading}>
          <div>
            <span>Academy communication</span>
            <h2>Messages</h2>
          </div>
          {mode === "mentor" ? (
            <button
              aria-label="New direct conversation"
              onClick={() => setCreateMode("direct")}
              type="button"
            >
              <Plus size={18} />
            </button>
          ) : null}
        </div>
        <div className={styles.search}>
          <Search size={16} />
          <input
            aria-label="Search conversations"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations"
            type="search"
            value={search}
          />
        </div>
        {mode === "mentor" ? (
          <button
            className={styles.announcementButton}
            onClick={() => setCreateMode("announcement")}
            type="button"
          >
            <Bell size={15} /> New announcement channel
          </button>
        ) : null}
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
        <div className={styles.conversations}>
          {visibleConversations.map((conversation) => (
            <button
              className={conversation.id === activeId ? styles.active : ""}
              key={conversation.id}
              onClick={() => setActiveId(conversation.id)}
              type="button"
            >
              <span className={styles.conversationIcon}>
                {conversation.type === "announcement" ? (
                  <Bell size={17} />
                ) : conversation.type === "group" ? (
                  <UsersRound size={17} />
                ) : (
                  <MessageCircle size={17} />
                )}
              </span>
              <span>
                <strong>
                  {mode === "student" && conversation.type === "direct"
                    ? "Academy support"
                    : conversation.title}
                </strong>
                <small>
                  {conversation.lastMessage ?? "No messages yet"}
                </small>
              </span>
              {conversation.unread ? (
                <span className={styles.unread} aria-label="Unread messages" />
              ) : null}
            </button>
          ))}
          {!visibleConversations.length ? (
            <div className={styles.emptyConversations}>
              <MessageCircle size={25} />
              <p>No conversations yet.</p>
            </div>
          ) : null}
        </div>
      </aside>

      <section className={styles.thread}>
        {activeConversation ? (
          <>
            <header className={styles.threadHeader}>
              <div>
                <span>{activeConversation.type}</span>
                <h2>
                  {mode === "student" &&
                  activeConversation.type === "direct"
                    ? "Academy support"
                    : activeConversation.title}
                </h2>
              </div>
              <small>
                {activeConversation.type === "announcement"
                  ? "Mentor announcements"
                  : "Private academy conversation"}
              </small>
            </header>
            <div className={styles.messageList}>
              {loading ? (
                <div className={styles.loading}>
                  <Loader2 className={styles.spin} size={24} />
                </div>
              ) : messages.length ? (
                messages.map((message) => {
                  const own = message.senderUserId === userId;
                  return (
                    <article
                      className={own ? styles.ownMessage : ""}
                      key={message.id}
                    >
                      <div>
                        <strong>{own ? "You" : message.senderName}</strong>
                        <time>
                          {new Intl.DateTimeFormat("en", {
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            month: "short",
                          }).format(new Date(message.createdAt))}
                        </time>
                      </div>
                      <p>{message.body}</p>
                      {message.attachments.map((attachment) => (
                        <button
                          key={attachment.id}
                          onClick={() => openAttachment(attachment.id)}
                          type="button"
                        >
                          <FileUp size={14} /> {attachment.fileName}
                        </button>
                      ))}
                    </article>
                  );
                })
              ) : (
                <div className={styles.emptyThread}>
                  <MessageCircle size={30} />
                  <h3>Start the conversation</h3>
                  <p>Messages and shared files will appear here in realtime.</p>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            {error ? <p className={styles.error}>{error}</p> : null}
            {canPost ? (
              <form
                className={styles.composer}
                onSubmit={sendMessage}
                ref={formRef}
              >
                <textarea
                  aria-label="Message"
                  maxLength={5000}
                  name="body"
                  placeholder="Write a message..."
                  rows={2}
                />
                <label title="Attach image, PDF, or audio">
                  <FileUp size={18} />
                  <input
                    accept="image/png,image/jpeg,image/webp,application/pdf,audio/mpeg,audio/mp4,audio/webm"
                    name="attachment"
                    type="file"
                  />
                </label>
                <button disabled={sending} type="submit">
                  {sending ? (
                    <Loader2 className={styles.spin} size={17} />
                  ) : (
                    <Send size={17} />
                  )}
                  Send
                </button>
              </form>
            ) : (
              <p className={styles.readOnly}>
                This is a read-only announcement channel.
              </p>
            )}
          </>
        ) : (
          <div className={styles.noThread}>
            <MessageCircle size={38} />
            <h2>Your academy inbox</h2>
            <p>Select a conversation to view messages.</p>
          </div>
        )}
      </section>

      {createMode ? (
        <div className={styles.modalOverlay}>
          <form className={styles.modal} onSubmit={createConversation}>
            <header>
              <div>
                <span>New conversation</span>
                <h2>
                  {createMode === "direct"
                    ? "Message a student"
                    : "Create announcement channel"}
                </h2>
              </div>
              <button
                aria-label="Close"
                onClick={() => setCreateMode(null)}
                type="button"
              >
                <X size={18} />
              </button>
            </header>
            {createMode === "direct" ? (
              <label>
                Verified student
                <select name="applicationId" required>
                  <option value="">Select a student</option>
                  {students.map((student) => (
                    <option
                      key={student.applicationId}
                      value={student.applicationId}
                    >
                      {student.fullName}
                      {student.email ? ` - ${student.email}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Channel name
                <input
                  maxLength={160}
                  name="title"
                  placeholder="Academy Updates"
                  required
                />
              </label>
            )}
            {error ? <p className={styles.error}>{error}</p> : null}
            <button disabled={creating} type="submit">
              {creating ? (
                <Loader2 className={styles.spin} size={17} />
              ) : (
                <Plus size={17} />
              )}
              Create conversation
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
