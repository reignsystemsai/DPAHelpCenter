import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {db,manager,snapshot,rows,seed,enroll} from '../_shared/prephub-data.ts';
import {creditNeed,callEvidence,iso} from '../_shared/prephub-flow.ts';
import {savedProgress,analystInstructions} from '../_shared/daisy-report.ts';
const headers={'Access-Control-Allow-Origin':'https://www.dpahelpcenter.com','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const clean=(x:unknown,n=4000)=>String(x??'').trim().slice(0,n);
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return json({error:'POST required'},405);
 try{
  const client=db(),member=await manager(client,req),body=await req.json(),action=body.action||'report';
  if(action==='report'){
   const [s,workbooks]=await Promise.all([snapshot(client),rows(client,'prephub_credit_workbooks','lead_id,updated_at,readiness:content->credit_inputs->prepHubReadiness')]);
   const question=clean(body.question),opById=new Map(s.ops.map(o=>[o.lead_id,o])),bookById=new Map(workbooks.map(w=>[w.lead_id,w]));
   if(!question)return json({error:'Ask a CRM question first'},400);
   const clients=s.active.map(l=>{const workbook=bookById.get(l.id),progress=savedProgress(workbook?.readiness),pref=s.prefs.find(p=>p.lead_id===l.id),score=progress?.total??Number(l.current_readiness_score);return {id:l.lead_id,name:`${l.first_name} ${l.last_name}`,readiness_percent:[0,25,50,75,100].includes(score)?score:null,readiness_source:progress?'Saved PrepHub snapshot':'Stored CRM score; may reflect intake only',section_progress:progress?.sections||null,section_assessed:progress?.assessed||null,progress_recorded_at:progress?.recorded_at||null,last_saved_workbook_at:workbook?.updated_at||null,intake_readiness_percent:l.initial_readiness_score,credit_preparation_need:creditNeed(l,opById.get(l.id)),account_claimed_at:l.claimed_at||null,confirmed_interest_at:pref?.interested_at||null,callback_requested_at:pref?.callback_requested_at||null,next_action:opById.get(l.id)?.next_action||null,calls:s.calls.filter(c=>c.lead_id===l.id&&!c.metadata?.deleted_at&&!c.metadata?.archived_at).map(c=>({direction:c.direction,attempt_evidence:callEvidence(c),status:c.sequence_status,result:c.last_call_result,at:c.last_call_at,callback:c.callback_at||c.next_call_at,do_not_call:c.do_not_call,summary:clean(c.call_summary,1000)})),recent_communications:s.comms.filter(c=>c.lead_id===l.id).sort((a,b)=>Date.parse(b.occurred_at)-Date.parse(a.occurred_at)).slice(0,8).map(c=>({channel:c.channel,direction:c.direction,status:c.status,at:c.occurred_at,summary:clean(c.summary,700)}))};});
   const readiness_counts=Object.fromEntries([0,25,50,75,100].map(score=>[String(score),clients.filter(c=>c.readiness_percent===score).length]));
   const maxReadiness=Math.max(0,...clients.map(c=>c.readiness_percent??0)),topReadiness=clients.filter(c=>c.readiness_percent===maxReadiness);
   const engagementGroups={confirmed_requests:clients.filter(c=>c.confirmed_interest_at||c.callback_requested_at).map(c=>c.name),recorded_inbound_contact:clients.filter(c=>c.recent_communications.some(x=>x.direction==='inbound'&&!['queued','failed'].includes(String(x.status).toLowerCase()))).map(c=>c.name),saved_workbook_activity:clients.filter(c=>c.last_saved_workbook_at).map(c=>c.name),account_claimed_only_not_recent_activity:clients.filter(c=>c.account_claimed_at).map(c=>c.name),highest_recorded_readiness:{percent:maxReadiness,clients:topReadiness.map(c=>c.name)}};
   const strongEngagement=engagementGroups.confirmed_requests.length+engagementGroups.recorded_inbound_contact.length+engagementGroups.saved_workbook_activity.length;
   const rankingEvidence={...engagementGroups,no_unique_fastest_supported:strongEngagement===0&&topReadiness.length>1,outbound_contact_frequency_is_not_engagement:true};
   const facts={ranking_evidence:rankingEvidence,as_of:iso(Date.now()),counts:{...s.counts,readiness_percentages:readiness_counts},definitions:{credit_preparation_needs:'Indicated by intake / department fields; not a confirmed credit repair purchase.',no_recorded_outbound_call:'No outbound attempt evidence. Queued/Calling alone is not an attempt.',emails_sent:'Provider acceptance is not proof of delivery, opening or response.'},clients:clients.slice(0,250),coverage:clients.length>250?'First 250 clients shown; total/category counts cover all active records':'All active client records included',limitations:['No raw credit reports, uploaded documents, SSNs, phone numbers or email addresses are included.','Progress snapshots are available after the updated PrepHub calculation has been saved. Older stored CRM scores may still reflect intake.','Call/email logs can be incomplete; absence of a record is unknown.']};
   const key=Deno.env.get('OPENAI_API_KEY');
   if(!key)return json({error:'Daisy’s OpenAI connection is not configured. No analytical answer was generated.'},503);
   const history=Array.isArray(body.history)?body.history.filter((x:any)=>['user','assistant'].includes(x?.role)&&typeof x.content==='string').slice(-10).map((x:any)=>({role:x.role,content:clean(x.content,3000)})):[];
   const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:Deno.env.get('PREPHUB_AI_MODEL')||'gpt-4.1-mini',store:false,max_output_tokens:1100,instructions:analystInstructions,input:JSON.stringify({fresh_crm_facts:facts,conversation:history,current_question:question})}),signal:AbortSignal.timeout(35000)});
   const result=await response.json();if(!response.ok)return json({error:'Daisy’s OpenAI analysis is unavailable. Please try again; no generic report was substituted.'},502);
   const answer=(result.output||[]).flatMap((x:any)=>x.content||[]).filter((x:any)=>x.type==='output_text').map((x:any)=>x.text).join('\n').trim();
   if(!answer)return json({error:'Daisy returned no analytical answer. Please try again.'},502);
   return json({ok:true,answer,counts:facts.counts,as_of:facts.as_of,mode:'openai_crm',client_context_count:facts.clients.length});
  }
  if(action==='alerts'){const r=await client.from('prephub_contact_preferences').select('lead_id').or('interested_at.not.is.null,callback_requested_at.not.is.null');if(r.error)throw r.error;return json({ok:true,count:r.data.length});}
  if(action==='status'){
   await seed(client);const [s,scripts,jobs,settings]=await Promise.all([snapshot(client),rows(client,'prephub_outreach_scripts'),rows(client,'prephub_followup_jobs'),client.from('prephub_followup_settings').select('enabled,release_ready,started_at,last_sweep_at,last_error').eq('id',true).single()]);if(settings.error)throw settings.error;
   return json({ok:true,counts:s.counts,settings:settings.data,scripts:scripts.sort((a,b)=>a.script_key.localeCompare(b.script_key)||b.version-a.version),jobs:jobs.map(j=>({id:j.id,lead_id:j.lead_id,step_key:j.step_key,channel:j.channel,status:j.status,due_at:j.due_at,reason:j.reason,result:j.result,script_id:j.script_id,provider_id:j.provider_id})),clients:s.active.map(l=>({id:l.id,name:`${l.first_name} ${l.last_name}`,credit_need:creditNeed(l,s.ops.find(o=>o.lead_id===l.id)),permission_verified:!!s.prefs.find(p=>p.lead_id===l.id)?.voice_permission_verified_at,interested_at:s.prefs.find(p=>p.lead_id===l.id)?.interested_at,callback_requested_at:s.prefs.find(p=>p.lead_id===l.id)?.callback_requested_at}))});
  }
  if(member.role!=='owner')return json({error:'Owner access required for outreach changes'},403);
  if(action==='save_script'){
   const key=clean(body.script_key,60);if(!['welcome_call','credit_followup','prep_reminder'].includes(key))throw Error('Unknown script');
   const versions=await client.from('prephub_outreach_scripts').select('version,title,channel').eq('script_key',key).order('version',{ascending:false}).limit(1);if(versions.error)throw versions.error;const latest=versions.data[0];if(!latest)throw Error('Script not found');
   const allowed=latest.channel==='call'?['opening','overview','question','interested','callback','decline','stop','unknown','voicemail']:['subject','body','cta'];
   const content:any={};for(const k of allowed){content[k]=clean(body.content?.[k],k==='body'?6000:2000);if(!content[k])throw Error('Complete every script field');}
   const r=await client.from('prephub_outreach_scripts').insert({script_key:key,version:latest.version+1,title:latest.title,channel:latest.channel,content});if(r.error)throw r.error;return json({ok:true});
  }
  if(action==='approve_script'){
   const r=await client.from('prephub_outreach_scripts').update({approved_at:iso(Date.now()),approved_by:member.user_id}).eq('id',body.script_id).is('approved_at',null).select('id');if(r.error)throw r.error;if(r.data.length!==1)throw Error('Script already approved or missing');return json({ok:true});
  }
  if(action==='verify_voice_permission'){
   if(body.verified!==true)throw Error('Confirm permission was verified');const l=await client.from('prephub_leads').select('id').eq('id',body.lead_id).single();if(l.error)throw l.error;
   const r=await client.from('prephub_contact_preferences').upsert({lead_id:l.data.id,voice_permission_verified_at:iso(Date.now()),verified_by:member.user_id,updated_at:iso(Date.now())},{onConflict:'lead_id'});if(r.error)throw r.error;
   const jobs=await client.from('prephub_followup_jobs').update({status:'pending',reason:null,due_at:iso(Date.now()),updated_at:iso(Date.now())}).eq('lead_id',l.data.id).eq('reason','AI voice permission has not been verified').eq('status','needs_review');if(jobs.error)throw jobs.error;return json({ok:true});
  }
  if(action==='enable_flow'){
   const gate=await client.from('prephub_followup_settings').select('release_ready').eq('id',true).single();if(gate.error)throw gate.error;if(!gate.data.release_ready)throw Error('Production outreach deployment is awaiting owner approval. Reporting and script review are available.');
   const s=await snapshot(client);await enroll(client,s.active,s.ops);const r=await client.from('prephub_followup_settings').update({enabled:true,started_at:iso(Date.now()),started_by:member.user_id,updated_at:iso(Date.now())}).eq('id',true);if(r.error)throw r.error;return json({ok:true,enrolled:s.active.length});
  }
  if(action==='pause_flow'){const r=await client.from('prephub_followup_settings').update({enabled:false,updated_at:iso(Date.now())}).eq('id',true);if(r.error)throw r.error;return json({ok:true});}
  return json({error:'Unsupported action'},400);
 }catch(error){const message=error instanceof Error?error.message:'Daisy could not complete this request';return json({error:message},/Authentication/.test(message)?401:/access required/.test(message)?403:400);}
});
