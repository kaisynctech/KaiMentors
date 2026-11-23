import { redirect } from "next/navigation";
import {
  AffiliateFrame,
  AffiliateJoinForm,
  AffiliateProfileForm,
  CopyRow,
} from "@/components/affiliate-dashboard-client";
import { formatZarFromCents } from "@/lib/referral-math";
import { loadReferralPortal } from "@/lib/referrals";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import styles from "./affiliate-dashboard.module.css";

const HOLD_DAYS = 30;
const MIN_PAYOUT_CENTS = 20000;
const DAY = 24 * 60 * 60 * 1000;

/** "Thandi Mokoena" -> "Thandi M." so affiliates never see a referred student's full name. */
function maskName(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Student";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

function shortDate(value: string | Date) {
  return new Date(value).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function planLabel(planId: string | null | undefined) {
  if (!planId) return "—";
  return planId.charAt(0).toUpperCase() + planId.slice(1);
}

function themeKeyFor(slug: string) {
  return slug === "kaisync-institution" ? "ksi-theme" : `km-theme-${slug}`;
}

export async function ReferralAccountPage({
  portalSlug,
  loginPath,
  joinPath,
}: {
  portalSlug: string;
  loginPath: string;
  joinPath: string;
}) {
  const supabase = await createClient();
  if (!supabase) redirect(loginPath);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginPath);
  const admin = createAdminClient();
  if (!admin) redirect(loginPath);
  const portal = await loadReferralPortal(admin, portalSlug);
  if (!portal) redirect("/");

  const onPlatform = joinPath.startsWith("/portal/");
  const homePath = onPlatform ? `/portal/${portal.slug}` : "/";
  const termsPath = onPlatform ? `/portal/${portal.slug}/affiliate-terms` : "/affiliate-terms";
  const themeKey = themeKeyFor(portal.slug);

  const brand = (
    <a className={styles.brand} href={homePath}>
      <span className={styles.brandMark}>{portal.portal_name.slice(0, 1).toUpperCase()}</span>
      <span className={styles.brandName}>{portal.portal_name}</span>
      <span className={styles.badge}>Affiliate</span>
    </a>
  );
  const actions = (
    <a className={styles.ghostLink} href={homePath}>
      <span className={styles.ghostLinkLong}>Back to </span>website
    </a>
  );

  const { data: partner } = await admin
    .from("referral_partners")
    .select("id,code,full_name,email,phone,country,promo_channel,promo_link,status,created_at")
    .eq("portal_id", portal.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!partner) {
    const { data: profile } = await admin.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle();
    return (
      <AffiliateFrame
        actions={actions}
        brand={brand}
        intro={
          <div className={styles.joinWrap}>
            <div className={styles.hello}>
              <div>
                <h1>Become an affiliate</h1>
                <p>Earn 10% of every payment from the students you refer, for as long as they stay subscribed.</p>
              </div>
            </div>
            <div className={styles.panel}>
              <AffiliateJoinForm
                email={profile?.email ?? user.email ?? ""}
                fullName={profile?.full_name ?? ""}
                portalSlug={portal.slug}
                termsHref={termsPath}
              />
            </div>
          </div>
        }
        themeKey={themeKey}
      />
    );
  }

  const now = Date.now();
  const since30 = new Date(now - 30 * DAY).toISOString();

  const [{ data: attributions }, { data: commissions }, { count: clicks30 }, { count: clicksAll }] = await Promise.all([
    admin
      .from("referral_attributions")
      .select("id,student_application_id,created_at")
      .eq("referral_partner_id", partner.id)
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("referral_commissions")
      .select("id,student_name,plan_id,payment_amount_cents,commission_cents,status,created_at,paid_at")
      .eq("referral_partner_id", partner.id)
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("referral_clicks")
      .select("id", { count: "exact", head: true })
      .eq("referral_partner_id", partner.id)
      .gte("created_at", since30),
    admin
      .from("referral_clicks")
      .select("id", { count: "exact", head: true })
      .eq("referral_partner_id", partner.id),
  ]);

  const applicationIds = (attributions ?? []).map((row) => row.student_application_id);
  const [{ data: applications }, { data: subscriptions }] = applicationIds.length
    ? await Promise.all([
        admin.from("student_applications").select("id,full_name").in("id", applicationIds),
        admin
          .from("student_subscriptions")
          .select("student_application_id,plan_id,status,created_at")
          .in("student_application_id", applicationIds)
          .order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  const nameById = new Map((applications ?? []).map((row) => [row.id, row.full_name as string | null]));
  const subByApp = new Map<string, { plan_id: string; status: string }>();
  for (const sub of subscriptions ?? []) {
    if (!subByApp.has(sub.student_application_id)) subByApp.set(sub.student_application_id, sub);
  }

  const referrals = (attributions ?? []).map((row) => {
    const sub = subByApp.get(row.student_application_id);
    const state =
      sub?.status === "active" ? "paying" : sub?.status === "cancelled" ? "cancelled" : sub?.status === "payment_failed" ? "failed" : "joined";
    return { id: row.id, name: maskName(nameById.get(row.student_application_id)), joined: row.created_at, plan: sub?.plan_id ?? null, state };
  });
  const paying = referrals.filter((row) => row.state === "paying").length;

  const rows = (commissions ?? []).map((row) => {
    const availableAt = new Date(new Date(row.created_at).getTime() + HOLD_DAYS * DAY);
    const phase =
      row.status === "paid" ? "paid" : row.status === "void" ? "void" : availableAt.getTime() > now ? "pending" : "available";
    return { ...row, availableAt, phase };
  });
  const sum = (phase: string) => rows.filter((row) => row.phase === phase).reduce((total, row) => total + row.commission_cents, 0);
  const pending = sum("pending");
  const available = sum("available");
  const paid = sum("paid");
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thisMonth = rows
    .filter((row) => row.phase !== "void" && new Date(row.created_at) >= monthStart)
    .reduce((total, row) => total + row.commission_cents, 0);
  const towardPayout = Math.min(100, Math.round((available / MIN_PAYOUT_CENTS) * 100));

  const shareLink = `${homePath}?ref=${partner.code}`;
  const enrolLink = `${joinPath}?ref=${partner.code}`;
  const firstName = (partner.full_name ?? "").split(/\s+/)[0] || "there";
  const suspended = partner.status === "suspended";

  const pill = (phase: string) =>
    phase === "paid" || phase === "paying"
      ? styles.pillGood
      : phase === "pending" || phase === "failed"
        ? styles.pillWarn
        : phase === "available"
          ? styles.pillGood
          : styles.pillMuted;

  const stateLabel: Record<string, string> = { paying: "Paying", joined: "Signed up", cancelled: "Cancelled", failed: "Payment failed" };

  const referralsTable = (limit?: number) =>
    referrals.length === 0 ? (
      <div className={styles.empty}>
        <b>No referrals yet</b>
        Share your link. People who sign up through it appear here.
      </div>
    ) : (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Student</th><th>Joined</th><th>Plan</th><th>Status</th></tr>
          </thead>
          <tbody>
            {referrals.slice(0, limit ?? referrals.length).map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{shortDate(row.joined)}</td>
                <td>{planLabel(row.plan)}</td>
                <td><span className={`${styles.pill} ${pill(row.state)}`}>{stateLabel[row.state]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const overview = (
    <div className={styles.stack}>
      <div className={styles.grid2}>
        <div className={`${styles.panel} ${styles.codeCard}`}>
          <span className={styles.label}>Your affiliate code</span>
          <p className={styles.code}>{partner.code}</p>
          <span className={styles.label}>Share link (opens the website)</span>
          <CopyRow label="Link" value={shareLink} />
          <span className={styles.label} style={{ marginTop: 14 }}>Direct enrolment link</span>
          <CopyRow label="Enrol link" value={enrolLink} />
          <p className={styles.hint}>Visitors are remembered for 60 days, so you still earn if they sign up later.</p>
        </div>
        <div className={styles.panel}>
          <h2>Balance</h2>
          <p className={styles.panelSub}>Commission is held for {HOLD_DAYS} days in case of refunds, then becomes available.</p>
          <div className={styles.balances}>
            <div className={styles.balRow}><span>Pending<small>In the {HOLD_DAYS}-day hold</small></span><b>{formatZarFromCents(pending)}</b></div>
            <div className={styles.balRow}><span>Available<small>Ready for the next payout</small></span><b>{formatZarFromCents(available)}</b></div>
            <div className={styles.balRow}><span>Paid out<small>All time</small></span><b>{formatZarFromCents(paid)}</b></div>
          </div>
          <div className={styles.meter}><i style={{ width: `${towardPayout}%` }} /></div>
          <p className={styles.hint}>
            {available >= MIN_PAYOUT_CENTS
              ? "You have reached the minimum. You will be included in the next monthly payout."
              : `${formatZarFromCents(Math.max(0, MIN_PAYOUT_CENTS - available))} more available until the ${formatZarFromCents(MIN_PAYOUT_CENTS)} payout minimum.`}
          </p>
        </div>
      </div>
      <div className={styles.stats}>
        <div className={styles.stat}><strong>{clicks30 ?? 0}</strong><span>Link visits, last 30 days</span></div>
        <div className={styles.stat}><strong>{referrals.length}</strong><span>Sign-ups</span></div>
        <div className={styles.stat}><strong>{paying}</strong><span>Paying students now</span></div>
        <div className={styles.stat}><strong>{formatZarFromCents(thisMonth)}</strong><span>Earned this month</span></div>
      </div>
      <div className={styles.grid2}>
        <div className={styles.panel}>
          <h2>Recent referrals</h2>
          <p className={styles.panelSub}>The newest people who joined with your code.</p>
          {referralsTable(5)}
        </div>
        <div className={styles.panel}>
          <h2>How you earn</h2>
          <p className={styles.panelSub}>Simple rules, paid monthly.</p>
          <ol className={styles.steps}>
            <li><i>1</i><span><b>Share your link.</b> Anyone who visits through it is linked to you for 60 days.</span></li>
            <li><i>2</i><span><b>They enrol and pay.</b> You earn 10% of every monthly payment for as long as they stay subscribed.</span></li>
            <li><i>3</i><span><b>Get paid monthly.</b> After the {HOLD_DAYS}-day hold, balances of {formatZarFromCents(MIN_PAYOUT_CENTS)} or more are paid by EFT (South Africa) or PayPal (international).</span></li>
          </ol>
        </div>
      </div>
    </div>
  );

  const referralsTab = (
    <div className={styles.panel}>
      <h2>My referrals</h2>
      <p className={styles.panelSub}>
        {referrals.length} sign-ups · {paying} paying now · {clicksAll ?? 0} link visits all time. For privacy, only first names and initials are shown.
      </p>
      {referralsTable()}
    </div>
  );

  const earningsTab = (
    <div className={styles.panel}>
      <h2>Earnings</h2>
      <p className={styles.panelSub}>Every payment your referrals make, and the 10% you earn from it.</p>
      {rows.length === 0 ? (
        <div className={styles.empty}>
          <b>No earnings yet</b>
          Commission appears here as soon as a referred student&apos;s payment is confirmed.
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Date</th><th>Student</th><th>Plan</th><th>Payment</th><th>You earn</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{shortDate(row.created_at)}</td>
                  <td>{maskName(row.student_name)}</td>
                  <td>{planLabel(row.plan_id)}</td>
                  <td>{formatZarFromCents(row.payment_amount_cents)}</td>
                  <td><b>{formatZarFromCents(row.commission_cents)}</b></td>
                  <td>
                    <span className={`${styles.pill} ${pill(row.phase)}`}>
                      {row.phase === "pending"
                        ? `Pending until ${shortDate(row.availableAt)}`
                        : row.phase === "available"
                          ? "Available"
                          : row.phase === "paid"
                            ? `Paid${row.paid_at ? ` ${shortDate(row.paid_at)}` : ""}`
                            : "Cancelled"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const profileTab = (
    <div className={styles.stack}>
      <div className={styles.panel}>
        <h2>Profile</h2>
        <p className={styles.panelSub}>Affiliate since {shortDate(partner.created_at)}. Your email and code cannot be changed.</p>
        <AffiliateProfileForm
          initial={{
            fullName: partner.full_name ?? "",
            email: partner.email,
            phone: partner.phone ?? "",
            country: partner.country ?? "",
            promoChannel: partner.promo_channel ?? "",
            promoLink: partner.promo_link ?? "",
          }}
          portalSlug={portal.slug}
        />
      </div>
      <div className={styles.panel}>
        <h2>Payout details</h2>
        <p className={styles.panelSub}>Where we send your money.</p>
        <div className={styles.notice}>
          <span>
            <b>Coming soon: bank and PayPal details.</b> You will add and verify these here before your first payout. Nothing is lost in the meantime: your balance keeps building.
          </span>
        </div>
        <p className={styles.hint} style={{ marginTop: 12 }}>
          Read the <a href={termsPath}>affiliate terms</a>.
        </p>
      </div>
    </div>
  );

  return (
    <AffiliateFrame
      actions={actions}
      brand={brand}
      intro={
        <div className={styles.hello}>
          <div>
            <h1>Hi {firstName}, welcome back.</h1>
            <p>Your affiliate dashboard for {portal.portal_name}.</p>
          </div>
          <span className={styles.status}>
            <i className={`${styles.dot} ${suspended ? styles.dotBad : ""}`} />
            {suspended ? "Account suspended" : "Active affiliate"}
          </span>
        </div>
      }
      tabs={[
        { id: "overview", label: "Overview", content: overview },
        { id: "referrals", label: `My referrals (${referrals.length})`, content: referralsTab },
        { id: "earnings", label: "Earnings", content: earningsTab },
        { id: "profile", label: "Profile & payouts", content: profileTab },
      ]}
      themeKey={themeKey}
    />
  );
}
