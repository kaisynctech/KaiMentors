import Link from "next/link";
import { chartFocusHref, formatChartPrice, marketLabel } from "@/lib/chart-markets";
import { formatAnalysisDate } from "@/lib/chart-signal";
import type { ChartSignalPost } from "@/lib/chart-signal-feed";
import styles from "./chart-signal-cards.module.css";

export function ChartSignalCards({
  signals,
  href,
  openDaily = false,
}: {
  signals: ChartSignalPost[];
  href: string;
  openDaily?: boolean;
}) {
  if (signals.length === 0) return null;
  const when = formatAnalysisDate(signals[0].date);
  const focus = (post: ChartSignalPost) => chartFocusHref(href, post.symbol, post.date, openDaily);
  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <div>
          <h2>Chart signal</h2>
          <p>{when}</p>
        </div>
        <Link href={focus(signals[0])}>Open live chart</Link>
      </div>
      <div className={styles.list}>
        {signals.map((post) => (
          <article key={`${post.symbol}-${post.date}`}>
            <strong className={post.signal.direction === "buy" ? styles.buy : styles.sell}>
              <Link href={focus(post)}>
                {post.signal.direction === "buy" ? "Buy" : "Sell"} {marketLabel(post.symbol)}
              </Link>
            </strong>
            <p>
              Entry {formatChartPrice(post.signal.entry)} · Stop {formatChartPrice(post.signal.stop)} · Target{" "}
              {formatChartPrice(post.signal.target)}
            </p>
            {post.signal.note ? <p>{post.signal.note}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
