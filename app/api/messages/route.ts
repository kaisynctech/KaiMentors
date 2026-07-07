import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  conversationId: z.string().uuid(),
});
const allowedAttachmentTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
]);

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120) || "attachment";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    conversationId: url.searchParams.get("conversationId"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid conversation." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Messaging is not configured." },
      { status: 503 },
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id,trader_id,type,post_policy")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("messages")
    .select(
      "id,body,sender_user_id,created_at,sender:profiles!sender_user_id(full_name),attachments:message_attachments(id,file_name,mime_type)",
    )
    .eq("conversation_id", parsed.data.conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { error: "Messages could not be loaded." },
      { status: 403 },
    );
  }

  const postPolicy =
    (conversation.post_policy as "mentors_only" | "everyone" | null) ??
    "mentors_only";

  const { data: isMentor } = await supabase.rpc("is_trader_member", {
    target_trader_id: conversation.trader_id,
  });

  const canPost =
    conversation.type === "announcement"
      ? Boolean(isMentor)
      : postPolicy === "everyone" || Boolean(isMentor);

  await supabase.rpc("mark_conversation_read", {
    target_conversation_id: parsed.data.conversationId,
  });

  const messages = [...(data ?? [])].reverse().map((message) => {
    const sender = Array.isArray(message.sender)
      ? message.sender[0] ?? null
      : message.sender;
    return {
      id: message.id,
      body: message.body,
      senderUserId: message.sender_user_id,
      senderName: sender?.full_name ?? "User",
      createdAt: message.created_at,
      attachments: (message.attachments ?? []).map((attachment) => ({
        id: attachment.id,
        fileName: attachment.file_name,
        mimeType: attachment.mime_type,
      })),
    };
  });

  return NextResponse.json({
    messages,
    userId: user.id,
    canPost,
    postPolicy,
    conversationType: conversation.type,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Messaging is not configured." },
      { status: 503 },
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const formData = await request.formData();
  const parsed = z
    .object({
      conversationId: z.string().uuid(),
      clientMessageId: z.string().uuid(),
      body: z.string().trim().max(5000),
    })
    .superRefine((value, context) => {
      const attachment = formData.get("attachment");
      if (
        !value.body &&
        (!(attachment instanceof File) || attachment.size === 0)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A message or attachment is required.",
        });
      }
    })
    .safeParse({
      conversationId: formData.get("conversationId"),
      clientMessageId: formData.get("clientMessageId"),
      body: formData.get("body") ?? "",
    });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Write a message or attach a file." },
      { status: 400 },
    );
  }

  const attachment = formData.get("attachment");
  if (
    attachment instanceof File &&
    attachment.size > 0 &&
    (!allowedAttachmentTypes.has(attachment.type) ||
      attachment.size > 25 * 1024 * 1024)
  ) {
    return NextResponse.json(
      {
        error:
          "Attachments must be images, PDFs, or audio files smaller than 25 MB.",
      },
      { status: 400 },
    );
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id,trader_id")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  let storagePath: string | null = null;
  if (attachment instanceof File && attachment.size > 0) {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Message attachments are not configured." },
        { status: 503 },
      );
    }
    const fileName = safeFileName(attachment.name);
    storagePath = `${conversation.trader_id}/${conversation.id}/${parsed.data.clientMessageId}/${fileName}`;
    const { error: uploadError } = await admin.storage
      .from("message-attachments")
      .upload(storagePath, attachment, {
        cacheControl: "3600",
        contentType: attachment.type,
        upsert: false,
      });
    if (uploadError) {
      return NextResponse.json(
        { error: "The attachment could not be uploaded." },
        { status: 400 },
      );
    }

  }

  const { data: messageId, error: messageError } = await supabase.rpc(
    "create_conversation_message",
    {
      target_conversation_id: conversation.id,
      target_client_message_id: parsed.data.clientMessageId,
      target_body: parsed.data.body,
      target_attachment_path: storagePath,
      target_attachment_name:
        attachment instanceof File && attachment.size > 0
          ? attachment.name.slice(0, 255)
          : null,
      target_attachment_mime_type:
        attachment instanceof File && attachment.size > 0
          ? attachment.type
          : null,
      target_attachment_size:
        attachment instanceof File && attachment.size > 0
          ? attachment.size
          : null,
    },
  );
  if (messageError || !messageId) {
    if (storagePath) {
      const admin = createAdminClient();
      await admin?.storage.from("message-attachments").remove([storagePath]);
    }
    return NextResponse.json(
      { error: "The message could not be sent." },
      { status: 400 },
    );
  }

  return NextResponse.json({ messageId }, { status: 201 });
}
