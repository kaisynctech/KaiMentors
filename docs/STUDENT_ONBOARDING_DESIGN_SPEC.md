# Student Onboarding — Design Spec
**Status:** Approved for Architect Handoff  
**Date:** 2026-06-24  
**Feature:** 4-Step Join Academy Flow + Student Level Classification

---

## 1. Problem

The current `StudentRegistrationForm` shows every field on a single page in one long form. This creates three problems:

1. **Overwhelming first impression.** A student arriving at the academy website sees broker account numbers, MT4/MT5 credentials, and screenshot uploads on first load — before they've had a chance to understand what they're signing up for.
2. **No experience capture.** The platform captures no information about where a student is in their trading journey. Mentors cannot see who is a beginner vs advanced without asking separately.
3. **No broker readiness guidance.** If a student doesn't have a broker account yet, they hit required fields they cannot fill in, with no guidance on how to proceed.

---

## 2. Proposed Solution

Replace the single-page form with a **4-step onboarding flow** inside the existing form card. Add an **experience step** that captures the student's self-reported trading level — this becomes a tag visible to the mentor on the Students dashboard. Add a **broker readiness state** that shows a guide and affiliate link when a student has no account yet.

The left intro panel and overall page layout remain unchanged. Only `StudentRegistrationForm` changes.

---

## 3. Step-by-Step Design

### Step indicator
A simple row of four numbered dots appears at the top of the form card — above the "Student application" heading. Active step is filled (academy primary colour). Completed steps show a checkmark. Upcoming steps are outlined. Labels: Profile · Experience · Broker · Review.

---

### Step 1 — Profile
**Purpose:** Capture identity. Fast, familiar.

Fields:
- Full name (text, required)
- Email address (email, required)
- Phone / WhatsApp number (tel, required, placeholder "+27 82 000 0000")

Note below the fields:  
*"Your password will be created only after your email address is verified."*

Next button: enabled once all three fields are filled.

---

### Step 2 — Your Experience
**Purpose:** Capture self-reported trading level for mentor classification. This is the only step that introduces new data.

Fields:
- **Trading level** — four visual radio cards in a 2×2 grid:
  - Beginner — "Just starting out — learning the basics"
  - Intermediate — "Consistent practice, refining a strategy"
  - Advanced — "Profitable, working on psychology & scale"
  - Funded Trader — "Trading a prop or funded account"
  - Required. Selected card gets a highlighted border using the academy primary colour.
- **How long have you been trading?** — select:
  - Less than 1 year / 1–3 years / 3–5 years / 5+ years
  - Optional.
- **Biggest challenge right now** — textarea (3 rows), placeholder "Risk management, entries, psychology, consistency…"
  - Optional.

Next button: enabled once trading level is selected.

**What this data does:** `level` is stored on `student_applications` and surfaces as a coloured tag on each student row in the mentor's Students dashboard. The tag is read-only — it reflects what the student self-reported at registration. Mentors can see at a glance who registered as a beginner, intermediate, etc. They can optionally create a group from all students of a given level, but nothing is forced.

---

### Step 3 — Broker Setup
**Purpose:** Capture broker credentials. Handle the case where the student has no account yet.

Fields:
- **Broker** — the existing broker select (populated from `brokers` for this academy). Required.
- **Do you have a [BrokerName] account?** — shown once a broker is selected. Toggle: "Yes, I have an account" / "No, not yet".
  - Default: "Yes, I have an account" (most common case).
  - When "No, not yet":
    - Show the affiliate link button (already exists — "Open an account with [BrokerName]").
    - Show a collapsible step guide:
      1. Click the link above to visit [BrokerName] using the academy's referral link.
      2. Complete registration and upload your ID and proof of address.
      3. Wait for account approval (1–2 business days).
      4. Fund your account, then return here to complete your application.
    - **Disable the Next button** with message: "You'll need a verified broker account to complete your application. Come back once your account is ready."
    - The intent is to be helpful, not to block — the student cannot complete registration without an account, so we explain what to do instead.
  - When "Yes, I have an account":
    - Show: Trading account number (required), MT4/MT5 number (required), Screenshot proof (optional upload).
    - The affiliate link is also shown here (smaller, below the form) as a fallback for students who haven't opened via the referral yet.

Next button: enabled when broker is selected, "Yes" is chosen, and trading account + MT4/MT5 are filled.

---

### Step 4 — Review & Submit
**Purpose:** Present a clear summary and risk disclosure before submission.

Layout:
- **What happens next** card:
  > The [Academy Name] team will review your application, verify your broker account details, and activate your student portal access. You'll receive an email confirmation with your login link once approved.
- **Risk disclosure card** (prominent, bordered):
  - Heading: "⚠ Important — please read before submitting"
  - Body: Trading financial instruments involves substantial risk of loss and is not suitable for all investors. Past performance is not indicative of future results. All content provided through [Academy Name] is strictly educational and does not constitute financial advice. You are solely responsible for any trading decisions you make.
- **Consent checkbox** (bold label):
  > I have read and understood the above. I consent to my account details being checked with the selected broker for verification purposes. I accept full responsibility for my own trading decisions.
  Required.

Submit button: labelled "Join Academy" (same as current). Disabled until consent is checked.

**On success:** The current behaviour (redirect to `/account-setup`) is preserved. Before the redirect, briefly show a success state: a checkmark, "Application submitted!", and a one-line note "Check your inbox to verify your email and create your password." Then proceed to `/account-setup`.

---

### Navigation rules
- **Next** validates the current step's required fields before advancing. If validation fails, show inline field errors (same red text style already in the CSS).
- **Back** is always enabled from steps 2–4. Goes to the previous step. No validation on back.
- **Step indicator dots** are not clickable — students cannot skip ahead.
- Form state is held in React component state. If a student navigates back to a previous step, their entries are preserved.

---

## 4. New Data Fields

Two fields are new to the platform (level is required for classification; the others are optional enrichment):

| Field | Type | Required | Where stored |
|---|---|---|---|
| `level` | enum: `beginner`, `intermediate`, `advanced`, `funded` | Yes | `student_applications.trading_level` |
| `years_trading` | enum: `less_than_1`, `1_to_3`, `3_to_5`, `5_plus` | No | `student_applications.years_trading` |
| `challenge` | text (max 500 chars) | No | `student_applications.trading_challenge` |

Existing fields unchanged: `fullName`, `email`, `phoneNumber`, `brokerConnectionId`, `tradingAccountNumber`, `platformAccountNumber`, `screenshotProof`.

---

## 5. Mentor Dashboard — Level Tag

On the Students dashboard (`/dashboard/students`), each student row currently shows: name, email, status badge, review actions.

Add a **level tag** next to the student name. Tags:

| Level | Label | Colour |
|---|---|---|
| `beginner` | Beginner | Blue |
| `intermediate` | Intermediate | Amber |
| `advanced` | Advanced | Green |
| `funded` | Funded Trader | Purple |

The tag is shown only if `trading_level` is set (students registered before this feature have no tag — that's fine).

No new functionality is added to the Students dashboard at this stage. The tag is read-only and informational. The optional "create group from level" action is a separate future feature.

---

## 6. What Is Not Changing

- The `AcademyJoinPage` layout (left intro panel, right card, nav, branding) — unchanged.
- The `/api/student/register` submit target — unchanged.
- The redirect to `/account-setup` on success — unchanged.
- The broker affiliate link behaviour — unchanged.
- The screenshot upload — moved to Step 3, otherwise unchanged.
- The "This academy has not enabled registration yet" empty-brokers guard — stays in Step 3.

---

## 7. Acceptance Criteria

1. A student can complete all 4 steps on desktop and mobile without errors.
2. Selecting "No, not yet" on the broker question disables Next and shows the guide.
3. Selecting "Yes" on the broker question enables Next (once account fields are filled).
4. Back navigation preserves all previously entered values.
5. The level radio cards are keyboard-navigable.
6. Submitting with all required fields populated sends all new fields to the API and creates the application with `trading_level` set.
7. A student who registered before this feature (no `trading_level`) is unaffected — the mentor Students dashboard shows no tag for them.
8. A mentor can see the level tag on the student row in `/dashboard/students`.
9. The existing acceptance runner (`accept-protected-courses-production.mjs`) still passes 31/31.
10. `npm run typecheck` and `npm run build` pass.
