import {preparationQueue} from './preparation-workflow.ts';
import {prepareAction,priorConversations} from './crm-actions.ts';
import {personalizeScript,scriptText,preparationContext} from './call-scripts.ts';
import {executeCurrentCall} from './direct-dispatch.ts';
const check=(r:any)=>{if(r.error)throw Error(r.error.message||'Could not load the selected lead');return r.data;};
const uuid=(v:any)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const stageScriptTitles={preparation:'Engaged / Preparation — Progress Check',dpa:'DPA Ready — Handoff Follow-up'};
export function leadCallStage(lead:any,op:any,task:any){const manual=op?.department_status?.prep_fields?.workflow_stage;if(['new','preparation','dpa'].includes(manual))return manual;return ['DPA Transfers','DPA Transfer Leads'].includes(op?.department_status?.prep_fields?.prep_group)?'dpa':lead.claimed_at||task?.preparation_plan?.steps?.some((s:any)=>s.id==='access'&&s.status==='recorded')?'preparation':'new';}
export async function startLeadCall(client:any,member:any,body:any,deps={queue:preparationQueue,prepare:prepareAction,execute:executeCurrentCall,context:preparationContext,history:priorConversations}){
 if(member.role!=='owner')throw Error('Owner access required');
 if(!uuid(body.lead_id)||!uuid(body.request_id))throw Error('A saved lead and unique call request are required');
 if(!['new','preparation','dpa'].includes(body.expected_stage))throw Error('Choose a workflow stage to call from');
 const previous=check(await client.from('daisy_crm_actions').select('*').eq('id',body.request_id).eq('created_by',member.user_id).maybeSingle());
 if(previous){if(previous.lead_id!==body.lead_id||previous.kind!=='call')throw Error('This request belongs to a different action');return {ok:true,action:previous,duplicate:true,call_started:!!previous.provider_id,answer:previous.provider_id?'This call was already started.':'This request is already recorded. Check call history before starting another call.'};}
 const lead=check(await client.from('prephub_leads').select('*').eq('id',body.lead_id).single());
 if(!lead)throw Error('The selected lead is no longer available');
 const op=check(await client.from('lead_operations').select('*').eq('lead_id',lead.id).maybeSingle());
 if(op?.archived_at||op?.deleted_at)throw Error('This lead is archived or deleted');
 const stage=leadCallStage(lead,op,null);
 let scripts=client.from('daisy_call_scripts').select('*').eq('direction','outbound').is('deleted_at',null).is('archived_at',null);
 scripts=scripts.eq('script_number',stage==='new'?40:stage==='preparation'?60:61);
 const matches=check(await scripts);if(matches.length!==1)throw Error('Choose one active saved script for this workflow stage in Scripts.');
 const script=matches[0],question='Call '+lead.lead_id+' using script '+script.script_number+' from the '+stage+' workflow row.';
 let prepared;
 try{prepared=await deps.prepare(client,member,{kind:'call',lead_id:lead.lead_id,reason:'Individual '+stage+' workflow call',content:personalizeScript({...script.content,script_text:scriptText(script.content)},lead),saved_script:script,script_category:script.category},{requestId:body.request_id,question,conversationMode:stage==='new'?null:'follow_up'});}
 catch(e){const concurrent=check(await client.from('daisy_crm_actions').select('*').eq('id',body.request_id).eq('created_by',member.user_id).maybeSingle());if(!concurrent)throw e;return {ok:true,action:concurrent,duplicate:true,call_started:!!concurrent.provider_id,answer:'This call request is already being processed.'};}
 let action=prepared.action;
 if(stage!=='new'){
  const context=await deps.context(client,lead);context.prior_conversations=await deps.history(client,lead.id);
  action=check(await client.from('daisy_crm_actions').update({payload:{...action.payload,call_mode:'saved_script_phone',conversation_mode:'follow_up',preparation_context:context,workflow_stage:stage}}).eq('id',action.id).eq('status','draft').select('*').single());
 }
 const result=await deps.execute(client,member,action,question);
 return {...result,stage,script_number:script.script_number,call_started:!!result.action?.provider_id};
}

const worklistTitles:Record<string,string>={login:'New / Not Engaged',credit:'Credit',income:'DTI & Income',taxes:'Taxes',work:'Work History'};
// Start one owner-selected worklist call. No batch drafts, generated script, or
// client-side preview/finalize round trip; the next lead is sent only after it ends.
export async function startWorklistCall(client:any,member:any,body:any,deps={prepare:prepareAction,execute:executeCurrentCall}){
 if(member.role!=='owner')throw Error('Owner access required');
 if(!uuid(body.lead_id)||!uuid(body.request_id)||!uuid(body.script_id)||!worklistTitles[body.worklist])throw Error('Choose one saved lead, worklist, saved script and unique request');
 const previous=check(await client.from('daisy_crm_actions').select('*').eq('id',body.request_id).eq('created_by',member.user_id).maybeSingle());
 if(previous){if(previous.lead_id!==body.lead_id||previous.kind!=='call'||previous.payload?.worklist_key!==body.worklist||previous.payload?.script_id!==body.script_id)throw Error('This request belongs to another worklist call');return {ok:true,action:previous,duplicate:true,call_started:!!previous.provider_id,answer:'This call request is already recorded. Check its outcome before retrying.'};}
 const [lead,op,task,settings,pref,callbacks,script]=await Promise.all([
  client.from('prephub_leads').select('*').eq('id',body.lead_id).single(),
  client.from('lead_operations').select('*').eq('lead_id',body.lead_id).maybeSingle(),
  client.from('prephub_followup_jobs').select('*').eq('lead_id',body.lead_id).eq('task_kind','preparation').maybeSingle(),
  client.from('prephub_followup_settings').select('workflow_mode,workflow_paused').eq('id',true).single(),
  client.from('prephub_contact_preferences').select('*').eq('lead_id',body.lead_id).maybeSingle(),
  client.from('prephub_followup_jobs').select('status,due_at').eq('lead_id',body.lead_id).eq('task_kind','callback'),
  client.from('daisy_call_scripts').select('*').eq('id',body.script_id).eq('direction','outbound').is('archived_at',null).is('deleted_at',null).single()
 ].map(async q=>check(await q)));
 if(!settings||settings.workflow_paused||settings.workflow_mode!=='owner_approved')throw Error('The call worklist is paused or not enabled');
 if(!lead||op?.archived_at||op?.deleted_at)return {ok:true,skipped:true,reason:'Lead is archived or no longer available'};
 const stage=leadCallStage(lead,op,task);if(stage==='dpa'||body.worklist==='login'&&stage!=='new'||body.worklist!=='login'&&stage!=='preparation')return {ok:true,skipped:true,reason:'Lead moved out of this worklist'};
 const held=pref?.call_paused?'Calls paused':task?.admin_paused||task?.status==='paused'?'Task paused':task&&task.task_owner!=='Daisy'?'Assigned to administrator':['working','submitted'].includes(task?.status)?'Call already in progress':callbacks.some((j:any)=>!['completed','canceled','skipped'].includes(j.status)&&Date.parse(j.due_at)>Date.now())?'Client has a future scheduled callback':task?.due_at&&Date.parse(task.due_at)>Date.now()?'Not due yet':null;
 if(held)return {ok:true,skipped:true,reason:held};
 if(!script)throw Error('The selected saved script is no longer available');
 const title=worklistTitles[body.worklist],question='Start '+title+' worklist: call '+lead.lead_id+' now using saved script '+script.script_number+'.';
 let prepared;try{prepared=await deps.prepare(client,member,{kind:'call',lead_id:lead.lead_id,reason:title+' worklist',content:personalizeScript({...script.content,script_text:scriptText(script.content)},lead),saved_script:script,script_category:script.category},{requestId:body.request_id,question});}catch(e){const concurrent=check(await client.from('daisy_crm_actions').select('*').eq('id',body.request_id).eq('created_by',member.user_id).maybeSingle());if(!concurrent)throw e;return {ok:true,duplicate:true,action:concurrent,call_started:!!concurrent.provider_id,answer:'This call request is already being processed.'};}
 const action=check(await client.from('daisy_crm_actions').update({payload:{...prepared.action.payload,worklist_key:body.worklist}}).eq('id',prepared.action.id).eq('created_by',member.user_id).eq('status','draft').select('*').single());
 const result=await deps.execute(client,member,action,question);
 if(!result.action?.provider_id&&result.action?.status==='draft'&&result.answer?.startsWith('Call not placed:')){check(await client.from('daisy_crm_actions').update({status:'cancelled'}).eq('id',action.id).eq('status','draft'));return {ok:true,skipped:true,reason:result.answer.slice('Call not placed: '.length)};}
 return {...result,script_number:script.script_number,call_started:!!result.action?.provider_id};
}
