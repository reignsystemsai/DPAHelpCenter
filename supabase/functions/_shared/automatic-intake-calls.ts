import {prepareAction,executeAction} from './crm-actions.ts';
import {personalizeScript,scriptText,finalizeCallDraft,preparationContext} from './call-scripts.ts';
import {intakeCheck as check,intakePhone,intakeRoute,intakeConsent,contactDay,retryDue} from './intake-call-policy.ts';
const JOBS='daisy_intake_call_jobs';
const stamp=()=>new Date().toISOString();
export async function enqueueIntakeCall(client:any,leadId:string,now=Date.now()){
 const lead=check(await client.from('prephub_leads').select('*').eq('id',leadId).single()),route=intakeRoute(lead.assessment||{});
 if(!route)return {status:'not_final'};
 const phone=intakePhone(lead.phone),consent=intakeConsent(lead.assessment.voice_consent,phone,lead.assessment.voice_consent?.received_at||new Date(now).toISOString());
 if(!consent.requested)return {status:'not_requested'};
 const cfg=check(await client.from('daisy_intake_call_settings').select('*').eq('id',true).single());
 if(!cfg.enabled||!cfg.authorized_by||!cfg.activated_at||Date.parse(consent.received_at)<Date.parse(cfg.activated_at))return {status:'disabled'};
 const owner=check(await client.from('manager_members').select('user_id,role,active').eq('user_id',cfg.authorized_by).eq('active',true).single());if(owner.role!=='owner')throw Error('Active automation owner required');
 const inserted=await client.from(JOBS).upsert({lead_id:lead.id,attempt:0,contact_day:contactDay(now),phone,...route,consent,authorized_by:owner.user_id,submitted_at:consent.received_at,due_at:new Date(now).toISOString(),reason:'Buyer requested an immediate Daisy call with final results'},{onConflict:'lead_id,attempt',ignoreDuplicates:true}).select('*');
 if(inserted.error&&inserted.error.code!=='23505')throw Error(inserted.error.message);
 const job=inserted.data?.[0]||check(await client.from(JOBS).select('*').eq('lead_id',lead.id).eq('attempt',0).maybeSingle())||check(await client.from(JOBS).select('*').eq('phone',phone).eq('contact_day',contactDay(now)).eq('attempt',0).maybeSingle());
 return {status:job?.status||'duplicate',job_id:job?.id||null};
}
export async function runIntakeCalls(client:any,jobId?:string,now=Date.now(),deps={prepare:prepareAction,finalize:finalizeCallDraft,execute:executeAction,context:preparationContext}){
 const cfg=check(await client.from('daisy_intake_call_settings').select('*').eq('id',true).single()),workflow=check(await client.from('prephub_followup_settings').select('workflow_paused').eq('id',true).single());
 if(!cfg.enabled||workflow.workflow_paused)return {ok:true,paused:true,processed:[]};
 check(await client.from(JOBS).update({status:'needs_review',reason:'Call dispatch was interrupted; reconcile before redialing',updated_at:stamp()}).eq('status','working').lt('updated_at',new Date(now-5*60000).toISOString()));
 let query=client.from(JOBS).select('*').eq('status','pending').lte('due_at',new Date(now).toISOString()).order('due_at').limit(5);if(jobId)query=query.eq('id',jobId);
 const due=check(await query),processed=[];
 for(const job of due){
  const owner=check(await client.from('manager_members').select('user_id,role,active').eq('user_id',job.authorized_by).eq('active',true).single());if(owner.role!=='owner'||cfg.authorized_by!==owner.user_id)throw Error('Automatic call authorization changed');
  const claimed=check(await client.from(JOBS).update({status:'working',action_id:job.id,updated_at:stamp()}).eq('id',job.id).eq('status','pending').select('id'));if(!claimed.length)continue;
  try{
   const lead=check(await client.from('prephub_leads').select('*').eq('id',job.lead_id).single()),op=check(await client.from('lead_operations').select('*').eq('lead_id',job.lead_id).maybeSingle()),pref=check(await client.from('prephub_contact_preferences').select('*').eq('lead_id',job.lead_id).maybeSingle());
   if(op?.archived_at||op?.deleted_at||pref?.call_paused||intakePhone(lead.phone)!==job.phone)throw Error('Lead or phone is changed, inactive, or paused');
   const phoneState=check(await client.rpc('daisy_phone_contact_state',{p_phone:job.phone}));if(phoneState?.blocked||phoneState?.inactive||phoneState?.active_call)throw Error('This phone number is paused, inactive or already on a call');
   if(job.attempt===1&&(pref?.callback_requested_at||pref?.interested_at||pref?.last_reply_at))throw Error('The client engaged or requested follow-up; continue their existing workflow');
   const existing=check(await client.from('daisy_crm_actions').select('id,status,provider_id').eq('id',job.id).maybeSingle());if(existing){check(await client.from(JOBS).update({status:existing.provider_id?'submitted':'needs_review',reason:'Existing action reconciled; no additional call placed',updated_at:stamp()}).eq('id',job.id));continue;}
   const other=check(await client.from('daisy_crm_actions').select('id').eq('lead_id',job.lead_id).eq('kind','call').in('status',['submitted','executing']));if(other.length)throw Error('Another call is already in progress');
   const callbacks=check(await client.from('prephub_followup_jobs').select('id').eq('lead_id',job.lead_id).eq('task_kind','callback').in('status',['pending','working','submitted']));if(callbacks.length)throw Error('A client callback is already scheduled');
   if(job.attempt===1){const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(now));if(hour<9||hour>=18){check(await client.from(JOBS).update({status:'pending',due_at:retryDue(now,0),updated_at:stamp()}).eq('id',job.id));continue;}}
   let stage=job.stage;const initialManual=op?.department_status?.prep_fields?.workflow_stage;if(['new','preparation','dpa'].includes(initialManual))stage=initialManual;if(job.attempt===1){const manual=op?.department_status?.prep_fields?.workflow_stage;stage=['new','preparation','dpa'].includes(manual)?manual:job.stage==='dpa'?'dpa':lead.claimed_at?'preparation':'new';}
   const number=stage==='dpa'?61:stage==='preparation'?60:40;
   if(job.attempt===0&&!op?.department_status?.prep_fields?.workflow_stage){const department_status={...op?.department_status,prep_fields:{...op?.department_status?.prep_fields,prep_group:stage==='dpa'?'DPA Transfers':stage==='preparation'?'Engaged Leads':'New Leads',workflow_stage:stage,prep_group_updated_at:stamp()}};let write=op?client.from('lead_operations').update({department_status}).eq('lead_id',lead.id).eq('updated_at',op.updated_at):client.from('lead_operations').insert({lead_id:lead.id,department_status});check(await write);}
   const script=check(await client.from('daisy_call_scripts').select('*').eq('script_number',number).eq('direction','outbound').is('deleted_at',null).is('archived_at',null).single());
   check(await client.from(JOBS).update({stage,script_number:number,updated_at:stamp()}).eq('id',job.id).eq('status','working'));
   const question='Standing authorization: '+(job.attempt?'one unanswered-call retry':'buyer-requested immediate results call')+' for '+lead.lead_id+' using script '+number;
   const prepared=await deps.prepare(client,owner,{kind:'call',lead_id:lead.lead_id,reason:question,content:personalizeScript({...script.content,script_text:scriptText(script.content)},lead),saved_script:script,script_category:script.category},{requestId:job.id,question,conversationMode:job.attempt?'follow_up':null});
   let action=prepared.action;const context=await deps.context(client,lead);
   action=check(await client.from('daisy_crm_actions').update({payload:{...action.payload,call_mode:number===40?'prephub_followup':'saved_script_phone',intake_call_job_id:job.id,preparation_context:context,disconnect_recovery_policy:1,owner_override:{authorized_by:owner.user_id,authorized_at:stamp(),source:'approved_intake_call_policy',reason:question,rules:['contact_hours','contact_spacing','weekly_frequency']}}}).eq('id',job.id).eq('status','draft').select('*').single());
   await deps.finalize(client,owner,job.id);const result=await deps.execute(client,owner,job.id,question);const accepted=result.action?.provider_id;
   check(await client.from(JOBS).update({status:accepted?'submitted':'needs_review',reason:accepted?'Call accepted by provider':result.error||'Call acceptance unconfirmed; review before redialing',updated_at:stamp()}).eq('id',job.id).eq('status','working'));processed.push({job_id:job.id,status:accepted?'submitted':'needs_review',script_number:number});
  }catch(error){check(await client.from(JOBS).update({status:'needs_review',reason:error instanceof Error?error.message:'Call could not be confirmed',updated_at:stamp()}).eq('id',job.id).eq('status','working'));processed.push({job_id:job.id,status:'needs_review'});}
 }
 return {ok:true,processed};
}
export async function recordIntakeCallResult(client:any,actionId:string,status:string,now=Date.now()){
 const action=check(await client.from('daisy_crm_actions').select('*').eq('id',actionId).single()),jobId=action.payload?.intake_call_job_id;if(!jobId||!['completed','no-answer','busy','failed','canceled'].includes(status))return {skipped:true};
 const job=check(await client.from(JOBS).select('*').eq('id',jobId).single());if(job.action_id!==action.id||job.lead_id!==action.lead_id)throw Error('Intake call result identity mismatch');
 check(await client.from(JOBS).update({status:'completed',reason:'Provider result: '+status,updated_at:stamp()}).eq('id',job.id));
 const result=action.result||{},noAnswer=['no-answer','busy'].includes(status)||result.outcome==='voicemail';
 if(!noAnswer||job.attempt!==0||result.stop_calls||result.callback_schedule?.scheduled)return {completed:true};
 const cfg=check(await client.from('daisy_intake_call_settings').select('*').eq('id',true).single());if(!cfg.enabled)return {completed:true};
 const inserted=await client.from(JOBS).upsert({lead_id:job.lead_id,attempt:1,contact_day:job.contact_day,phone:job.phone,script_number:job.script_number,stage:job.stage,consent:job.consent,authorized_by:job.authorized_by,submitted_at:job.submitted_at,due_at:retryDue(now,cfg.retry_minutes),reason:'One automatic retry after unanswered intake call'},{onConflict:'lead_id,attempt',ignoreDuplicates:true}).select('id,due_at');
 if(inserted.error&&inserted.error.code!=='23505')throw Error(inserted.error.message);return {retry_scheduled:!!inserted.data?.length,retry:inserted.data?.[0]||null};
}
