import { notFound, redirect } from "next/navigation";
import { CourseDetailManager } from "@/components/course-detail-manager";
import { DashboardShell } from "@/components/dashboard-shell";
import { createClient } from "@/lib/supabase/server";

export default async function CourseDetailPage({params}:{params:Promise<{courseId:string}>}){
 const{courseId}=await params;const supabase=await createClient();if(!supabase)redirect("/login");const{data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 const{data:membership}=await supabase.from("trader_members").select("trader_id,trader:traders(display_name)").eq("user_id",user.id).order("created_at").limit(1).maybeSingle();if(!membership)redirect("/dashboard");
 const tid=membership.trader_id;
 const[{data:course},{data:moduleRows},{data:lessonRows},{data:blockRows},{data:media},{data:groups},{data:students},{data:grants},{data:progressRows},{data:resources}]=await Promise.all([
  supabase.from("courses").select("id,title,description,status,sort_order,access_mode").eq("id",courseId).eq("trader_id",tid).maybeSingle(),
  supabase.from("course_modules").select("id,title,description,status,sort_order,is_required").eq("course_id",courseId).eq("trader_id",tid).order("sort_order").order("created_at"),
  supabase.from("lessons").select("id,module_id,title,description,status,sort_order,duration_seconds,is_required").eq("course_id",courseId).eq("trader_id",tid).order("sort_order").order("created_at"),
  supabase.from("lesson_content_blocks").select("id,lesson_id,block_type,sort_order,media_id").eq("course_id",courseId).eq("trader_id",tid).order("sort_order"),
  supabase.from("course_media").select("id,title,media_type,processing_state").eq("trader_id",tid).not("processing_state","in",'(archived,replaced)'),
  supabase.from("student_groups").select("id,name,color").eq("trader_id",tid).eq("is_active",true).order("name"),
  supabase.from("student_applications").select("student_user_id,full_name,email").eq("trader_id",tid).eq("status","verified").not("student_user_id","is",null).order("full_name"),
  supabase.from("content_access_grants").select("group_id,student_user_id").eq("trader_id",tid).eq("entity_type","course").eq("entity_id",courseId),
  supabase.from("lesson_progress").select("student_user_id,is_started,is_completed,last_activity_at").eq("trader_id",tid).eq("course_id",courseId),
  supabase.from("resources").select("id,title,status,sort_order").eq("trader_id",tid).eq("course_id",courseId).order("sort_order"),
 ]);if(!course)notFound();
 const blocks=blockRows??[];const lessons=(lessonRows??[]).map(l=>({...l,blocks:blocks.filter(b=>b.lesson_id===l.id)}));
 const modules=(moduleRows??[]).map(m=>({...m,lessons:lessons.filter(l=>l.module_id===m.id)}));
 const studentList=(students??[]).filter((s):s is typeof s & {student_user_id:string}=>Boolean(s.student_user_id));
 const progress=studentList.map(student=>{const rows=(progressRows??[]).filter(p=>p.student_user_id===student.student_user_id);return{student_user_id:student.student_user_id,full_name:student.full_name,started:rows.filter(r=>r.is_started).length,completed:rows.filter(r=>r.is_completed).length,last_activity_at:rows.sort((a,b)=>(b.last_activity_at??"").localeCompare(a.last_activity_at??""))[0]?.last_activity_at??null}}).filter(p=>p.started>0);
 const trader=Array.isArray(membership.trader)?membership.trader[0]:membership.trader;
 return <DashboardShell activePath="/dashboard/courses" description="Manage structured curriculum, protected media, access, and learner progress." title={course.title} userLabel={trader?.display_name??"Mentor workspace"}><CourseDetailManager course={course} modules={modules} media={media??[]} groups={groups??[]} students={studentList} selectedGroupIds={(grants??[]).map(g=>g.group_id).filter((v):v is string=>Boolean(v))} selectedStudentIds={(grants??[]).map(g=>g.student_user_id).filter((v):v is string=>Boolean(v))} progress={progress} resources={resources??[]}/></DashboardShell>
}
