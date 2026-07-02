import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Storage not configured." }, { status: 503 });

  const { data, error } = await admin.storage
    .from("academy-media")
    .createSignedUrl(path, 3600);

  if (error || !data) {
    return NextResponse.json({ error: "Could not generate URL." }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
