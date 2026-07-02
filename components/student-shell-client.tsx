"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  BookOpen,
  CalendarCheck,
  CalendarClock,
  LayoutDashboard,
  LogOut,
  LockKeyhole,
  Menu,
  MessageSquare,
  Sparkles,
  Users,
  Video,
  X,
} from "lucide-react";
import { MessagesUnreadDot } from "@/components/messages-unread-dot";
import { NotificationBell } from "@/components/notification-bell";
import styles from "./student-shell.module.css";

interface StudentShellClientProps {
  academyName: string;
  logoUrl: string | null;
  isVerified: boolean;
  basePath: string;
  querySuffix: string;
  displayName: string;
  traderId?: string;
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  locked: boolean;
}

export function StudentShellClient({
  academyName,
  logoUrl,
  isVerified,
  basePath,
  querySuffix,
  displayName,
  traderId,
  children,
}: StudentShellClientProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  const navItems: NavItem[] = [
    {
      href: `${basePath}${querySuffix}`,
      label: "Dashboard",
      icon: LayoutDashboard,
      locked: false,
    },
    {
      href: `${basePath}/courses${querySuffix}`,
      label: "My Courses",
      icon: BookOpen,
      locked: false,
    },
    {
      href: `${basePath}/live-classes${querySuffix}`,
      label: "Live Classes",
      icon: Video,
      locked: !isVerified,
    },
    {
      href: `${basePath}/bookings${querySuffix}`,
      label: "Book a session",
      icon: CalendarCheck,
      locked: !isVerified,
    },
    {
      href: `${basePath}/bookings/sessions${querySuffix}`,
      label: "My sessions",
      icon: CalendarClock,
      locked: !isVerified,
    },
    {
      href: `${basePath}/groups${querySuffix}`,
      label: "Groups",
      icon: Users,
      locked: !isVerified,
    },
    {
      href: `${basePath}/messages${querySuffix}`,
      label: "Messages",
      icon: MessageSquare,
      locked: !isVerified,
    },
    {
      href: `${basePath}/community${querySuffix}`,
      label: "Community",
      icon: Sparkles,
      locked: false,
    },
  ];

  function isActive(href: string) {
    const hrefPath = href.split("?")[0];
    if (hrefPath === basePath || hrefPath === `${basePath}/`) {
      return pathname === basePath || pathname === `${basePath}/`;
    }
    return pathname.startsWith(hrefPath);
  }

  const avatarLetter = displayName.trim().charAt(0).toUpperCase() || "S";

  function SidebarContent({ onLinkClick }: { onLinkClick?: () => void }) {
    return (
      <>
        <Link
          className={styles.logoRow}
          href={`${basePath}${querySuffix}`}
          onClick={onLinkClick}
        >
          {logoUrl ? (
            <Image
              alt={academyName}
              className={styles.logoImg}
              height={32}
              src={logoUrl}
              unoptimized
              width={80}
            />
          ) : null}
          <span className={styles.logoName}>{academyName}</span>
        </Link>

        <nav aria-label="Student portal" className={styles.nav}>
          {navItems.map((item) => (
            <Link
              className={`${styles.navLink} ${isActive(item.href) ? styles.navLinkActive : ""}`}
              href={item.href}
              key={item.href}
              onClick={onLinkClick}
            >
              <item.icon className={styles.navLinkIcon} size={16} />
              {item.label}
              {item.locked ? (
                <LockKeyhole className={styles.lockIcon} size={13} />
              ) : item.label === "Messages" && isVerified && traderId ? (
                <MessagesUnreadDot
                  apiPath={`/api/student/messages/unread?traderId=${traderId}`}
                  traderId={traderId}
                />
              ) : null}
            </Link>
          ))}
        </nav>

        <div className={styles.bottom}>
          <div className={styles.userRow}>
            <span className={styles.userAvatar} aria-hidden="true">{avatarLetter}</span>
            <span className={styles.userName} aria-hidden="true">{displayName}</span>
            <NotificationBell />
          </div>
          <form action="/auth/signout" method="post">
            <button className={styles.signoutBtn} type="submit">
              <LogOut size={16} />
              Sign out
            </button>
          </form>
        </div>
      </>
    );
  }

  return (
    <div className={styles.shell}>
      {/* Desktop sidebar */}
      <aside className={styles.sidebar}>
        <SidebarContent />
      </aside>

      {/* Mobile header */}
      <div className={styles.content}>
        <header className={styles.mobileHeader}>
          <button
            aria-label="Open navigation menu"
            className={styles.iconBtn}
            onClick={() => setDrawerOpen(true)}
            type="button"
          >
            <Menu size={22} />
          </button>
          <span className={styles.mobileLogoName}>{academyName}</span>
          <div style={{ width: 44 }} aria-hidden="true" />
        </header>

        {children}
      </div>

      {/* Mobile drawer overlay */}
      <div
        aria-hidden="true"
        className={`${styles.overlay} ${drawerOpen ? styles.overlayOpen : ""}`}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Mobile drawer */}
      <aside
        aria-label="Navigation drawer"
        className={`${styles.drawer} ${drawerOpen ? styles.drawerOpen : ""}`}
      >
        <div className={styles.drawerClose}>
          <button
            aria-label="Close navigation menu"
            className={styles.iconBtn}
            onClick={() => setDrawerOpen(false)}
            type="button"
          >
            <X size={22} />
          </button>
        </div>
        <SidebarContent onLinkClick={() => setDrawerOpen(false)} />
      </aside>
    </div>
  );
}
