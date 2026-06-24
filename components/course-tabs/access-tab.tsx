"use client";

import { useState } from "react";
import { Info, Loader2 } from "lucide-react";
import styles from "../course-detail-manager.module.css";

type Status = "draft" | "published" | "archived";
type AccessMode = "all_verified" | "restricted" | "one_to_one";

interface Group {
  id: string;
  name: string;
  color: string;
}

interface Student {
  student_user_id: string;
  full_name: string;
  email: string;
}

interface Props {
  course: {
    id: string;
    title: string;
    description: string | null;
    status: Status;
    sort_order: number;
    access_mode: AccessMode;
  };
  groups: Group[];
  students: Student[];
  selectedGroupIds: string[];
  selectedStudentIds: string[];
  busy: boolean;
  saveAccess: (fd: FormData) => Promise<void>;
}

const ACCESS_OPTIONS: Array<{
  value: AccessMode;
  label: string;
  description: string;
}> = [
  {
    value: "all_verified",
    label: "All verified students",
    description:
      "Anyone who joins your academy and is verified gets access automatically. No manual selection needed.",
  },
  {
    value: "restricted",
    label: "Selected groups or students",
    description:
      "Choose specific student groups or individual students. Good for premium tiers or invite-only content.",
  },
  {
    value: "one_to_one",
    label: "One-to-one coaching only",
    description:
      "Exactly one student. For private sessions or personalised coaching programmes.",
  },
];

export function AccessTab({
  course,
  groups,
  students,
  selectedGroupIds,
  selectedStudentIds,
  busy,
  saveAccess,
}: Props) {
  const [selectedMode, setSelectedMode] = useState<AccessMode>(course.access_mode);

  return (
    <div className={styles.panel}>
      <header>
        <div>
          <p className="eyebrow">Immediate authorization</p>
          <h2>Course access</h2>
        </div>
      </header>

      <p className={styles.accessEyebrow}>Who can access this course?</p>

      <form action={saveAccess}>
        {/* Hidden radio carries the selected mode value */}
        <input name="accessMode" type="hidden" value={selectedMode} />

        <div className={styles.accessOptions}>
          {ACCESS_OPTIONS.map((opt) => (
            <div
              key={opt.value}
              className={`${styles.accessOption} ${selectedMode === opt.value ? styles.accessOptionSelected : ""}`}
              onClick={() => setSelectedMode(opt.value)}
              role="radio"
              aria-checked={selectedMode === opt.value}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSelectedMode(opt.value)}
            >
              <div className={styles.accessRadio} />
              <div className={styles.accessOptionBody}>
                <strong>{opt.label}</strong>
                <p>{opt.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.accessNotice}>
          <Info size={14} />
          <span>
            Changing access takes effect immediately. Students who lose access keep their progress
            history.
          </span>
        </div>

        {selectedMode === "restricted" && (
          <div className={styles.accessPickers}>
            <div>
              <span className={styles.pickerLabel}>Groups</span>
              <div className={styles.choices}>
                {groups.length === 0 ? (
                  <p style={{ gridColumn: "1/-1", color: "#9aa0a6", fontSize: 12, margin: 0 }}>
                    No active groups.
                  </p>
                ) : (
                  groups.map((g) => (
                    <label className={styles.choiceItem} key={g.id}>
                      <input
                        defaultChecked={selectedGroupIds.includes(g.id)}
                        name="groupIds"
                        type="checkbox"
                        value={g.id}
                      />
                      <span className={styles.groupDot} style={{ background: g.color }} />
                      {g.name}
                    </label>
                  ))
                )}
              </div>
            </div>

            <div>
              <span className={styles.pickerLabel}>Individual students</span>
              <div className={styles.choices}>
                {students.length === 0 ? (
                  <p style={{ gridColumn: "1/-1", color: "#9aa0a6", fontSize: 12, margin: 0 }}>
                    No verified students.
                  </p>
                ) : (
                  students.map((s) => (
                    <label className={styles.choiceItem} key={s.student_user_id}>
                      <input
                        defaultChecked={selectedStudentIds.includes(s.student_user_id)}
                        name="studentIds"
                        type="checkbox"
                        value={s.student_user_id}
                      />
                      {s.full_name}
                      <span className={styles.choiceEmail}>{s.email}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className={styles.accessSaveRow}>
          <button disabled={busy} type="submit">
            {busy ? <Loader2 className={styles.spin} size={15} /> : null}
            Save access settings
          </button>
        </div>
      </form>
    </div>
  );
}
