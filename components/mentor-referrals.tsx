import { markReferralCommissionPaid } from "@/app/dashboard/referrals/actions";
import { formatZarFromCents } from "@/lib/referral-math";
import styles from "./referral-account.module.css";

export interface MentorReferralCommission {
  id: string;
  student_name: string;
  plan_id: string;
  payment_amount_cents: number;
  commission_cents: number;
  status: string;
  created_at: string;
  partner_name: string;
  partner_email: string;
  code: string;
}

export function MentorReferrals({
  commissions,
}: {
  commissions: MentorReferralCommission[];
}) {
  const owed = commissions
    .filter((row) => row.status === "owed")
    .reduce((sum, row) => sum + row.commission_cents, 0);

  return (
    <section>
      <p className={styles.lead}>
        Owed to referrers: {formatZarFromCents(owed)}. Pay them outside Payfast, then mark the row paid.
      </p>
      {commissions.length === 0 ? (
        <p>No referral commissions yet.</p>
      ) : (
        <div className={`card ${styles.tableWrap}`}>
        <table>
          <thead>
            <tr>
              <th>Referrer</th>
              <th>Code</th>
              <th>Student</th>
              <th>Plan</th>
              <th>Commission</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {commissions.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.partner_name}
                  <br />
                  {row.partner_email}
                </td>
                <td>{row.code}</td>
                <td>{row.student_name || "Student"}</td>
                <td>{row.plan_id}</td>
                <td>{formatZarFromCents(row.commission_cents)}</td>
                <td>{row.status}</td>
                <td>
                  {row.status === "owed" ? (
                    <form action={markReferralCommissionPaid}>
                      <input name="commissionId" type="hidden" value={row.id} />
                      <button className="button button-secondary" type="submit">Mark paid</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
