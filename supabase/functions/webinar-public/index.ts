import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const allowedOrigins=["https://www.dpahelpcenter.com","https://dpahelpcenter.com","https://dpahelpcenter.onrender.com"];
function cors(origin:string){const allowed=allowedOrigins.includes(origin)||/^https:\/\/dpahelpcenter-pr-\d+\.onrender\.com$/.test(origin);return {"Access-Control-Allow-Origin":allowed?origin:allowedOrigins[0],"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Vary":"Origin"}}
function json(body:unknown,status=200,origin=""){return new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json"}})}
function clean(value:unknown,max=320){return String(value??"").trim().slice(0,max)}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin")||"";
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    if(req.method==="GET"){
      const id=new URL(req.url).searchParams.get("id")||"";
      if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"Webinar not found"},404,origin);
      const {data,error}=await db.from("webinars").select("id,title,status,mode,frequency,always_on,start_minute,timezone,duration_minutes,capacity,host_name,host_title,avatar_path,video_path,video_url,description,cta_minute,cta_text,cta_url,redirect_url,settings").eq("id",id).eq("status","active").maybeSingle();
      if(error)throw error;if(!data)return json({error:"This webinar is not currently available."},404,origin);
      let videoUrl=data.video_url||"";let avatarUrl="";
      if(data.video_path){const signed=await db.storage.from("webinar-videos").createSignedUrl(data.video_path,7200);videoUrl=signed.data?.signedUrl||""}
      if(data.avatar_path){const signed=await db.storage.from("manager-avatars").createSignedUrl(data.avatar_path,7200);avatarUrl=signed.data?.signedUrl||""}
      return json({webinar:{...data,video_url:videoUrl,avatar_url:avatarUrl,video_path:undefined,avatar_path:undefined}},200,origin);
    }
    if(req.method==="POST"){
      const body=await req.json();const webinarId=clean(body.webinar_id,36);const email=clean(body.email).toLowerCase();const firstName=clean(body.first_name,100);const phone=clean(body.phone,30).replace(/\D/g,"");const source=clean(body.source,500);const sessionAt=new Date(clean(body.session_at,50));
      if(!/^[0-9a-f-]{36}$/i.test(webinarId)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!firstName||Number.isNaN(sessionAt.getTime()))return json({error:"Complete the registration form."},400,origin);
      const webinar=await db.from("webinars").select("id").eq("id",webinarId).eq("status","active").maybeSingle();if(webinar.error)throw webinar.error;if(!webinar.data)return json({error:"This webinar is not currently available."},404,origin);
      const duplicate=await db.from("webinar_registrations").select("id").eq("webinar_id",webinarId).eq("email",email).eq("session_at",sessionAt.toISOString()).maybeSingle();if(duplicate.error)throw duplicate.error;
      if(!duplicate.data){const lead=await db.from("prephub_leads").select("id").eq("email",email).order("created_at",{ascending:false}).limit(1).maybeSingle();const inserted=await db.from("webinar_registrations").insert({webinar_id:webinarId,lead_id:lead.data?.id||null,email,first_name:firstName,phone,session_at:sessionAt.toISOString(),source});if(inserted.error)throw inserted.error}
      return json({ok:true,session_at:sessionAt.toISOString()},200,origin);
    }
    return json({error:"Method not allowed"},405,origin);
  }catch(error){console.error(error);return json({error:"The webinar service could not complete that request."},500,origin)}
});
