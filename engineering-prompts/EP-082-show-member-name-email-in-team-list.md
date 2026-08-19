# EP-082 — Show Member Name/Email in Team List Instead of UUID

## Root Cause

`app/dashboard/settings/page.tsx` fetches member profiles with:
```typescript
supabase.from("profiles").select("id, full_name").in("id", memberUserIds)
```

It does not fetch `email`. When a member's `full_name` is `null` (e.g. Bongani,
whose profile was created without a display name), `getDisplayName()` in
`team-manager.tsx` falls through to its last resort:
```typescript
return profile?.full_name || member.user_id.slice(0, 8) + "…";
```
…and renders the raw UUID — e.g. `1e282f80…` — which tells the workspace owner
nothing.

The fix is two lines: add `email` to the profile select, and use it as a
fallback display value before the UUID.

---

## File changes

### `app/dashboard/settings/page.tsx`

**Replace (line 72):**
```typescript
      ? await supabase.from("profiles").select("id, full_name").in("id", memberUserIds)
```

**With:**
```typescript
      ? await supabase.from("profiles").select("id, full_name, email").in("id", memberUserIds)
```

---

### `components/team-manager.tsx`

**Replace the `Profile` interface (lines 14–17):**
```typescript
interface Profile {
  id: string;
  full_name: string | null;
}
```

**With:**
```typescript
interface Profile {
  id: string;
  full_name: string | null;
  email?: string | null;
}
```

**Replace `getDisplayName` (lines 33–36):**
```typescript
function getDisplayName(member: Member, profiles: Profile[]): string {
  const profile = profiles.find((p) => p.id === member.user_id);
  return profile?.full_name || member.user_id.slice(0, 8) + "…";
}
```

**With:**
```typescript
function getDisplayName(member: Member, profiles: Profile[]): string {
  const profile = profiles.find((p) => p.id === member.user_id);
  return profile?.full_name || profile?.email || member.user_id.slice(0, 8) + "…";
}
```

---

## What does NOT change

- All other settings page logic — unchanged.
- API routes — unchanged.
- Member removal, invite, resend flows — unchanged.

---

## Verification after deploy

1. Open Settings → Team in the TC workspace as `kaisynctech@gmail.com`.
2. The Mentor row must show the member's email address (e.g. `nyaristo01@gmail.com`)
   instead of `1e282f80…`.
3. Owners who have a `full_name` set continue to show their name (name takes
   priority over email — fallback order: `full_name → email → UUID`).
