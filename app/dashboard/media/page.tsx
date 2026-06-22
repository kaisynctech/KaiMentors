import { redirect } from "next/navigation";
import { CourseMediaLibrary } from "@/components/course-media-library";
import { DashboardShell } from "@/components/dashboard-shell";
import { createClient } from "@/lib/supabase/server";

export default async function MediaLibraryPage(){
  const supabase=await createClient(); if(!supabase)redirect("/login");
  const{data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
  const{data:membership}=await supabase.from("trader_members").select("trader_id,trader:traders(display_name)").eq("user_id",user.id).order("created_at").limit(1).maybeSingle();if(!membership)redirect("/dashboard");
  const{data}=await supabase.from("course_media").select("id,title,media_type,mime_type,size_bytes,duration_seconds,processing_state,created_at,lesson_content_blocks(count),resources(count)").eq("trader_id",membership.trader_id).order("created_at",{ascending:false});
  const media=(data??[]).map(item=>({...item,usageCount:(Array.isArray(item.lesson_content_blocks)?item.lesson_content_blocks[0]?.count??0:0)+(Array.isArray(item.resources)?item.resources[0]?.count??0:0)}));
  const trader=Array.isArray(membership.trader)?membership.trader[0]:membership.trader;
  return <DashboardShell activePath="/dashboard/media" description="Upload, reuse, replace, and audit protected learning assets." title="Media Library" userLabel={trader?.display_name??"Mentor workspace"}><CourseMediaLibrary media={media}/></DashboardShell>;
}
