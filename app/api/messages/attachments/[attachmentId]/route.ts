import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const parsed = z
    .object({ attachmentId: z.string().uuid() })
    .safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid attachment." }, { status: 400 });
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

  const { data: attachment } = await supabase
    .from("message_attachments")
    .select("storage_path")
    .eq("id", parsed.data.attachmentId)
    .maybeSingle();
  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("message-attachments")
    .createSignedUrl(attachment.storage_path, 300);
  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: "The attachment could not be opened." },
      { status: 400 },
    );
  }

  return NextResponse.json({ url: data.signedUrl });
}
