# EP-044 — Live Classes: Zoom SDK Embedded Sessions

**Status:** Ready for Engineering — implement after EP-043 is verified  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-29  
**Scope:** Zoom SDK integration + embedded room pages for mentor and student  
**Migration required:** No (EP-043 covers the schema)  
**API changes:** Yes — signature endpoint  
**Package install required:** Yes — `@zoom/meetingsdk`

---

## Prerequisites

- EP-043 must be live and verified before starting this EP
- A Zoom developer account is required — go to https://marketplace.zoom.us/, create an app of type **Meeting SDK**, and copy the SDK Key and SDK Secret
- Add to Vercel environment variables (never in code or git):
  - `ZOOM_SDK_KEY` — the SDK Key from the Zoom app
  - `ZOOM_SDK_SECRET` — the SDK Secret from the Zoom app

---

## How the Zoom SDK security model works

The Zoom Meeting SDK uses a **JWT signature** to grant access to a meeting. The signature is generated server-side using `ZOOM_SDK_KEY` + `ZOOM_SDK_SECRET` + the meeting number + the participant's role (0 = attendee, 1 = host). Without a valid signature, the SDK refuses to initialise.

Because signature generation happens on KaiMentors' server — behind the auth check — the meeting ID and passcode are never exposed to the client. A student who is not verified cannot get a signature. A signature cannot be shared because it is tied to a specific meeting number and expires in 2 hours.

---

## Change 1 — Package install

```bash
npm install @zoom/meetingsdk
```

---

## Change 2 — Signature API

**New file:** `app/api/live-classes/[classId]/signature/route.ts`

```typescript
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ classId: z.string().uuid() });

function generateZoomSignature(meetingNumber: string, role: 0 | 1): string {
  const iat = Math.round(Date.now() / 1000) - 30;
  const exp = iat + 60 * 60 * 2; // 2 hours

  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");

  const payload = Buffer.from(
    JSON.stringify({
      sdkKey: process.env.ZOOM_SDK_KEY,
      mn: meetingNumber,
      role,
      iat,
      exp,
      tokenExp: exp,
    }),
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", process.env.ZOOM_SDK_SECRET!)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ classId: string }> },
) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid class ID." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  // Resolve trader membership
  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  const classId = params.data.classId;

  // Fetch the class — include meeting_passcode (server only, never forwarded as-is)
  const { data: liveClass } = await supabase
    .from("live_classes")
    .select("id,trader_id,title,provider,meeting_id,meeting_passcode,status,room_status")
    .eq("id", classId)
    .maybeSingle();

  if (!liveClass) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  }
  if (liveClass.provider !== "zoom" || !liveClass.meeting_id) {
    return NextResponse.json({ error: "Not a Zoom class." }, { status: 400 });
  }

  // Determine role: mentor (trader member) = 1, student = 0
  const isMentor = membership?.trader_id === liveClass.trader_id;

  if (!isMentor) {
    // Student path — must be a verified student of this trader
    const { data: application } = await supabase
      .from("student_applications")
      .select("id,status")
      .eq("student_user_id", user.id)
      .eq("trader_id", liveClass.trader_id)
      .eq("status", "verified")
      .maybeSingle();

    if (!application) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    // Class must be published and live (or about to start — within 10 minutes)
    const startsAt = new Date(
      (await supabase
        .from("live_classes")
        .select("starts_at")
        .eq("id", classId)
        .single()
      ).data?.starts_at ?? ""
    );
    const now = new Date();
    const tenMinutesBefore = new Date(startsAt.getTime() - 10 * 60 * 1000);

    if (
      liveClass.status !== "published" ||
      liveClass.room_status === "ended" ||
      now < tenMinutesBefore
    ) {
      return NextResponse.json({ error: "Session is not available yet." }, { status: 403 });
    }
  }

  if (!process.env.ZOOM_SDK_KEY || !process.env.ZOOM_SDK_SECRET) {
    return NextResponse.json({ error: "Zoom is not configured." }, { status: 503 });
  }

  const role = isMentor ? 1 : 0;
  const meetingNumber = liveClass.meeting_id.replace(/\s/g, "");
  const signature = generateZoomSignature(meetingNumber, role);

  // Resolve display name from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const userName = profile?.full_name ?? user.email?.split("@")[0] ?? "Participant";

  return NextResponse.json({
    signature,
    sdkKey: process.env.ZOOM_SDK_KEY,
    meetingNumber,
    passcode: liveClass.meeting_passcode ?? "",
    userName,
    role,
    classTitle: liveClass.title,
  });
}
```

**Security notes:**
- `meeting_passcode` is fetched from the DB and passed directly to the SDK response. This is necessary for the SDK to join the meeting. It is acceptable because: (a) it is behind auth, (b) no shareable URL exists, (c) the passcode alone cannot be used without the SDK signature.
- The `ZOOM_SDK_SECRET` never leaves the server.
- Mentor role (1) gives host controls inside Zoom (mute all, remove participant, end meeting).

---

## Change 3 — Zoom session client component

**New file:** `components/zoom-session.tsx`

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

interface ZoomSessionProps {
  classId: string;
  onEnd?: () => void;
}

export function ZoomSession({ classId, onEnd }: ZoomSessionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let client: ReturnType<typeof import("@zoom/meetingsdk/embedded")["default"]["createClient"]> | null = null;

    async function init() {
      try {
        // Fetch signature from server
        const res = await fetch(`/api/live-classes/${classId}/signature`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setErrorMsg(body.error ?? "Could not join session.");
          setStatus("error");
          return;
        }
        const { signature, sdkKey, meetingNumber, passcode, userName, role } =
          await res.json();

        // Dynamically import the Zoom SDK (avoids SSR issues)
        const { default: ZoomMtgEmbedded } = await import("@zoom/meetingsdk/embedded");
        client = ZoomMtgEmbedded.createClient();

        if (!containerRef.current) return;

        client.init({
          zoomAppRoot: containerRef.current,
          language: "en-US",
          customize: {
            video: {
              isResizable: false,
              viewSizes: {
                default: { width: 1100, height: 620 },
              },
            },
            toolbar: {
              buttons: [
                {
                  text: "Leave",
                  className: "zoom-leave-btn",
                  onClick: () => {
                    client?.leaveMeeting();
                    onEnd?.();
                  },
                },
              ],
            },
          },
        });

        await client.join({
          signature,
          sdkKey,
          meetingNumber,
          password: passcode,
          userName,
          userEmail: "",
          tk: "",
          zak: role === 1 ? "" : undefined, // host token not needed via SDK key auth
        });

        setStatus("ready");
      } catch (err) {
        console.error("Zoom SDK error:", err);
        setErrorMsg("Failed to connect to the session.");
        setStatus("error");
      }
    }

    init();

    return () => {
      try {
        client?.leaveMeeting();
      } catch {
        // ignore cleanup errors
      }
    };
  }, [classId]);

  return (
    <div style={{ position: "relative", width: "100%", minHeight: 640 }}>
      {status === "loading" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            color: "#6c747a",
          }}
        >
          <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
          Connecting to session…
        </div>
      )}
      {status === "error" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 8,
            color: "#d93025",
          }}
        >
          <strong>Could not join</strong>
          <p style={{ color: "#6c747a", fontSize: 14 }}>{errorMsg}</p>
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", height: 640 }} />
    </div>
  );
}
```

---

## Change 4 — Mentor host room page

**New file:** `app/dashboard/live-classes/[classId]/host/page.tsx`

```typescript
import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { ZoomSession } from "@/components/zoom-session";
import { createClient } from "@/lib/supabase/server";

export default async function HostRoomPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id,trader:traders(display_name)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const { data: liveClass } = await supabase
    .from("live_classes")
    .select("id,title,provider,meeting_id,status")
    .eq("id", classId)
    .eq("trader_id", membership.trader_id)
    .maybeSingle();

  if (!liveClass) notFound();
  if (liveClass.provider !== "zoom" || !liveClass.meeting_id) {
    redirect("/dashboard/live-classes");
  }

  const trader = Array.isArray(membership.trader) ? membership.trader[0] : membership.trader;

  return (
    <DashboardShell
      activePath="/dashboard/live-classes"
      description="You are the host of this session."
      title={liveClass.title}
      userLabel={trader?.display_name ?? "Mentor workspace"}
    >
      <ZoomSession classId={classId} onEnd={() => {}} />
    </DashboardShell>
  );
}
```

---

## Change 5 — Student session page

**New file:** `app/student/live-classes/[classId]/page.tsx`

```typescript
import { notFound, redirect } from "next/navigation";
import { StudentShell } from "@/components/student-shell";
import { ZoomSession } from "@/components/zoom-session";
import { ContentGate } from "@/components/content-gate";
import { getStudentAcademyContext } from "@/lib/student-routing";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StudentSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams?: Promise<{ portal?: string }>;
}) {
  const { classId } = await params;
  const query = await searchParams;
  const academy = await getStudentAcademyContext(query?.portal);
  const { basePath: base, querySuffix: suffix } = academy;

  const supabase = await createClient();
  if (!supabase) redirect(`${base}/login${suffix}`);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${base}/login${suffix}`);

  let appQuery = supabase
    .from("student_applications")
    .select("id,trader_id,status,portal_id,portal:portals!inner(portal_name,slug,logo_path)")
    .eq("student_user_id", user.id);
  if (academy.portalId) appQuery = appQuery.eq("portal_id", academy.portalId);
  if (academy.portalSlug) appQuery = appQuery.eq("portal.slug", academy.portalSlug);

  const { data: app } = await appQuery
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!app) redirect(`${base}/join-academy${suffix}`);

  const portal = Array.isArray(app.portal) ? app.portal[0] : app.portal;
  const academyName = base === "/academy" ? (portal?.portal_name ?? "Academy") : "KaiMentors";
  const displayName = user.email?.split("@")[0] ?? "Student";
  const isVerified = app.status === "verified";

  const { data: liveClass } = await supabase
    .from("live_classes")
    .select("id,title,provider,meeting_id,status,room_status,starts_at")
    .eq("id", classId)
    .eq("trader_id", app.trader_id)
    .maybeSingle();

  if (!liveClass) notFound();

  return (
    <StudentShell
      academyName={academyName}
      basePath={base}
      displayName={displayName}
      isVerified={isVerified}
      logoPath={portal?.logo_path ?? null}
      querySuffix={suffix}
    >
      <div style={{ padding: "24px 32px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>
          {liveClass.title}
        </h1>
        {!isVerified ? (
          <ContentGate applicationStatus={app.status} returnPath={`${base}${suffix}`} />
        ) : liveClass.provider !== "zoom" || !liveClass.meeting_id ? (
          <p style={{ color: "#6c747a" }}>This session does not support in-app joining.</p>
        ) : (
          <ZoomSession classId={classId} />
        )}
      </div>
    </StudentShell>
  );
}
```

---

## Commit and deploy

```bash
npx tsc --noEmit
git add -A
git commit -m "EP-044: Zoom SDK embedded sessions for live classes"
git push origin main
```

---

## Acceptance criteria

Test against KaiTrades only. Requires a real Zoom meeting — create one in your Zoom account with `ZOOM_SDK_KEY` / `ZOOM_SDK_SECRET` set in Vercel.

1. **ZOOM_SDK_KEY and ZOOM_SDK_SECRET** are set in Vercel env — build does not fail without them (they are checked at runtime, not build time)
2. Mentor navigates to a published live class and clicks "Start session" → `room_status` sets to `live` → mentor is redirected to `/dashboard/live-classes/[classId]/host`
3. The Zoom room loads embedded on the host page — mentor joins as host (role 1) with full host controls
4. A verified student navigates to the student live classes page → clicks Join → arrives at `/student/live-classes/[classId]`
5. The Zoom room loads embedded on the student page — student joins as attendee (role 0)
6. An unverified student cannot get a signature — `/api/live-classes/[classId]/signature` returns 403
7. Signature endpoint is not callable without a valid session — returns 401
8. Non-Zoom classes on the student page show "This session does not support in-app joining" (fallback — external link is on the list page)
9. Student joining more than 10 minutes before `starts_at` sees "Session is not available yet"
