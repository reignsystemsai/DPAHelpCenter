import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const clean=(value:unknown,max=4000)=>String(value??"").trim().slice(0,max);
const title=(value:unknown)=>clean(value,100).split(/[-_\s]+/).filter(Boolean).map(word=>word[0].toUpperCase()+word.slice(1).toLowerCase()).join(" ");
const yesNo=(value:unknown)=>{const normalized=clean(value,30).toLowerCase();if(["yes","true","1","y"].includes(normalized))return "Yes";if(["no","false","0","n"].includes(normalized))return "No";return ""};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
async function signature(secret:string,message:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message)));return [...bytes].map(byte=>byte.toString(16).padStart(2,"0")).join("")}
function safeEqual(left:string,right:string){if(left.length!==right.length)return false;let different=0;for(let index=0;index<left.length;index+=1)different|=left.charCodeAt(index)^right.charCodeAt(index);return different===0}

function callResult(statusValue:unknown,outcomeValue:unknown){
  const status=clean(statusValue,80).toLowerCase(),outcome=clean(outcomeValue,80).toLowerCase();
  if(status.includes("no-answer")||status.includes("no answer"))return "No Answer";
  if(status.includes("busy"))return "Busy";
  if(status.includes("voicemail")||outcome.includes("voicemail"))return "Voicemail";
  if(status.includes("failed")||status.includes("canceled"))return "Failed";
  if(status.includes("disconnect")||outcome.includes("disconnect"))return "Disconnected";
  if(["answered","in-progress","completed"].some(value=>status.includes(value)))return "Connected";
  return "";
}

function sequenceStatus(payload:Record<string,unknown>){
  const status=clean(payload.sequence_status||payload.status,80).toLowerCase(),result=(payload.result&&typeof payload.result==="object"?payload.result:{}) as Record<string,unknown>;
  if(clean(result.contact_restriction)||/do.not.call|opt.out/.test(clean(payload.outcome,80).toLowerCase()))return "Do Not Call";
  if(clean(result.callback_at))return "Callback Scheduled";
  if(status.includes("human")||status.includes("agent"))return "Human Action";
  if(status.includes("exhaust"))return "Exhausted";
  if(status.includes("pause"))return "Paused";
  if(status.includes("wait")||status.includes("retry"))return "Waiting Retry";
  if(status.includes("schedule"))return "Scheduled";
  if(status.includes("calling")||status.includes("ring")||status.includes("progress"))return "Calling";
  if(status.includes("complete"))return "Completed";
  if(status.includes("wrong"))return "Wrong Number";
  return "Ready";
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const secret=Deno.env.get("HELUX_API_KEY")||"",timestamp=req.headers.get("x-helux-timestamp")||"",provided=(req.headers.get("x-helux-signature")||"").replace(/^sha256=/,"");
  if(!secret||!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>300000)return json({error:"Unauthorized"},401);
  try{
    const rawBody=await req.text(),expected=await signature(secret,`${timestamp}.${rawBody}`);
    if(!safeEqual(provided,expected))return json({error:"Unauthorized"},401);
    const payload=JSON.parse(rawBody) as Record<string,unknown>,result=(payload.result&&typeof payload.result==="object"?payload.result:{}) as Record<string,unknown>;
    const externalLeadId=clean(payload.lead_id,150),phone=clean(payload.phone,30).replace(/\D/g,"");
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
    let leadQuery=db.from("prephub_leads").select("id,lead_id,initial_readiness_score,phone").limit(1);
    leadQuery=externalLeadId?leadQuery.eq("lead_id",externalLeadId):leadQuery.eq("phone",phone);
    const {data:lead,error:leadError}=await leadQuery.maybeSingle();
    if(leadError)throw leadError;
    if(!lead)return json({error:"Lead not found",lead_id:externalLeadId||null},404);

    const direction=clean(payload.direction,20).toLowerCase()==="inbound"?"inbound":"outbound";
    const qualification=clean(payload.qualification,20).toLowerCase()==="unqualified"||Number(lead.initial_readiness_score)<100?"unqualified":"qualified";
    const existing=await db.from("helux_cases").select("metadata").eq("lead_id",lead.id).eq("direction",direction).eq("qualification",qualification).maybeSingle();
    if(existing.error)throw existing.error;
    const callbackAt=clean(result.callback_at,60)||null,nextAction=clean(payload.next_action||result.next_action,2000);
    const metadata={...(existing.data?.metadata||{}),case_id:clean(payload.case_id,150),call_id:clean(payload.call_id,150),twilio_call_sid:clean(payload.twilio_call_sid,150),has_realtor:yesNo(result.has_realtor),applied_with_lender:yesNo(result.applied_with_lender),time_frame:clean(result.time_frame||result.purchase_timeline_detail,120),purchase_area:clean(result.purchase_area,250),interest_level:clean(result.interest_level,120),next_action:nextAction,sentiment:clean(payload.sentiment,80),call_status:clean(payload.status,80),transcript_count:Math.max(0,Number(payload.transcript_count)||0),last_result_at:new Date().toISOString()};
    const lastResult=callResult(payload.status,payload.outcome||result.final_outcome),sequence=sequenceStatus(payload),completed=["Completed","Do Not Call","Wrong Number","Exhausted"].includes(sequence);
    const {data:call,error:callError}=await db.from("helux_cases").upsert({lead_id:lead.id,direction,qualification,ai_agent:"Daisy",sequence_status:sequence,priority:qualification==="qualified"?"High":"Normal",attempts_used:Math.max(0,Number(payload.attempts_used)||0),max_attempts:5,next_call_at:callbackAt,callback_at:callbackAt,last_call_at:new Date().toISOString(),last_call_result:lastResult,business_outcome:title(payload.outcome||result.final_outcome),call_summary:clean(payload.summary||result.summary,4000),consent:"Confirmed",do_not_call:sequence==="Do Not Call",metadata},{onConflict:"lead_id,direction,qualification"}).select("id").single();
    if(callError)throw callError;

    const communicationStatus=sequence==="Completed"?"completed":lastResult==="Connected"?"answered":lastResult==="Failed"?"failed":"queued",providerMessageId=clean(payload.call_id,150)||null;
    const communication={lead_id:lead.id,channel:"call",direction,provider:"helux",template_key:direction==="inbound"?"daisy_inbound":"daisy_initial_outbound",subject:`Daisy ${direction} call`,summary:clean(payload.summary||result.summary||nextAction,4000),status:communicationStatus,provider_message_id:providerMessageId,metadata:{case_id:clean(payload.case_id,150),sequence_status:sequence,last_call_result:lastResult,business_outcome:title(payload.outcome||result.final_outcome)},occurred_at:new Date().toISOString()};
    const existingCommunication=providerMessageId?await db.from("lead_communications").select("id").eq("provider","helux").eq("provider_message_id",providerMessageId).maybeSingle():{data:null,error:null};
    if(existingCommunication.error)throw existingCommunication.error;
    const communicationWrite=existingCommunication.data?await db.from("lead_communications").update(communication).eq("id",existingCommunication.data.id):await db.from("lead_communications").insert(communication);
    if(communicationWrite.error)throw communicationWrite.error;
    return json({ok:true,lead_id:lead.lead_id,helux_case_id:call.id,direction,qualification,sequence_status:sequence,completed});
  }catch(error){console.error(error);return json({error:"Call result could not be written to the CRM"},500)}
});
