import { redirect } from "next/navigation";
import { CourseMediaLibrary } from "@/components/course-media-library";
import { DashboardShell } from "@/components/dashboard-shell";
import { getMentorWorkspace } from "@/lib/workspace";

export default async function MediaLibraryPage(){
  const workspace=await getMentorWorkspace();if(!workspace)redirect("/login");
  const{supabase,traderId,displayName}=workspace;
  const{data}=await supabase.from("course_media").select("id,title,media_type,mime_type,size_bytes,duration_seconds,processing_state,created_at,lesson_content_blocks(count),resources(count)").eq("trader_id",traderId).order("created_at",{ascending:false});
  const media=(data??[]).map(item=>({...item,usageCount:(Array.isArray(item.lesson_content_blocks)?item.lesson_content_blocks[0]?.count??0:0)+(Array.isArray(item.resources)?item.resources[0]?.count??0:0)}));
  return <DashboardShell activePath="/dashboard/media" description="Upload, reuse, replace, and audit protected learning assets." title="Media Library" userLabel={displayName} traderId={traderId}><CourseMediaLibrary media={media}/></DashboardShell>;
}
