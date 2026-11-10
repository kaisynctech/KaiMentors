import { redirect } from "next/navigation";
import {
  ReferralCodeCard,
  ReferralJoinPanel,
} from "@/components/referral-account";
import { formatZarFromCents } from "@/lib/referral-math";
import styles from "./referral-account.module.css";
import { loadReferralPortal } from "@/lib/referrals";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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

  const { data: partner } = await admin
    .from("referral_partners")
    .select("id,code,full_name")
    .eq("portal_id", portal.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: commissions } = partner
    ? await admin
        .from("referral_commissions")
        .select(
          "id,student_name,plan_id,payment_amount_cents,commission_cents,status,created_at",
        )
        .eq("referral_partner_id", partner.id)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [] };

  const rows = commissions ?? [];
  const owed = rows
    .filter((row) => row.status === "owed")
    .reduce((sum, row) => sum + row.commission_cents, 0);
  const paid = rows
    .filter((row) => row.status === "paid")
    .reduce((sum, row) => sum + row.commission_cents, 0);

  const homePath = joinPath.startsWith("/portal/")
    ? `/portal/${portal.slug}`
    : "/";

  return (
    <main className={styles.page}>
      <a className={styles.home} href={homePath}>
        ← {portal.portal_name}
      </a>
      <p className="eyebrow">Referrals</p>
      <h1>Earn 10% of every payment.</h1>
      <p className={styles.lead}>
        Library pays {formatZarFromCents(990)}, Scholar pays {formatZarFromCents(2490)},
        and Studio pays {formatZarFromCents(4990)} each month the student stays subscribed.
        The academy pays the balance. It is not sent automatically.
      </p>
      {partner ? (
        <>
          <ReferralCodeCard
            code={partner.code}
            shareUrl={`${joinPath}?ref=${partner.code}`}
          />
          <div className={styles.stats}>
            <section className={`card ${styles.stat}`}>
              <strong>{formatZarFromCents(owed)}</strong>
              <span>Owed</span>
            </section>
            <section className={`card ${styles.stat}`}>
              <strong>{formatZarFromCents(paid)}</strong>
              <span>Paid</span>
            </section>
          </div>
          {rows.length === 0 ? (
            <p className={styles.lead}>No payments yet. Share your code and the commission appears here after Payfast confirms each payment.</p>
          ) : (
            <div className={`card ${styles.tableWrap}`}>
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Plan</th>
                  <th>Payment</th>
                  <th>Commission</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.student_name || "Student"}</td>
                    <td>{row.plan_id}</td>
                    <td>{formatZarFromCents(row.payment_amount_cents)}</td>
                    <td>{formatZarFromCents(row.commission_cents)}</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </>
      ) : (
        <ReferralJoinPanel portalSlug={portal.slug} />
      )}
    </main>
  );
}
