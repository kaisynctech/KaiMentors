import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { resolveWebsiteDomain } from "@/lib/domains/resolution";
import { getPortalBrandingUrl } from "@/lib/storage";
import { loadWebsiteBySlug } from "@/lib/website-builder";
import { getWebsiteMediaUrl } from "@/lib/website-types";
import styles from "./white-label-login.module.css";

interface CustomDomainLoginPageProps {
  params: Promise<{ hostname: string }>;
}

export default async function CustomDomainLoginPage({
  params,
}: CustomDomainLoginPageProps) {
  const { hostname } = await params;
  const resolution = await resolveWebsiteDomain(hostname);
  if (!resolution) notFound();
  if (resolution.should_redirect) {
    redirect(`https://${resolution.canonical_hostname}/login`);
  }

  const website = await loadWebsiteBySlug(resolution.portal_slug);
  if (!website) notFound();
  const logo = website.theme.logo_path
    ? getWebsiteMediaUrl(website.theme.logo_path)
    : getPortalBrandingUrl(website.portal.logo_path);
  const theme = {
    "--tenant-primary": website.theme.primary_color,
    "--tenant-accent": website.theme.accent_color,
    "--tenant-surface": website.theme.surface_color,
  } as React.CSSProperties;

  return (
    <main className={styles.page} style={theme}>
      <section className={styles.brandPanel}>
        <Link className={styles.brand} href="/">
          <span>
            {logo ? (
              <Image
                alt={`${website.portal.portal_name} logo`}
                height={48}
                src={logo}
                unoptimized
                width={48}
              />
            ) : (
              website.portal.portal_name.slice(0, 1)
            )}
          </span>
          <strong>{website.portal.portal_name}</strong>
        </Link>
        <div>
          <p>Private academy access</p>
          <h1>Continue your learning inside the academy.</h1>
          <span>
            Sign in to access verified courses, messages, resources, and live
            education.
          </span>
        </div>
        <small>Secure student access powered by KaiMentors.</small>
      </section>
      <section className={styles.formPanel}>
        <div className={styles.card}>
          <p>Student login</p>
          <h2>Welcome back</h2>
          <span>Use your verified student email address and password.</span>
          <LoginForm
            allowedRole="student"
            studentDestination="/academy"
          />
          <Link className={styles.backLink} href="/">
            Return to academy website
          </Link>
        </div>
      </section>
    </main>
  );
}
