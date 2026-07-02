import { redirect } from "next/navigation";

export default function MediaLibraryRedirect() {
  redirect("/dashboard/courses?tab=media");
}
