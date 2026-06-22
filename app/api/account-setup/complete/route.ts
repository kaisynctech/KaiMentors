import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({ setupToken: z.string().min(40).max(100) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!parsed.success || !accessToken || !url || !anonKey) {
    return NextResponse.json({ error: "Verified account setup is required." }, { status: 401 });
  }
  const authenticated = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authenticated.rpc("complete_account_setup", {
    target_setup_token: parsed.data.setupToken,
  });
  if (error) return NextResponse.json({ error: "Account setup could not be completed." }, { status: 409 });
  return NextResponse.json(data);
}
