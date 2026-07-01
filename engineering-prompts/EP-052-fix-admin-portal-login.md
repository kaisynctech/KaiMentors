# EP-052 — Fix: super_admin blocked from portal login

## Problem

`kaisynctech@gmail.com` is both the platform super admin and the owner of four workspaces.
The academy portal login form checks `profile.role === "super_admin"` and throws
`"Platform admin accounts cannot use academy login."` **before** it checks `trader_members`.
This means the workspace owner can never log in via their own portal login page.

## Fix

In `components/login-form.tsx`, inside the `if (academyContext)` block, move the
`trader_members` check to run **before** the `super_admin` guard. A mentor/owner who happens
to be a super admin must be routed to their workspace dashboard first. The super_admin block
remains — it now only fires when the admin has no membership in the academy (i.e. they
genuinely shouldn't be here).

## Exact edit — `components/login-form.tsx`

Find and replace the entire `if (academyContext) { ... }` block (currently lines 51–83).

**Before:**
```ts
if (academyContext) {
  if (profile?.role === "super_admin") {
    await supabase.auth.signOut();
    throw new Error("Platform admin accounts cannot use academy login.");
  }

  // Mentor of this academy (trader_members row) takes priority.
  const { data: membership } = await supabase
    .from("trader_members")
    .select("id")
    .eq("user_id", data.user.id)
    .eq("trader_id", academyContext.traderId)
    .maybeSingle();
  if (membership) {
    window.location.href = academyContext.mentorDestination;
    return;
  }

  // Student at this academy.
  const { data: application } = await supabase
    .from("student_applications")
    .select("id")
    .eq("student_user_id", data.user.id)
    .eq("trader_id", academyContext.traderId)
    .maybeSingle();
  if (application) {
    window.location.href = academyContext.studentDestination;
    return;
  }

  await supabase.auth.signOut();
  throw new Error("No account was found for this academy.");
}
```

**After:**
```ts
if (academyContext) {
  // Mentor/owner check runs first — a super_admin who owns this workspace
  // must be routed to the mentor dashboard, not blocked.
  const { data: membership } = await supabase
    .from("trader_members")
    .select("id")
    .eq("user_id", data.user.id)
    .eq("trader_id", academyContext.traderId)
    .maybeSingle();
  if (membership) {
    document.cookie = `km_workspace=${academyContext.traderId}; path=/; max-age=2592000; SameSite=Lax`;
    window.location.href = academyContext.mentorDestination;
    return;
  }

  // No membership — block super_admin from going further.
  if (profile?.role === "super_admin") {
    await supabase.auth.signOut();
    throw new Error("Platform admin accounts cannot use academy login.");
  }

  // Student at this academy.
  const { data: application } = await supabase
    .from("student_applications")
    .select("id")
    .eq("student_user_id", data.user.id)
    .eq("trader_id", academyContext.traderId)
    .maybeSingle();
  if (application) {
    window.location.href = academyContext.studentDestination;
    return;
  }

  await supabase.auth.signOut();
  throw new Error("No account was found for this academy.");
}
```

Note: the `km_workspace` cookie set (added in EP-051) is now consolidated here — remove any
duplicate cookie line if EP-051 added it separately.

## Acceptance criteria

- [ ] Log in via `/portal/traders-confidence/login` with `kaisynctech@gmail.com` → lands on
  Traders Confidence dashboard (no "Platform admin" error)
- [ ] Log in via `/portal/pasii/login` → lands on PASII dashboard
- [ ] Log in via `/portal/milkers-fx/login` → lands on Milkers FX dashboard
- [ ] A super_admin with **no** membership in an academy still gets the block error
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Deploy with `vercel --prod`
