import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Workspace invitation",
    template: "%s",
  },
};

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
