"use client";

import {
  ArrowLeft,
  Check,
  ChevronRight,
  Loader2,
  LockKeyhole,
  MessageCircle,
  Plus,
  Search,
  UserMinus,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import type {
  CommunityStudent,
  StudentGroupSummary,
} from "@/lib/community";
import styles from "./student-group-manager.module.css";

type MemberDialogMode = "create" | "manage" | null;

export function StudentGroupManager({
  groups,
  students,
}: {
  groups: StudentGroupSummary[];
  students: CommunityStudent[];
}) {
  const router = useRouter();
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [dialogMode, setDialogMode] = useState<MemberDialogMode>(null);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(
    new Set(),
  );
  const [groupSearch, setGroupSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? null;
  const studentByApplication = useMemo(
    () =>
      new Map(
        students.map((student) => [student.applicationId, student] as const),
      ),
    [students],
  );
  const selectedGroupMembers = selectedGroup
    ? selectedGroup.memberIds
        .map((id) => studentByApplication.get(id))
        .filter((student): student is CommunityStudent => Boolean(student))
    : [];
  const visibleGroups = useMemo(() => {
    const query = groupSearch.trim().toLowerCase();
    if (!query) return groups;
    return groups.filter((group) =>
      `${group.name} ${group.description ?? ""}`.toLowerCase().includes(query),
    );
  }, [groupSearch, groups]);
  const visibleStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) =>
      `${student.fullName} ${student.email ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [studentSearch, students]);

  function resetFeedback() {
    setMessage("");
    setError("");
  }

  function openCreate() {
    resetFeedback();
    setSelectedMembers(new Set());
    setStudentSearch("");
    setDialogMode("create");
  }

  function openManageMembers() {
    if (!selectedGroup || selectedGroup.isSystem) return;
    resetFeedback();
    setSelectedMembers(new Set(selectedGroup.memberIds));
    setStudentSearch("");
    setDialogMode("manage");
  }

  function toggleStudent(applicationId: string) {
    setSelectedMembers((current) => {
      const next = new Set(current);
      if (next.has(applicationId)) next.delete(applicationId);
      else next.add(applicationId);
      return next;
    });
  }

  function toggleAllStudents() {
    setSelectedMembers((current) =>
      current.size === students.length
        ? new Set()
        : new Set(students.map((student) => student.applicationId)),
    );
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    resetFeedback();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description") || null,
        color: form.get("color"),
        applicationIds: Array.from(selectedMembers),
      }),
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(payload.error ?? "The group could not be created.");
      return;
    }
    setDialogMode(null);
    setMessage("Group, membership, and conversation created.");
    router.refresh();
  }

  async function updateMembers(applicationIds: string[], success: string) {
    if (!selectedGroup || selectedGroup.isSystem) return;
    setSaving(true);
    resetFeedback();
    const response = await fetch(
      `/api/groups/${selectedGroup.id}/members`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationIds }),
      },
    );
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(payload.error ?? "Group membership could not be updated.");
      return;
    }
    setDialogMode(null);
    setMessage(success);
    router.refresh();
  }

  async function saveMembers() {
    await updateMembers(
      Array.from(selectedMembers),
      `Membership updated for ${selectedGroup?.name ?? "the group"}.`,
    );
  }

  async function removeMember(applicationId: string) {
    if (!selectedGroup) return;
    await updateMembers(
      selectedGroup.memberIds.filter((id) => id !== applicationId),
      "Student removed from the group.",
    );
  }

  return (
    <section className={styles.workspace}>
      {message ? <p className={styles.success}>{message}</p> : null}
      {error && !dialogMode ? <p className={styles.error}>{error}</p> : null}

      {!selectedGroup ? (
        <>
          <header className={styles.listHeader}>
            <div>
              <p className={styles.eyebrow}>Student organization</p>
              <h2>Groups and cohorts</h2>
              <p>
                Manage academy-wide audiences, private cohorts, and group
                conversations.
              </p>
            </div>
            <button onClick={openCreate} type="button">
              <Plus size={17} /> Create group
            </button>
          </header>

          <div className={styles.toolbar}>
            <div className={styles.search}>
              <Search size={16} />
              <input
                aria-label="Search groups"
                onChange={(event) => setGroupSearch(event.target.value)}
                placeholder="Search groups"
                type="search"
                value={groupSearch}
              />
            </div>
            <strong>
              {groups.length} group{groups.length === 1 ? "" : "s"}
            </strong>
          </div>

          <div className={styles.groupTable}>
            <table>
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Type</th>
                  <th>Members</th>
                  <th>Conversation</th>
                  <th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {visibleGroups.map((group) => (
                  <tr
                    key={group.id}
                    onClick={() => {
                      resetFeedback();
                      setSelectedGroupId(group.id);
                    }}
                  >
                    <td>
                      <div className={styles.groupIdentity}>
                        <span style={{ background: group.color }} />
                        <div>
                          <strong>{group.name}</strong>
                          <small>
                            {group.description || "No description provided"}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={
                          group.isSystem
                            ? styles.systemBadge
                            : styles.customBadge
                        }
                      >
                        {group.isSystem ? (
                          <LockKeyhole size={12} />
                        ) : (
                          <UsersRound size={12} />
                        )}
                        {group.isSystem ? "Automatic" : "Custom"}
                      </span>
                    </td>
                    <td>
                      <strong className={styles.memberCount}>
                        {group.memberIds.length}
                      </strong>
                    </td>
                    <td>
                      {group.conversationId ? (
                        <span className={styles.connected}>
                          <MessageCircle size={13} /> Connected
                        </span>
                      ) : (
                        "Unavailable"
                      )}
                    </td>
                    <td>
                      <button
                        aria-label={`Open ${group.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedGroupId(group.id);
                        }}
                        type="button"
                      >
                        <ChevronRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visibleGroups.length ? (
              <div className={styles.empty}>
                <UsersRound size={28} />
                <h3>No matching groups</h3>
                <p>Change the search or create a custom group.</p>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className={styles.detail}>
          <header className={styles.detailHeader}>
            <div>
              <button
                className={styles.back}
                onClick={() => setSelectedGroupId("")}
                type="button"
              >
                <ArrowLeft size={15} /> All groups
              </button>
              <div className={styles.detailTitle}>
                <span style={{ background: selectedGroup.color }} />
                <div>
                  <p className={styles.eyebrow}>
                    {selectedGroup.isSystem
                      ? "Automatic audience"
                      : "Custom audience"}
                  </p>
                  <h2>{selectedGroup.name}</h2>
                  <p>
                    {selectedGroup.description || "No description provided."}
                  </p>
                </div>
              </div>
            </div>
            <div className={styles.detailActions}>
              {selectedGroup.conversationId ? (
                <Link
                  href={`/dashboard/messages?conversation=${selectedGroup.conversationId}`}
                >
                  <MessageCircle size={16} /> Open conversation
                </Link>
              ) : null}
              {!selectedGroup.isSystem ? (
                <button onClick={openManageMembers} type="button">
                  <Plus size={16} /> Add or remove students
                </button>
              ) : null}
            </div>
          </header>

          {selectedGroup.isSystem ? (
            <div className={styles.systemNotice}>
              <LockKeyhole size={17} />
              <div>
                <strong>Membership is managed automatically</strong>
                <p>
                  Every verified student is added immediately. Students are
                  removed if their verified access is revoked.
                </p>
              </div>
            </div>
          ) : null}

          <div className={styles.memberSummary}>
            <div>
              <span>Total members</span>
              <strong>{selectedGroup.memberIds.length}</strong>
            </div>
            <div>
              <span>Group type</span>
              <strong>{selectedGroup.isSystem ? "Automatic" : "Custom"}</strong>
            </div>
            <div>
              <span>Conversation</span>
              <strong>
                {selectedGroup.conversationId ? "Active" : "Unavailable"}
              </strong>
            </div>
          </div>

          <div className={styles.membersSection}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Membership</p>
                <h3>Students in this group</h3>
              </div>
              <span>{selectedGroupMembers.length} members</span>
            </div>
            <div className={styles.memberTable}>
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Email</th>
                    <th>Status</th>
                    {!selectedGroup.isSystem ? <th>Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {selectedGroupMembers.map((student) => (
                    <tr key={student.applicationId}>
                      <td>
                        <div className={styles.studentIdentity}>
                          <span>
                            {student.fullName.slice(0, 1).toUpperCase()}
                          </span>
                          <strong>{student.fullName}</strong>
                        </div>
                      </td>
                      <td>{student.email ?? "No email available"}</td>
                      <td>
                        <span className={styles.verified}>
                          <Check size={12} /> Verified
                        </span>
                      </td>
                      {!selectedGroup.isSystem ? (
                        <td>
                          <button
                            className={styles.remove}
                            disabled={saving}
                            onClick={() =>
                              removeMember(student.applicationId)
                            }
                            type="button"
                          >
                            <UserMinus size={14} /> Remove
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!selectedGroupMembers.length ? (
                <div className={styles.empty}>
                  <UsersRound size={28} />
                  <h3>No students assigned</h3>
                  <p>Add verified students to activate this audience.</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {dialogMode ? (
        <div className={styles.modalOverlay}>
          <form
            className={styles.modal}
            onSubmit={
              dialogMode === "create"
                ? createGroup
                : (event) => {
                    event.preventDefault();
                    void saveMembers();
                  }
            }
          >
            <header>
              <div>
                <p className={styles.eyebrow}>
                  {dialogMode === "create"
                    ? "New student audience"
                    : "Group membership"}
                </p>
                <h2>
                  {dialogMode === "create"
                    ? "Create a group"
                    : `Manage ${selectedGroup?.name}`}
                </h2>
              </div>
              <button
                aria-label="Close"
                disabled={saving}
                onClick={() => setDialogMode(null)}
                type="button"
              >
                <X size={18} />
              </button>
            </header>

            {dialogMode === "create" ? (
              <section className={styles.formSection}>
                <div className={styles.twoColumns}>
                  <label>
                    Group name
                    <input
                      maxLength={80}
                      name="name"
                      placeholder="One-on-One Students"
                      required
                    />
                  </label>
                  <label className={styles.colorField}>
                    Group color
                    <input defaultValue="#111315" name="color" type="color" />
                  </label>
                </div>
                <label>
                  Description
                  <textarea
                    maxLength={500}
                    name="description"
                    placeholder="Who belongs in this group?"
                    rows={3}
                  />
                </label>
              </section>
            ) : null}

            <section className={styles.selectionSection}>
              <div className={styles.selectionHeader}>
                <div>
                  <h3>Add students</h3>
                  <p>
                    Select verified students now. Membership can be changed
                    later.
                  </p>
                </div>
                <button onClick={toggleAllStudents} type="button">
                  {selectedMembers.size === students.length
                    ? "Clear all"
                    : "Add all students"}
                </button>
              </div>
              <div className={styles.search}>
                <Search size={16} />
                <input
                  aria-label="Search students"
                  onChange={(event) => setStudentSearch(event.target.value)}
                  placeholder="Search verified students"
                  type="search"
                  value={studentSearch}
                />
              </div>
              <div className={styles.selectionTable}>
                <table>
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Student</th>
                      <th>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleStudents.map((student) => (
                      <tr key={student.applicationId}>
                        <td>
                          <input
                            aria-label={`Select ${student.fullName}`}
                            checked={selectedMembers.has(
                              student.applicationId,
                            )}
                            onChange={() =>
                              toggleStudent(student.applicationId)
                            }
                            type="checkbox"
                          />
                        </td>
                        <td>{student.fullName}</td>
                        <td>{student.email ?? "No email available"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {error ? <p className={styles.error}>{error}</p> : null}
            <footer className={styles.modalFooter}>
              <span>{selectedMembers.size} students selected</span>
              <div>
                <button
                  disabled={saving}
                  onClick={() => setDialogMode(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button disabled={saving} type="submit">
                  {saving ? (
                    <Loader2 className={styles.spin} size={16} />
                  ) : (
                    <Check size={16} />
                  )}
                  {dialogMode === "create"
                    ? "Create group"
                    : "Save membership"}
                </button>
              </div>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
