import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getMentorDateStr(utcDate: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(utcDate);
}

function getDayOfWeekFromDateStr(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function localToUTC(dateStr: string, timeStr: string, tz: string): Date {
  const naiveUTC = new Date(`${dateStr}T${timeStr}:00Z`);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(naiveUTC);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0");
  const tzWallMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(naiveUTC.getTime() - (tzWallMs - naiveUTC.getTime()));
}

function advanceDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const traderId = url.searchParams.get("traderId");
  const typeId = url.searchParams.get("typeId");
  if (!traderId || !typeId) {
    return NextResponse.json({ error: "traderId and typeId required." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: app } = await supabase
    .from("student_applications")
    .select("id")
    .eq("student_user_id", user.id)
    .eq("trader_id", traderId)
    .eq("status", "verified")
    .limit(1)
    .maybeSingle();
  if (!app) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: st } = await supabase
    .from("booking_session_types")
    .select("duration_minutes,buffer_minutes,min_notice_hours,advance_booking_days")
    .eq("id", typeId)
    .eq("trader_id", traderId)
    .eq("is_active", true)
    .maybeSingle();
  if (!st) return NextResponse.json({ error: "Session type not found." }, { status: 404 });

  const { data: trader } = await supabase
    .from("traders")
    .select("timezone")
    .eq("id", traderId)
    .maybeSingle();
  const tz = (trader?.timezone as string | null) ?? "UTC";

  const now = new Date();
  const earliestMs = now.getTime() + st.min_notice_hours * 60 * 60 * 1000;
  const endDate = new Date(now.getTime() + st.advance_booking_days * 24 * 60 * 60 * 1000);

  const fromDate = getMentorDateStr(now, tz);
  const toDate = getMentorDateStr(endDate, tz);

  const [{ data: windows }, { data: overrides }, { data: bookings }] = await Promise.all([
    supabase
      .from("mentor_availability")
      .select("day_of_week,start_time,end_time")
      .eq("trader_id", traderId)
      .eq("is_active", true),
    supabase
      .from("availability_overrides")
      .select("override_date,start_time,end_time,is_blocked")
      .eq("trader_id", traderId)
      .gte("override_date", fromDate)
      .lte("override_date", toDate),
    supabase
      .from("bookings")
      .select("starts_at,ends_at")
      .eq("trader_id", traderId)
      .in("status", ["pending", "confirmed"])
      .gte("ends_at", now.toISOString())
      .lte("starts_at", endDate.toISOString()),
  ]);

  const windowsByDay = new Map<number, Array<{ start: string; end: string }>>();
  for (const w of windows ?? []) {
    if (!windowsByDay.has(w.day_of_week)) windowsByDay.set(w.day_of_week, []);
    windowsByDay.get(w.day_of_week)!.push({
      start: (w.start_time as string).slice(0, 5),
      end: (w.end_time as string).slice(0, 5),
    });
  }

  type OverrideData =
    | { isBlocked: true }
    | { isBlocked: false; windows: Array<{ start: string; end: string }> };
  const overridesByDate = new Map<string, OverrideData>();
  for (const o of overrides ?? []) {
    if (o.is_blocked) {
      overridesByDate.set(o.override_date, { isBlocked: true });
    } else {
      const existing = overridesByDate.get(o.override_date);
      const w = {
        start: (o.start_time as string).slice(0, 5),
        end: (o.end_time as string).slice(0, 5),
      };
      if (existing && !existing.isBlocked) {
        existing.windows.push(w);
      } else if (!existing) {
        overridesByDate.set(o.override_date, { isBlocked: false, windows: [w] });
      }
    }
  }

  const bufferMs = st.buffer_minutes * 60 * 1000;
  const durationMs = st.duration_minutes * 60 * 1000;
  const busyIntervals = (bookings ?? []).map((b) => ({
    start: new Date(b.starts_at as string).getTime() - bufferMs,
    end: new Date(b.ends_at as string).getTime() + bufferMs,
  }));

  const slots: Array<{ startsAt: string; endsAt: string }> = [];
  let currentDate = fromDate;

  while (currentDate <= toDate) {
    const override = overridesByDate.get(currentDate);
    const dow = getDayOfWeekFromDateStr(currentDate);

    let dayWindows: Array<{ start: string; end: string }> = [];
    if (override) {
      if (override.isBlocked) {
        currentDate = advanceDateStr(currentDate);
        continue;
      }
      dayWindows = override.windows;
    } else {
      dayWindows = windowsByDay.get(dow) ?? [];
    }

    for (const win of dayWindows) {
      const winStart = localToUTC(currentDate, win.start, tz).getTime();
      const winEnd = localToUTC(currentDate, win.end, tz).getTime();
      let slotStart = winStart;

      while (slotStart + durationMs <= winEnd) {
        const slotEnd = slotStart + durationMs;
        if (slotStart >= earliestMs) {
          const conflict = busyIntervals.some((b) => slotStart < b.end && slotEnd > b.start);
          if (!conflict) {
            slots.push({
              startsAt: new Date(slotStart).toISOString(),
              endsAt: new Date(slotEnd).toISOString(),
            });
          }
        }
        slotStart += 30 * 60 * 1000;
      }
    }

    currentDate = advanceDateStr(currentDate);
  }

  return NextResponse.json(slots);
}
