import type { LucideIcon } from "lucide-react";
import styles from "./metric-card.module.css";

export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: LucideIcon;
}) {
  return (
    <article className={`card ${styles.card}`}>
      <div className={styles.icon}>
        <Icon size={19} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
