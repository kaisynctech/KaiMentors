import Link from "next/link";
import styles from "./website-builder-navigation.module.css";

export function WebsiteBuilderNavigation({
  active,
}: {
  active: "builder" | "domains";
}) {
  return (
    <nav className={styles.navigation} aria-label="Website Builder sections">
      <Link
        className={active === "builder" ? styles.active : ""}
        href="/dashboard/website-builder"
      >
        Design and content
      </Link>
      <Link
        className={active === "domains" ? styles.active : ""}
        href="/dashboard/website-builder/domains"
      >
        Domains and releases
      </Link>
    </nav>
  );
}
