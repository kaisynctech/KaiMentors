import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/certificate-print-button";
import styles from "./certificate.module.css";

export const dynamic = "force-dynamic";

async function loadCertificate(token: string) {
  const admin = createAdminClient();
  if (!admin) return null;

  // Public, unauthenticated route -- the admin client intentionally bypasses
  // RLS (student_certificates has no anon SELECT policy by design). Only the
  // fields needed to render the certificate are selected; the portals join
  // is scoped to primary_color only -- never expose other portal data on
  // this public page.
  const { data: cert } = await admin
    .from("student_certificates")
    .select("student_name, course_title, portal_name, issued_at, portal_id")
    .eq("public_token", token)
    .maybeSingle();
  if (!cert) return null;

  const { data: portal } = await admin
    .from("portals")
    .select("primary_color")
    .eq("id", cert.portal_id)
    .maybeSingle();

  return {
    studentName: cert.student_name,
    courseTitle: cert.course_title,
    portalName: cert.portal_name,
    issuedAt: cert.issued_at as string,
    primaryColor: portal?.primary_color ?? "#7ab648",
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const cert = await loadCertificate(token);
  if (!cert) return { title: "Certificate not found" };

  const title = `${cert.studentName} — ${cert.courseTitle} Certificate`;
  const description = `Completed ${cert.courseTitle} at ${cert.portalName}`;
  return {
    title,
    description,
    openGraph: { title, description },
  };
}

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const cert = await loadCertificate(token);
  if (!cert) notFound();

  const issuedDate = new Date(cert.issuedAt).toLocaleDateString(undefined, {
    dateStyle: "long",
  });

  // Never hardcode a domain here -- this platform is white-label and this
  // page must reflect whatever host it's actually served from (custom
  // domain, portal subdomain, or the base app), never "kaimentors.com".
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const verifyUrl = host ? `${host}/certificates/${token}` : `/certificates/${token}`;

  return (
    <div className={styles.page}>
      <div className={styles.certificate} style={{ borderColor: cert.primaryColor }}>
        <p className={styles.portalName} style={{ color: cert.primaryColor }}>
          {cert.portalName}
        </p>
        <p className={styles.eyebrow}>Certificate of Completion</p>
        <p className={styles.lead}>This certifies that</p>
        <h1 className={styles.studentName}>{cert.studentName}</h1>
        <p className={styles.lead}>has successfully completed</p>
        <h2 className={styles.courseTitle}>{cert.courseTitle}</h2>
        <p className={styles.issuedDate}>{issuedDate}</p>
        <p className={styles.verifyUrl}>Verify at {verifyUrl}</p>
      </div>
      <PrintButton />
    </div>
  );
}
