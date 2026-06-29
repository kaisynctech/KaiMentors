import styles from "./preview-banner.module.css";

export function PreviewBanner() {
  return (
    <div className={styles.banner} role="status">
      Preview mode — students see published content only. Progress is not tracked.
    </div>
  );
}
