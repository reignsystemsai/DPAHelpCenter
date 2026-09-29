import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const allowedOrigins=["https://www.dpahelpcenter.com","https://dpahelpcenter.com","https://dpahelpcenter.onrender.com"];
function cors(origin:string){const allowed=allowedOrigins.includes(origin)||/^https:\/\/dpahelpcenter-pr-\d+\.onrender\.com$/.test(origin);return {"Access-Control-Allow-Origin":allowed?origin:allowedOrigins[0],"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"}}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin")||"";
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(req.method!=="POST")return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers:{...cors(origin),"Content-Type":"application/json"}});
  try{
    const body=await req.json(),scope=String(body.scope||""),visitorId=String(body.visitor_id||""),path=String(body.path||"").slice(0,500);
    if(!["website","prephub"].includes(scope)||!/^[0-9a-f-]{36}$/i.test(visitorId))return new Response(JSON.stringify({error:"Invalid visit"}),{status:400,headers:{...cors(origin),"Content-Type":"application/json"}});
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
    const date=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const {error}=await db.from("site_daily_visitors").upsert({scope,visitor_id:visitorId,visit_date:date,last_seen_at:new Date().toISOString(),path},{onConflict:"scope,visitor_id,visit_date"});
    if(error)throw error;
    return new Response(JSON.stringify({ok:true}),{headers:{...cors(origin),"Content-Type":"application/json"}});
  }catch(error){console.error(error);return new Response(JSON.stringify({error:"Visit could not be recorded"}),{status:500,headers:{...cors(origin),"Content-Type":"application/json"}})}
});
