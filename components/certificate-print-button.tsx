"use client";

import { Printer } from "lucide-react";
import styles from "./certificate-print-button.module.css";

export function PrintButton() {
  return (
    <button className={styles.printBtn} onClick={() => window.print()} type="button">
      <Printer size={16} />
      Print / Download
    </button>
  );
}
