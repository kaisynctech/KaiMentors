import { NextResponse } from "next/server";
import { requireCourseUser } from "@/lib/course-access";
import {
  authorizeCourseMediaRange,
  fetchCourseMediaRange,
} from "@/lib/course-media-range";
import { parseCourseMediaByteRange } from "@/lib/media-limits";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  const { mediaId } = await params;
  const auth = await requireCourseUser();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const range = parseCourseMediaByteRange(url.searchParams.get("start"), url.searchParams.get("end"));
  if (!range) {
    return NextResponse.json({ error: "Byte range is invalid." }, { status: 400 });
  }

  const target = await authorizeCourseMediaRange(auth.supabase, auth.user.id, mediaId);
  if (!target) {
    return NextResponse.json({ error: "Media is unavailable." }, { status: 404 });
  }
  if (target.mimeType !== "video/mp4") {
    return NextResponse.json({ error: "Chunked playback is only for MP4 lessons." }, { status: 415 });
  }
  if (target.sizeBytes && range.start >= target.sizeBytes) {
    return NextResponse.json({ error: "Byte range is past the end of the file." }, { status: 416 });
  }
  const end = target.sizeBytes ? Math.min(range.end, target.sizeBytes - 1) : range.end;

  const fetched = await fetchCourseMediaRange(target, range.start, end);
  if (!fetched.ok) {
    return NextResponse.json({ error: "Media range could not be read." }, { status: fetched.status });
  }

  const total =
    fetched.response.headers.get("content-range")?.split("/")[1] ??
    (target.sizeBytes ? String(target.sizeBytes) : "*");
  const length = fetched.response.headers.get("content-length") ?? String(end - range.start + 1);

  return new NextResponse(fetched.response.body, {
    status: 206,
    headers: {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Content-Length": length,
      "Content-Range": `bytes ${range.start}-${end}/${total}`,
      "Content-Type": "video/mp4",
    },
  });
}
