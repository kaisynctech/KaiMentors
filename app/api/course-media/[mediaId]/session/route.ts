import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCourseUser } from "@/lib/course-access";

export async function POST(_request:Request,{params}:{params:Promise<{mediaId:string}>}){
 const{mediaId}=await params;const auth=await requireCourseUser();if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const{data:authorization,error}=await auth.supabase.rpc("issue_course_media_session",{target_media_id:mediaId});if(error||!authorization)return NextResponse.json({error:"Media is unavailable."},{status:404});
 const evidence=authorization as{storage_path:string;mime_type:string};const admin=createAdminClient();if(!admin)return NextResponse.json({error:"Media sessions are unavailable."},{status:503});const{data:signed}=await admin.storage.from("course-content").createSignedUrl(evidence.storage_path,300);if(!signed?.signedUrl)return NextResponse.json({error:"Media session could not be issued."},{status:503});return NextResponse.json({url:signed.signedUrl,expiresIn:300,mimeType:evidence.mime_type},{headers:{"Cache-Control":"no-store, private"}})
}
