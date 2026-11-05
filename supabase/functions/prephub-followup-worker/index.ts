import {runDueCallbacks} from '../_shared/callback-scheduler.ts';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {db,manager,snapshot,enroll} from '../_shared/prephub-data.ts';
import {contactDecision,escapeHtml,iso,norm,timestamp} from '../_shared/prephub-flow.ts';
const base='https://fklchtsxahepzfzgcqdp.supabase.co/functions/v1/prephub-followup-worker';
const headers={'Access-Control-Allow-Origin':'https://www.dpahelpcenter.com','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
async function signature(secret:string,message:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const equal=(a:string,b:string)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;};
const fill=(text:string,lead:any)=>String(text||'').replaceAll('{first_name}',String(lead.first_name||'Homebuyer'));
async function write(client:any,table:string,value:any,id:string){const r=await client.from(table).update(value).eq('id',id);if(r.error)throw r.error;}
function interestPage(id:string,token:string,unsubscribe=false,done=false){
 return new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DPA Help Center</title><body style="font-family:Arial;background:#eef2f8;color:#081f5c;padding:32px"><main style="max-width:480px;margin:auto;background:white;padding:32px;border-radius:16px"><h2>DPA HELP CENTER</h2><h1>${done?(unsubscribe?'Email preference saved':'Your interest is recorded'):(unsubscribe?'Stop preparation emails?':'Would you like help?')}</h1><p>${done?(unsubscribe?'You will no longer receive this preparation email sequence.':'Our team will review your request and follow up with you.'):(unsubscribe?'Confirm below to stop these preparation follow-ups.':'Confirm below and our team will explain the preparation options and any costs before you decide.')}</p>${done?'':`<form method="POST" action="${base}"><input type="hidden" name="action" value="${unsubscribe?'unsubscribe':'interest'}"><input type="hidden" name="job_id" value="${escapeHtml(id)}"><input type="hidden" name="token" value="${escapeHtml(token)}"><button style="padding:14px 22px;background:#c8102e;color:white;border:0;border-radius:8px;font-weight:bold">${unsubscribe?'Stop these emails':'Yes, I’m interested'}</button></form>`}</main></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"}});
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 const client=db();
 try{
  const url=new URL(req.url);
  if(req.method==='GET'||req.headers.get('content-type')?.includes('application/x-www-form-urlencoded')){
   const form=req.method==='POST'?await req.formData():null,id=String(form?.get('job_id')||url.searchParams.get('job_id')||''),token=String(form?.get('token')||url.searchParams.get('token')||''),unsub=(form?.get('action')||url.searchParams.get('action'))==='unsubscribe';
   if(!id||!token)return json({error:'Invalid link'},404);
   const r=await client.from('prephub_followup_jobs').select('id,lead_id,interest_token').eq('id',id).maybeSingle();if(r.error)throw r.error;
   if(!r.data||!equal(token,r.data.interest_token))return json({error:'Invalid link'},404);
   if(req.method==='POST'){
    const changes=unsub?{email_paused:true}:{interested_at:iso(Date.now())};const p=await client.from('prephub_contact_preferences').upsert({lead_id:r.data.lead_id,...changes,updated_at:iso(Date.now())},{onConflict:'lead_id'});if(p.error)throw p.error;
    const paused=await client.from('prephub_followup_jobs').update({status:unsub?'paused':'needs_review',reason:unsub?'Email unsubscribed':'Client confirmed interest; owner follow-up needed',updated_at:iso(Date.now())}).eq('lead_id',r.data.lead_id).in('status',['pending','needs_review']).eq('channel',unsub?'email':'call');if(paused.error)throw paused.error;
    if(!unsub){const e=await client.from('lead_communications').insert({lead_id:r.data.lead_id,channel:'email',direction:'inbound',provider:'prephub',template_key:'prephub_interest',subject:'Client requested preparation help',summary:'Client confirmed interest on the preparation follow-up page. Owner follow-up needed.',status:'received',metadata:{workflow_job_id:id},occurred_at:iso(Date.now())});if(e.error)throw e.error;}
   }
   return interestPage(id,token,unsub,req.method==='POST');
  }
  if(req.method!=='POST')return json({error:'POST required'},405);
  const raw=await req.text(),body=JSON.parse(raw);
  if(['interest','unsubscribe'].includes(body.action)){
   const r=await client.from('prephub_followup_jobs').select('id,lead_id,interest_token,result').eq('id',String(body.job_id||'')).maybeSingle();if(r.error)throw r.error;if(!r.data||!equal(String(body.token||''),r.data.interest_token))return json({error:'Invalid confirmation link'},404);
   const unsub=body.action==='unsubscribe',job=r.data;
   const pref=await client.from('prephub_contact_preferences').upsert({lead_id:job.lead_id,...(unsub?{email_paused:true}:{interested_at:iso(Date.now())}),updated_at:iso(Date.now())},{onConflict:'lead_id'});if(pref.error)throw pref.error;
   let hold=client.from('prephub_followup_jobs').update({status:unsub?'paused':'needs_review',reason:unsub?'Email unsubscribed':'Client confirmed interest; owner follow-up needed',updated_at:iso(Date.now())}).eq('lead_id',job.lead_id).in('status',['pending','needs_review']);if(unsub)hold=hold.eq('channel','email');const held=await hold;if(held.error)throw held.error;
   if(!unsub){const mark=await client.from('prephub_followup_jobs').update({result:{...job.result,interest_confirmed_at:iso(Date.now())}}).eq('id',job.id).is('result->>interest_confirmed_at',null).select('id');if(mark.error)throw mark.error;if(mark.data.length){const event=await client.from('lead_communications').insert({lead_id:job.lead_id,channel:'email',direction:'inbound',provider:'prephub',template_key:'prephub_interest',subject:'Client requested preparation help',summary:'Client confirmed interest on the preparation follow-up page. Owner follow-up needed.',status:'received',metadata:{workflow_job_id:job.id},occurred_at:iso(Date.now())});if(event.error)throw event.error;}}
   return json({ok:true,unsubscribed:unsub});
  }
  if(body.action==='call_result'){
   const time=req.headers.get('x-helux-timestamp')||'',provided=req.headers.get('x-helux-signature')||'',key=Deno.env.get('HELUX_API_KEY')||'';
   if(!key||!/^\d{13}$/.test(time)||Math.abs(Date.now()-Number(time))>300000||!equal(provided,await signature(key,`${time}.${raw}`)))return json({error:'Unauthorized'},401);
   const r=await client.from('prephub_followup_jobs').select('*').eq('id',body.job_id).eq('channel','call').single();if(r.error)throw r.error;const job=r.data;
   if(job.provider_id&&job.provider_id!==body.call_sid)return json({error:'Call identity mismatch'},409);
   const result=body.result||{},status=String(body.status||''),terminal=['completed','no-answer','busy','failed','canceled'].includes(status);
   // Ignore delayed ringing callbacks after a terminal result.
   if(['completed','failed','needs_review'].includes(job.status)&&!terminal)return json({ok:true,ignored:true});
   const interested=result.intent==='interested',callback=result.intent==='callback',stopped=result.intent==='stop';
   const changes:any={updated_at:iso(Date.now())};if(interested)changes.interested_at=iso(Date.now());if(callback)changes.callback_requested_at=iso(Date.now());if(stopped)changes.call_paused=true;
   if(Object.keys(changes).length>1){const p=await client.from('prephub_contact_preferences').upsert({lead_id:job.lead_id,...changes},{onConflict:'lead_id'});if(p.error)throw p.error;}
   const jobStatus=interested||callback||result.intent==='needs_review'?'needs_review':terminal?(status==='completed'?'completed':'failed'):'submitted';
   await write(client,'prephub_followup_jobs',{status:jobStatus,provider_id:body.call_sid,reason:interested?'Client requested help':callback?'Callback requested':stopped?'Calls stopped':status,result:{...job.result,...result,provider_status:status},updated_at:iso(Date.now())},job.id);
   const l=await client.from('prephub_leads').select('initial_readiness_score').eq('id',job.lead_id).single();if(l.error)throw l.error;
   const qualification=Number(l.data.initial_readiness_score)===100?'qualified':'unqualified';
   const previous=await client.from('helux_cases').select('id,metadata,do_not_call,attempts_used').eq('lead_id',job.lead_id).eq('direction','outbound').eq('qualification',qualification).maybeSingle();if(previous.error)throw previous.error;
   const sequence=stopped||previous.data?.do_not_call?'Do Not Call':interested||callback||result.intent==='needs_review'?'Human Action':terminal?'Completed':'Calling';
   const lastResult=result.intent==='voicemail'?'Voicemail':['interested','callback','decline','stop'].includes(result.intent)?'Connected':status==='completed'?'Completed; conversation unconfirmed':status==='no-answer'?'No Answer':status==='busy'?'Busy':status==='failed'?'Failed':null;
   const tracking:any={lead_id:job.lead_id,direction:'outbound',qualification,ai_agent:'Daisy',sequence_status:sequence,do_not_call:!!(stopped||previous.data?.do_not_call),call_summary:String(result.summary||result.intent||status).slice(0,4000),metadata:{...(previous.data?.metadata||{}),twilio_call_sid:body.call_sid,workflow_job_id:job.id,script_id:job.script_id,provider:'twilio_prephub',last_result_at:iso(Date.now())},updated_at:iso(Date.now())};
   if(lastResult)tracking.last_call_result=lastResult;if(['ringing','in-progress','completed','no-answer','busy','failed','canceled'].includes(status)){tracking.last_call_at=iso(Date.now());tracking.attempts_used=Math.max(1,Number(previous.data?.attempts_used)||0);}
   const track=previous.data?await client.from('helux_cases').update(tracking).eq('id',previous.data.id):await client.from('helux_cases').insert(tracking);if(track.error)throw track.error;
   const keyId=String(body.call_sid||''),existing=await client.from('lead_communications').select('id,metadata').eq('provider','twilio_prephub').eq('provider_message_id',keyId).maybeSingle();if(existing.error)throw existing.error;
   const entry={lead_id:job.lead_id,channel:'call',direction:'outbound',provider:'twilio_prephub',template_key:'prephub_welcome_call',subject:'PrepHub welcome & walkthrough',summary:String(result.summary||result.intent||status).slice(0,4000),status:terminal?status:'queued',provider_message_id:keyId,metadata:{...(existing.data?.metadata||{}),workflow_job_id:job.id,script_id:job.script_id,call_result:result.intent||status},occurred_at:iso(Date.now())};
   const e=existing.data?await client.from('lead_communications').update(entry).eq('id',existing.data.id):await client.from('lead_communications').insert(entry);if(e.error)throw e.error;
   if(['no-answer','busy'].includes(status)&&job.step_key==='welcome_call'){const retry=await client.from('prephub_followup_jobs').upsert({lead_id:job.lead_id,step_key:'welcome_call_retry',channel:'call',script_id:job.script_id,due_at:iso(Date.now()+2*86400000),reason:'One retry after unanswered welcome call'},{onConflict:'lead_id,step_key',ignoreDuplicates:true});if(retry.error)throw retry.error;}
   return json({ok:true});
  }
  const setting=await client.from('prephub_followup_settings').select('*').eq('id',true).single();if(setting.error)throw setting.error;
  if(!body.runner_token||!equal(String(body.runner_token),setting.data.runner_token)){const m=await manager(client,req);if(m.role!=='owner')return json({error:'Owner access required'},403);}
  if(setting.data.workflow_mode){const callbacks=await runDueCallbacks(client,setting.data,Date.now(),body.callback_job_id);return json({ok:true,...callbacks,legacy_dispatch_disabled:true});}
  if(!setting.data.enabled)return json({ok:true,paused:true});
  const s=await snapshot(client);await enroll(client,s.active.filter(l=>timestamp(l.created_at)>=timestamp(setting.data.started_at)),s.ops);
  // A lost response must never trigger a duplicate call. Reconcile manually instead.
  const stale=await client.from('prephub_followup_jobs').update({status:'needs_review',reason:'Dispatch outcome unconfirmed; verify provider before retrying',updated_at:iso(Date.now())}).eq('status','working').lt('updated_at',iso(Date.now()-15*60000));if(stale.error)throw stale.error;
  const due=await client.from('prephub_followup_jobs').select('*,prephub_outreach_scripts(*)').eq('status','pending').is('task_kind',null).lte('due_at',iso(Date.now())).order('due_at').limit(5);if(due.error)throw due.error;
  const results:any[]=[];
  for(const job of due.data){
   const claim=await client.from('prephub_followup_jobs').update({status:'working',attempts:job.attempts+1,updated_at:iso(Date.now())}).eq('id',job.id).eq('status','pending').select('id');if(claim.error)throw claim.error;if(!claim.data.length)continue;
   const lead=s.active.find(l=>l.id===job.lead_id),op=s.ops.find(o=>o.lead_id===job.lead_id),pref=s.prefs.find(p=>p.lead_id===job.lead_id),calls=s.calls.filter(c=>c.lead_id===job.lead_id&&!c.metadata?.deleted_at&&!c.metadata?.archived_at),comms=s.comms.filter(c=>c.lead_id===job.lead_id);
   const decision=contactDecision(job,lead,op,pref,calls,comms);
   if(decision.status!=='ready'){await write(client,'prephub_followup_jobs',{...decision,updated_at:iso(Date.now())},job.id);results.push({id:job.id,...decision});continue;}
   const script=job.prephub_outreach_scripts;
   if(!script?.approved_at){await write(client,'prephub_followup_jobs',{status:'needs_review',reason:'Script is not approved'},job.id);continue;}
   try{
    if(job.channel==='email'){
     const apiKey=Deno.env.get('RESEND_API_KEY');if(!apiKey)throw Error('Resend is not configured');
     const link=`https://www.dpahelpcenter.com/prephub/interest/?job_id=${job.id}&token=${job.interest_token}`,unsub=link+'&action=unsubscribe',subject=fill(script.content.subject,lead),text=fill(script.content.body,lead);
     const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':job.id},body:JSON.stringify({from:'DPA Help Center <ready@mail.dpahelpcenter.com>',reply_to:'help@dpahelpcenter.com',to:[lead.email],subject,text:`${text}\n\nConfirm interest: ${link}\nOpen PrepHub: https://www.dpahelpcenter.com/prephub/\nStop preparation follow-ups: ${unsub}`,html:`<div style="font-family:Arial;color:#081f5c;max-width:600px;margin:auto;padding:24px"><h2>DPA HELP CENTER</h2><div style="white-space:pre-line;line-height:1.7">${escapeHtml(text)}</div><p><a style="display:inline-block;padding:13px 20px;background:#c8102e;color:white;border-radius:8px;text-decoration:none" href="${escapeHtml(link)}">${escapeHtml(script.content.cta)}</a></p><p><a href="https://www.dpahelpcenter.com/prephub/">Open PrepHub</a></p><p style="font-size:12px"><a href="${escapeHtml(unsub)}">Stop preparation follow-ups</a></p></div>`}),signal:AbortSignal.timeout(15000)});
     const result=await r.json();if(!r.ok)throw Error(result.message||'Email request failed');
     const e=await client.from('lead_communications').insert({lead_id:lead.id,channel:'email',direction:'outbound',provider:'resend',template_key:'prephub_'+job.step_key,subject,summary:'Approved preparation follow-up email accepted by provider',status:'sent',provider_message_id:result.id,metadata:{workflow_job_id:job.id,script_id:script.id,script_version:script.version},occurred_at:iso(Date.now())});if(e.error)throw e.error;
     await write(client,'prephub_followup_jobs',{status:'completed',provider_id:result.id,reason:'Email accepted by provider; delivery not confirmed',updated_at:iso(Date.now())},job.id);
     s.comms.push({lead_id:lead.id,direction:'outbound',channel:'email',status:'sent',occurred_at:iso(Date.now())});
    }else{
     const apiKey=Deno.env.get('HELUX_API_KEY');if(!apiKey)throw Error('Phone connection is not configured');
     const r=await fetch('https://helux-ai-workforce.onrender.com/api/v1/prephub/calls',{method:'POST',headers:{'x-helux-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify({job_id:job.id,lead_id:lead.lead_id,phone:lead.phone,first_name:lead.first_name,permission_verified:true,script_id:script.id,script_version:script.version,script:script.content,result_url:base}),signal:AbortSignal.timeout(20000)});
     const result=await r.json();if(!r.ok||!result.call_sid)throw Error(result.error||'Phone dispatch did not confirm a call');
     await write(client,'prephub_followup_jobs',{status:'submitted',provider_id:result.call_sid,reason:'Call submitted; awaiting provider outcome',updated_at:iso(Date.now())},job.id);
     s.comms.push({lead_id:lead.id,direction:'outbound',channel:'call',status:'submitted',occurred_at:iso(Date.now())});
    }
    results.push({id:job.id,status:'dispatched'});
   }catch(error){await write(client,'prephub_followup_jobs',{status:'needs_review',reason:error instanceof Error?error.message:'Dispatch failed',updated_at:iso(Date.now())},job.id);results.push({id:job.id,status:'needs_review'});}
  }
  const finish=await client.from('prephub_followup_settings').update({last_sweep_at:iso(Date.now()),last_error:null}).eq('id',true);if(finish.error)throw finish.error;
  return json({ok:true,processed:results});
 }catch(error){const message=error instanceof Error?error.message:'Follow-up failed';return json({error:message},/Authentication/.test(message)?401:/access required/.test(message)?403:400);}
});
