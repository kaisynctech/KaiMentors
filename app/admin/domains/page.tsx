import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { WebsiteDomainManager } from "@/components/website-domain-manager";
import { requirePlatformAdmin } from "@/lib/admin-access";
import type { WebsiteDomain } from "@/lib/domains/types";
import styles from "./page.module.css";

export default async function AdminDomainsPage({ searchParams }: { searchParams: Promise<{ portal?: string }> }) {
  const { supabase, userLabel } = await requirePlatformAdmin();
  const { portal: requestedPortal } = await searchParams;
  const { data: portals } = await supabase.from("portals").select("id,slug,portal_name").order("portal_name");
  const selected = portals?.find((portal) => portal.id === requestedPortal) ?? portals?.[0];
  const [domains, events, releases] = selected ? await Promise.all([
    supabase.from("website_domains").select("*").eq("portal_id", selected.id).order("created_at", { ascending: false }),
    supabase.from("website_domain_events").select("*").eq("portal_id", selected.id).order("created_at", { ascending: false }),
    supabase.from("website_releases").select("id,version,status,content_hash,release_notes,published_at,published_by").eq("portal_id", selected.id).order("version", { ascending: false }),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  return (
    <DashboardShell activePath="/admin/domains" description="Provision and verify academy domains from the KaiMentors platform boundary." mode="admin" title="Academy Domains" userLabel={userLabel}>
      <nav aria-label="Academy selection" className={styles.portalNav}>
        {(portals ?? []).map((portal) => (
          <Link
            className={portal.id === selected?.id ? styles.portalTabActive : styles.portalTab}
            href={`/admin/domains?portal=${portal.id}`}
            key={portal.id}
          >
            {portal.portal_name}
          </Link>
        ))}
      </nav>
      {selected ? <WebsiteDomainManager domains={(domains.data ?? []) as WebsiteDomain[]} events={events.data ?? []} portalId={selected.id} portalSlug={selected.slug} releases={releases.data ?? []} /> : <p>No academy portals exist.</p>}
    </DashboardShell>
  );
}
