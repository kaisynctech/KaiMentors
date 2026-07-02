"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Building2,
  CalendarCheck,
  CalendarDays,
  FileText,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { MessagesUnreadDot } from "@/components/messages-unread-dot";
import { NotificationBell } from "@/components/notification-bell";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import styles from "./dashboard-shell.module.css";

interface DashboardShellProps {
  children: React.ReactNode;
  title: string;
  description: string;
  mode?: "trader" | "admin";
  userLabel?: string;
  activePath?: string;
  traderId?: string;
  portalName?: string;
  portalSlug?: string;
}

const traderNavigation = [
  ["Overview", "/dashboard", LayoutDashboard],
  ["Students", "/dashboard/students", Users],
  ["Student Groups", "/dashboard/groups", Layers3],
  ["Messages", "/dashboard/messages", MessageCircle],
  ["Community", "/dashboard/community", Sparkles],
  ["Courses", "/dashboard/courses", BookOpen],
  ["Resources", "/dashboard/resources", FileText],
  ["Live classes", "/dashboard/live-classes", CalendarDays],
  ["Bookings", "/dashboard/bookings", CalendarCheck],
  ["Settings", "/dashboard/settings", Settings],
] as const;

const adminNavigation = [
  ["Overview", "/admin", LayoutDashboard],
  ["Mentors", "/admin/traders", Users],
  ["Custom sites", "/admin/custom-sites", WandSparkles],
  ["Domains", "/admin/domains", ShieldCheck],
  ["Brokers", "/admin/brokers", Building2],
  ["Subscriptions", "/admin/subscriptions", FileText],
  ["Audit logs", "/admin/audit-logs", ScrollText],
  ["Platform settings", "/admin/settings", Settings],
  ["My mentor workspace", "/dashboard", LayoutDashboard],
] as const;

export function DashboardShell({
  children,
  title,
  description,
  mode = "trader",
  userLabel = "Account",
  activePath,
  traderId,
  portalName,
  portalSlug,
}: DashboardShellProps) {
  const navigation = mode === "admin" ? adminNavigation : traderNavigation;
  const [mobileOpen, setMobileOpen] = useState(false);
  const signOutReturnTo =
    mode === "admin"
      ? "/login"
      : portalSlug
        ? `/portal/${portalSlug}`
        : "/login";

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  function navigationLinks(closeAfterNavigation = false) {
    return navigation.map(([label, href, Icon], index) => (
      <Link
        className={
          activePath
            ? activePath === href
              ? styles.active
              : ""
            : index === 0
              ? styles.active
              : ""
        }
        href={href}
        key={href}
        onClick={closeAfterNavigation ? () => setMobileOpen(false) : undefined}
      >
        <Icon size={18} />
        {label}
        {href === "/dashboard/messages" ? (
          <MessagesUnreadDot traderId={traderId} />
        ) : null}
      </Link>
    ));
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <BrandMark
          href={mode === "admin" ? "/admin" : "/dashboard"}
          label={mode === "admin" ? "KaiMentors" : (portalName ?? "Academy")}
        />
        {mode === "admin" ? (
          <div className={styles.workspace}>
            <span>Platform console</span>
            <strong>{userLabel}</strong>
          </div>
        ) : (
          <WorkspaceSwitcher />
        )}
        <nav>
          {navigationLinks()}
        </nav>
        <div className={styles.secure}>
          <ShieldCheck size={18} />
          <div>
            <strong>Protected workspace</strong>
            <span>Tenant isolation enabled</span>
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <input type="hidden" name="returnTo" value={signOutReturnTo} />
          <button className={styles.signout} type="submit">
            <LogOut size={17} /> Sign out
          </button>
        </form>
      </aside>
      <button
        aria-label="Close navigation menu"
        className={`${styles.mobileOverlay} ${mobileOpen ? styles.mobileOverlayOpen : ""}`}
        onClick={() => setMobileOpen(false)}
        type="button"
      />
      <aside
        aria-hidden={!mobileOpen}
        className={`${styles.mobileDrawer} ${mobileOpen ? styles.mobileDrawerOpen : ""}`}
        inert={!mobileOpen}
      >
        <div className={styles.mobileDrawerHeader}>
          <BrandMark
          href={mode === "admin" ? "/admin" : "/dashboard"}
          label={mode === "admin" ? "KaiMentors" : (portalName ?? "Academy")}
        />
          <button
            aria-label="Close navigation menu"
            onClick={() => setMobileOpen(false)}
            type="button"
          >
            <X size={20} />
          </button>
        </div>
        {mode === "admin" ? (
          <div className={styles.workspace}>
            <span>Platform console</span>
            <strong>{userLabel}</strong>
          </div>
        ) : (
          <WorkspaceSwitcher />
        )}
        <nav>{navigationLinks(true)}</nav>
        <div className={styles.secure}>
          <ShieldCheck size={18} />
          <div>
            <strong>Protected workspace</strong>
            <span>Tenant isolation enabled</span>
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <input type="hidden" name="returnTo" value={signOutReturnTo} />
          <button className={styles.signout} onClick={() => setMobileOpen(false)} type="submit">
            <LogOut size={17} /> Sign out
          </button>
        </form>
      </aside>
      <main className={styles.main}>
        <header className={styles.mobileHeader}>
          <BrandMark
          href={mode === "admin" ? "/admin" : "/dashboard"}
          label={mode === "admin" ? "KaiMentors" : (portalName ?? "Academy")}
        />
          <div>
            <span>{mode === "admin" ? "Admin" : "Mentor"}</span>
            <button
              aria-expanded={mobileOpen}
              aria-label="Open navigation menu"
              onClick={() => setMobileOpen(true)}
              type="button"
            >
              <Menu size={20} />
            </button>
          </div>
        </header>
        <div className={styles.pageHeader}>
          <div>
            <p className="eyebrow">{mode === "admin" ? "KaiMentors platform" : "Workspace"}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <NotificationBell />
        </div>
        {children}
      </main>
    </div>
  );
}
