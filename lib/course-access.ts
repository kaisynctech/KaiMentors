import "server-only";
import { isAcademyActive, isSuperAdminUser } from "@/lib/entitlements";
import { getMentorWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export async function requireCourseUser() {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Course services are not configured.", status: 503 } as const;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again.", status: 401 } as const;
  return { ok: true, supabase, user } as const;
}

export async function requireMentorCourseContext(options?: { allowInactive?: boolean }) {
  const workspace = await getMentorWorkspace();
  if (!workspace) return { ok: false, error: "Mentor workspace not found.", status: 403 } as const;

  if (!options?.allowInactive) {
    const bypass = await isSuperAdminUser();
    if (!bypass) {
      const active = await isAcademyActive(workspace.traderId);
      if (!active) {
        return {
          ok: false,
          error: "Subscription inactive. Renew to continue.",
          status: 402,
        } as const;
      }
    }
  }

  return { ok: true, supabase: workspace.supabase, user: workspace.user, traderId: workspace.traderId, memberRole: workspace.role } as const;
}

export const COURSE_MEDIA_RULES = {
  video: { types: ["video/mp4", "video/webm"], extensions: ["mp4", "webm"], max: 500 * 1024 * 1024 },
  pdf: { types: ["application/pdf"], extensions: ["pdf"], max: 100 * 1024 * 1024 },
  image: { types: ["image/png", "image/jpeg", "image/webp"], extensions: ["png", "jpg", "jpeg", "webp"], max: 20 * 1024 * 1024 },
} as const;

export function fileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function signatureMatches(bytes: Uint8Array, mime: string) {
  if (mime === "application/pdf") return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (mime === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (mime === "video/webm") return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (mime === "video/mp4") return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  return false;
}
