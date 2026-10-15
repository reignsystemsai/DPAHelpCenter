import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {db,manager,snapshot,rows,seed,enroll} from '../_shared/prephub-data.ts';
import {creditNeed,callEvidence,iso} from '../_shared/prephub-flow.ts';
const headers={'Access-Control-Allow-Origin':'https://www.dpahelpcenter.com','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const clean=(x:unknown,n=4000)=>String(x??'').trim().slice(0,n);
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return json({error:'POST required'},405);
 try{
  const client=db(),member=await manager(client,req),body=await req.json(),action=body.action||'report';
  if(action==='report'){
   const s=await snapshot(client),question=clean(body.question),opById=new Map(s.ops.map(o=>[o.lead_id,o]));
   const facts={as_of:iso(Date.now()),counts:s.counts,definitions:{credit_preparation_needs:'Intake below 640, credit focus or department indication; not a diagnosis or a confirmed purchase of credit repair.',no_recorded_outbound_call:'No outbound attempt evidence in CRM; queued/Calling without attempt evidence does not count.',emails_sent:'Provider sent/accepted or delivered record; sent alone does not confirm delivery.'},clients:s.active.map(l=>({id:l.lead_id,name:`${l.first_name} ${l.last_name}`,credit_preparation_need:creditNeed(l,opById.get(l.id)),account_claimed:!!l.claimed_at,next_action:opById.get(l.id)?.next_action||null,calls:s.calls.filter(c=>c.lead_id===l.id&&!c.metadata?.deleted_at&&!c.metadata?.archived_at).map(c=>({direction:c.direction,attempt_evidence:callEvidence(c),status:c.sequence_status,result:c.last_call_result,at:c.last_call_at,callback:c.callback_at||c.next_call_at,do_not_call:c.do_not_call,summary:c.call_summary})),recent_communications:s.comms.filter(c=>c.lead_id===l.id).sort((a,b)=>Date.parse(b.occurred_at)-Date.parse(a.occurred_at)).slice(0,5).map(c=>({channel:c.channel,direction:c.direction,status:c.status,at:c.occurred_at,summary:c.summary}))})),limitations:['Saved workbook completion and private document contents are not included.','No action is executed by a report.','Missing records mean unknown, not proof a call did not occur.']};
   let answer=`You have ${s.counts.active_clients} active clients. ${s.counts.credit_preparation_needs} have credit preparation needs based on intake or department records. ${s.counts.no_recorded_outbound_call} have no recorded outbound call evidence, and ${s.counts.overdue_callbacks} have overdue callbacks.`;
   const q=question.toLowerCase();
   const matching=facts.clients.filter((c:any)=>{const name=String(c.name||'').toLowerCase().trim();return name.length>2&&q.includes(name);});
   if(matching.length){answer=matching.map((c:any)=>`${c.name}: ${c.credit_preparation_need?'Credit preparation need indicated.':'No credit preparation need indicated by intake / department fields.'} ${c.account_claimed?'PrepHub account claimed.':'PrepHub sign-in not recorded.'} ${c.next_action?'Saved next action: '+c.next_action+'.':''}\nRecorded calls: ${c.calls.length?c.calls.map((x:any)=>`${x.direction}: ${x.status}; result ${x.result||'not recorded'}; time ${x.at||'not recorded'}${x.callback?'; callback '+x.callback:''}${x.summary?'; '+x.summary:''}`).join(' | '):'None.'}\nRecent contacts: ${c.recent_communications.length?c.recent_communications.map((x:any)=>`${x.channel} ${x.direction}: ${x.status} (${x.at})`).join(' | '):'None.'}`).join('\n\n');}
   else if(/credit|repair|fico/.test(q)){const list=facts.clients.filter((c:any)=>c.credit_preparation_need);answer=`${s.counts.credit_preparation_needs} active clients have credit preparation needs based on intake or department records. This is not a count of confirmed credit repair purchases.\n${list.map((c:any)=>c.name).join(', ')}.`;}
   else if(/not.*call|haven.t.*call|no.*call|missing.*call|who.*call/.test(q)){const list=s.active.filter(l=>s.missingCallIds.includes(l.id));answer=`${s.counts.no_recorded_outbound_call} active clients have no recorded outbound call evidence. Queued or Calling without an attempt does not count. Verify provider history before retrying.\n${list.map(l=>`${l.first_name} ${l.last_name}`).join(', ')}.`;}
   else if(/send|call everyone|call everybody|start.*campaign/.test(q)){answer='To start outreach, open Call & email scripts, review and approve the saved scripts, then open Follow-up queue and start the phone/email flow. This report has not sent messages or placed calls.';}
   else if(/priority|follow.?up|report|overview|going on|status/.test(q)){answer+=` First, reconcile missing call outcomes, then review overdue callbacks and confirmed requests for help. Open Follow-up queue to see the exact scheduled actions. Calls require verified permission; replies, interest and callback requests hold generic follow-up for review.`;}
   else answer+=' I can report credit preparation needs, missing call evidence, follow-up priorities, or a client by full name. Saved workbook completion and private document contents are not included.';
   return json({ok:true,answer,counts:s.counts,as_of:facts.as_of,mode:'live_crm'});
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
