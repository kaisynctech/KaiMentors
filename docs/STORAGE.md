# Storage

## Multi-Academy Assets

Custom package asset roots are immutable package metadata and are not shared between KaiTrades (`/custom-sites/kaitrades/v1`), Traders Confidence (`/custom-sites/traders-confidence/v1`) and Milkers FX (`/custom-sites/milkers-fx/v1`). Tenant uploads continue to use trader-prefixed storage paths and existing storage RLS. Core Academy Page logo updates use `portal-branding/{trader_id}/...`; replacing a logo removes the prior object only after the database update succeeds.

Last updated: 2026-06-18

## Provider

KaiMentors uses Supabase Storage for user-uploaded and tenant-owned files.

## Buckets

### `portal-branding`

Purpose: Portal logos, favicons, and branding assets.

Access: Public read for portal branding assets; tenant members manage their own portal assets.

Used by: Portal Branding and public portal rendering.

### `course-content`

Purpose: Protected course video, PDF, and image source assets.

Access: Tenant staff manage tenant-prefixed paths. Students have no direct object SELECT policy; an authorized five-minute media session supplies a server-signed URL.

Used by: Shared Media Library, mixed-media lesson player, galleries, and supporting resources.

### `avatars`

Purpose: User avatar images.

Access: Users read/manage their own avatar according to storage policies.

Used by: Profiles and messaging identity.

### `verification-proofs`

Purpose: Student screenshot proof for broker verification.

Access: Owning students and tenant reviewers can read; students upload their own proof; tenant reviewers manage.

Used by: Student registration and review.

#### Resubmission path

When a student resubmits a screenshot (application in `manual_review` status), the client uploads directly to:

```
{trader_id}/{student_user_id}/resubmission/verification.{ext}
```

The upload uses `upsert: true` so repeated submissions overwrite the previous file at the same path. After a successful upload, the client calls `PATCH /api/student/verification-screenshot` to update `student_applications.verification_screenshot_path`. The API validates path ownership (segment 1 === user.id) and trader tenancy (segment 0 === application.trader_id) before writing.

Storage policies for the resubmission path are applied in migration `202606240028` and use `storage.foldername(name)` array indexing to verify the bucket's path structure.

### `website-media`

Purpose: Website Builder assets such as logos, hero images, template images, and page media.

Access: Published website media can be public; tenant members manage their own website media.

Used by: Website Builder and public website rendering.

### `message-attachments`

Purpose: Files attached to direct, group, or announcement conversations.

Access: Conversation participants can read message files.

Used by: In-app messaging.

## Upload Flows

- Branding uploads go through portal branding APIs and tenant-aware paths.
- Verification proofs are uploaded during student registration/review and tied to verification attempts.
- Website media uploads go through Website Builder media APIs and records are stored in `website_media`.
- Course media uses resumable TUS uploads directly to Supabase Storage. The application initializes normalized metadata, validates size/type/extension, verifies binary signature after upload, and only then marks the asset ready.
- Paths use `{trader_id}/media/{media_id}/source.{extension}`. Legacy lesson/resource paths are normalized by migration `025` only when their media type can be proven.
- Message attachments are tied to conversations and messages.

## Security Model

- Storage paths should include tenant or user context.
- Public buckets/policies are limited to assets intended for public rendering.
- Protected content buckets rely on RLS-aware storage policies.
- Service-role uploads must remain server-only.
- Any new bucket requires documentation in this file and an entry in `CHANGELOG.md`.

Custom website package assets under `public/custom-sites` are deployment artifacts, not Supabase Storage objects. KaiTrades uses `/custom-sites/kaitrades/v1/assets/kaitrades-logo.svg`; it does not reference the Traders Confidence asset directory or tenant-uploaded media paths. No storage bucket or storage policy changed for the KaiTrades fixture.
