export const STUDENT_PROJECT_CATEGORIES = [
  { value: "web-app", label: "Web App" },
  { value: "ai-agent", label: "AI Agent" },
  { value: "automation", label: "Automation" },
  { value: "mobile-app", label: "Mobile App" },
  { value: "other", label: "Other" },
] as const;

export type StudentProjectCategory =
  (typeof STUDENT_PROJECT_CATEGORIES)[number]["value"];

export interface StudentProject {
  id: string;
  title: string;
  student_name: string;
  description: string | null;
  category: string;
  live_url: string | null;
  github_url: string | null;
  thumbnail_url: string | null;
  tools: string[];
  featured: boolean;
  published: boolean;
  created_at: string;
}

export function studentProjectCategoryLabel(value: string) {
  return (
    STUDENT_PROJECT_CATEGORIES.find((category) => category.value === value)
      ?.label ?? value
  );
}

export function parseStudentProjectTools(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);
}
