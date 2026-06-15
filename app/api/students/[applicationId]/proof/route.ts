import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({
  applicationId: z.string().uuid(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid application." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Proof access is not configured." },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const { data: application } = await supabase
    .from("student_applications")
    .select("screenshot_path")
    .eq("id", parsed.data.applicationId)
    .maybeSingle();

  if (!application?.screenshot_path) {
    return NextResponse.json(
      { error: "No screenshot proof was supplied." },
      { status: 404 },
    );
  }

  const { data, error } = await supabase.storage
    .from("verification-proofs")
    .createSignedUrl(application.screenshot_path, 300);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: "The proof could not be opened." },
      { status: 400 },
    );
  }

  return NextResponse.json({ url: data.signedUrl });
}
