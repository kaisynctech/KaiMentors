import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// MB-124: shared group-grant sync for broadcast content (announcements,
// live classes) that supports access_scope = 'restricted'. There is no
// generic set_content_access() RPC -- verified in pg_proc before writing
// this; only set_course_access() exists, and it's course-specific (writes
// access_mode, not access_scope, and has its own uniqueness assumptions).
// Rather than extend that course-only RPC, this does the same
// delete-then-insert content_access_grants pattern directly, scoped to
// entity types that only ever grant by group (never individual students)
// today.
//
// Uses the caller's session-scoped Supabase client deliberately, not the
// admin client -- content_access_grants' only write policy
// ("tenant members manage content grants") already permits any trader
// member to manage grants for their own workspace, so no RLS bypass is
// needed here.
export async function syncGroupGrants(
  supabase: SupabaseClient,
  params: {
    traderId: string;
    entityType: "announcement" | "live_class";
    entityId: string;
    groupIds: string[];
    grantedBy: string;
  },
) {
  const { traderId, entityType, entityId, groupIds, grantedBy } = params;

  // Full-replace: clear any existing group-based grants for this entity,
  // then insert the current selection. Scoped to student_user_id is null
  // so this never touches an individual-student grant, even though none
  // are ever written for these two entity types today.
  const { error: deleteError } = await supabase
    .from("content_access_grants")
    .delete()
    .eq("trader_id", traderId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("student_user_id", null);

  if (deleteError) {
    console.error("MB-124 grant sync: could not clear existing grants:", deleteError);
    return { ok: false as const };
  }

  if (groupIds.length === 0) return { ok: true as const };

  const { error: insertError } = await supabase.from("content_access_grants").insert(
    groupIds.map((groupId) => ({
      trader_id: traderId,
      entity_type: entityType,
      entity_id: entityId,
      group_id: groupId,
      granted_by: grantedBy,
    })),
  );

  if (insertError) {
    console.error("MB-124 grant sync: could not insert new grants:", insertError);
    return { ok: false as const };
  }

  return { ok: true as const };
}
