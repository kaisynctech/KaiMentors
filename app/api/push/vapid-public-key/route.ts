import { NextResponse } from "next/server";

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json(
      { error: "Push notifications are not configured." },
      { status: 503 },
    );
  }

  return NextResponse.json({ publicKey });
}
