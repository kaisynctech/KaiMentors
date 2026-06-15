import Link from "next/link";
import styles from "./brand-mark.module.css";

export function BrandMark({
  href = "/",
  label = "KaiMentors",
}: {
  href?: string;
  label?: string;
}) {
  return (
    <Link className={styles.brand} href={href}>
      <span>{label.slice(0, 1).toUpperCase()}</span>
      {label}
    </Link>
  );
}
