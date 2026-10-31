import {relativeDelay,callbackZone} from './callback-relative.ts';
import {dailyWorkState,workflowEvent} from './preparation-workflow.ts';
import {prepareScriptSequence,preparationContext} from './call-scripts.ts';
import {executeAction,validatedContent} from './crm-actions.ts';
const check=(r:any)=>{if(r.error)throw Error(r.error.message||'Callback storage unavailable');return r.data;};
export function callbackSlot(value:string,zone:string,now=Date.now(),relative=false){
 if(!/(Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))throw Error('Exact date, time and timezone required');
 const at=Date.parse(value);if(at<now+60000||at>now+366*86400000)throw Error('Choose a callback at least one minute in the future and within one year');
 try{new Intl.DateTimeFormat('en-US',{timeZone:zone}).format(at);}catch{throw Error('Valid named timezone required');}
 const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(at));const minute=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',minute:'numeric'}).format(at));if(!relative&&(hour<9||hour>18||hour===18&&minute>0))throw Error('Callback calling hours are 9 AM to 6 PM Eastern; choose a time within those hours');
 return {due_at:new Date(at).toISOString(),timezone:zone};
}
export async function scheduleClientCallback(client:any,body:any){
 const relative=body.relative_seconds?relativeDelay(body.request_quote):null;
 if(body.relative_seconds&&(!relative||relative.seconds!==body.relative_seconds||callbackZone(body.confirmation_quote)!==body.timezone||Math.abs(Date.parse(body.callback_at)-Date.now()-relative.seconds*1000)>30000))throw Error('Relative callback needs the client’s actual interval and time-zone response');
 const selected=body.client_selected_time===true&&!!confirmedCallback(body,body.transcript);
 const slot=callbackSlot(String(body.callback_at||''),String(body.timezone||''),Date.now(),!!relative||selected);
 const transcript=Array.isArray(body.transcript)?body.transcript:[],clientWords=transcript.filter((t:any)=>t.role==='client').map((t:any)=>String(t.text||''));
 if(!String(body.request_quote||'').trim()||!clientWords.some((t:string)=>t.includes(body.request_quote))||clientWords.at(-1)!==body.confirmation_quote||!(relative||callbackConfirmation(body.confirmation_quote)))throw Error('Actual callback request and latest client confirmation required');
 const source=check(await client.from('daisy_crm_actions').select('*').eq('id',body.action_id).eq('kind','call').single());
 if(!['executing','submitted'].includes(source.status)||!Number.isFinite(Date.parse(source.executed_at||source.created_at))||Date.now()-Date.parse(source.executed_at||source.created_at)>30*60000)throw Error('Active approved source call required');
 const settings=check(await client.from('prephub_followup_settings').select('callbacks_enabled').eq('id',true).single());if(!settings.callbacks_enabled)throw Error('Callback scheduling is not enabled');
 const [op,pref]=await Promise.all([client.from('lead_operations').select('archived_at,deleted_at').eq('lead_id',source.lead_id).maybeSingle(),client.from('prephub_contact_preferences').select('call_paused').eq('lead_id',source.lead_id).maybeSingle()]);if(check(op)?.archived_at||op.data?.deleted_at||check(pref)?.call_paused)throw Error('Client calling is paused or inactive');
 const step='client_callback:'+source.id;
 const previous=check(await client.from('prephub_followup_jobs').select('id,due_at,status').eq('lead_id',source.lead_id).eq('step_key',step).maybeSingle());if(previous){if(Date.parse(previous.due_at)!==Date.parse(slot.due_at))throw Error('Callback already saved for a different time; reschedule it in the CRM');return {ok:true,scheduled:true,duplicate:true,callback:previous};}
 const evidence={source:'client_confirmed_callback',source_action_id:source.id,requested_by:source.created_by,request_quote:body.request_quote,confirmation_quote:body.confirmation_quote,timezone:slot.timezone,...(relative?{relative_seconds:relative.seconds}:{}),...(selected?{client_selected_time:true}:{}),scheduled_at:new Date().toISOString()};
 const saved=check(await client.from('prephub_followup_jobs').upsert({lead_id:source.lead_id,step_key:step,channel:'call',task_kind:'callback',task_owner:'Daisy',task_title:'Scheduled PrepHub callback',due_at:slot.due_at,status:'pending',reason:'Client-confirmed callback; waiting for due time and daily work authorization',evidence},{onConflict:'lead_id,step_key',ignoreDuplicates:true}).select('id,due_at,status'));
 const job=saved[0]||check(await client.from('prephub_followup_jobs').select('id,due_at,status').eq('lead_id',source.lead_id).eq('step_key',step).single());
 check(await client.from('prephub_followup_jobs').update({status:'canceled',reason:'Superseded by newly confirmed callback',updated_at:new Date().toISOString()}).eq('lead_id',source.lead_id).eq('task_kind','callback').eq('status','pending').neq('id',job.id));
 await workflowEvent(client,source.lead_id,'callback-scheduled:'+source.id,'call_outcome',{status:'pending',stage:'Connected',task_title:'Daisy: scheduled PrepHub callback',due_at:slot.due_at,reason:'Client confirmed callback time',evidence:{...evidence,outcome:'callback',callback_job_id:job.id,summary:'Daisy callback scheduled for '+slot.due_at,client_quote:body.request_quote,identity_confirmed:true}});
 return {ok:true,scheduled:true,callback:job};
}
export function confirmedCallback(args:any,transcript:any[]){
 const turns=(transcript||[]).filter((t:any)=>['client','daisy'].includes(t.role)&&String(t.text||'').trim()),last=turns.at(-1),readback=turns.at(-2);
 if(last?.role!=='client'||!callbackConfirmation(last.text)||readback?.role!=='daisy'||/\bor\b/i.test(readback.text))return null;
 const at=Date.parse(args.callback_at);if(!Number.isFinite(at)||callbackZone(readback.text)!==args.timezone)return null;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:args.timezone,month:'long',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).formatToParts(at).map((p:any)=>[p.type,p.value]));
 const words=String(readback.text).toLowerCase().replace(/[^a-z0-9: ]/g,' ').replace(/\s+/g,' ');
 const date=new RegExp('\\b'+parts.month.toLowerCase()+' '+parts.day+'(?:st|nd|rd|th)?\\b');
 const clock=new RegExp('\\b'+parts.hour+(parts.minute==='00'?'(?::00)?':':'+parts.minute)+'\\s*'+parts.dayPeriod.toLowerCase()+'\\b');
 return date.test(words)&&clock.test(words)?last.text:null;
}
export function callbackConfirmation(value:any){const s=String(value||'').trim().replace(/^(?:uh[ -]*huh|mhm|mm[ -]*hmm)\b/i,'Yes').replace(/^(?:oh|um|uh)[, ]+/i,'');return /^(?:yes|yeah|yep|yup|sure|okay|ok|correct|absolutely|that (?:works|is fine|sounds good)|sounds good|perfect|please do|go ahead)\b/i.test(s)&&!/\b(?:not|don.t|do not|no|wait|but|instead|actually)\b/i.test(s);}
export async function runDueCallbacks(client:any,settings:any,now=Date.now(),callbackId?:string){
 if(!settings.callbacks_enabled)return {callbacks_enabled:false,processed:[]};
 if(!dailyWorkState(settings,now).authorized)return {callbacks_enabled:true,waiting_for_daily_instructions:true,processed:[]};
 const stale=await client.from('prephub_followup_jobs').update({status:'needs_review',reason:'Callback dispatch uncertain; reconcile provider before any retry'}).eq('task_kind','callback').eq('status','working').lt('updated_at',new Date(now-10*60000).toISOString());check(stale);
 let query=client.from('prephub_followup_jobs').select('*').eq('task_kind','callback').eq('status','pending').lte('due_at',new Date(now).toISOString());if(callbackId)query=query.eq('id',callbackId);
 const due=check(await query.order('due_at').limit(3)),processed=[];
 for(const job of due){
  if(now-Date.parse(job.due_at)>15*60000){check(await client.from('prephub_followup_jobs').update({status:'needs_review',reason:'Requested callback time was missed; reschedule before dialing'}).eq('id',job.id).eq('status','pending'));processed.push({id:job.id,status:'needs_review'});continue;}
  const fresh=check(await client.from('prephub_followup_settings').select('*').eq('id',true).single());if(!fresh.callbacks_enabled||!dailyWorkState(fresh).authorized)break;
  const claimed=check(await client.from('prephub_followup_jobs').update({status:'working',updated_at:new Date(now).toISOString(),attempts:job.attempts+1}).eq('id',job.id).eq('status','pending').select('id'));if(!claimed.length)continue;
  try{
   const [person,task,owner]=await Promise.all([client.from('prephub_leads').select('*').eq('id',job.lead_id).single(),client.from('prephub_followup_jobs').select('admin_paused,task_owner').eq('lead_id',job.lead_id).eq('task_kind','preparation').maybeSingle(),client.from('manager_members').select('user_id,role,active').eq('user_id',job.evidence.requested_by).eq('active',true).single()]);const lead=check(person),preparation=check(task),member=check(owner);
   if(member.role!=='owner'||preparation?.admin_paused||preparation&&preparation.task_owner!=='Daisy')throw Error('Callback requires owner review; task paused or reassigned');
   const active=check(await client.from('daisy_crm_actions').select('id').eq('lead_id',lead.id).eq('kind','call').in('status',['executing','submitted']));if(active.length){check(await client.from('prephub_followup_jobs').update({status:'pending',reason:'Waiting for active call to finish'}).eq('id',job.id));continue;}
   const script=check(await client.from('daisy_call_scripts').select('*').eq('script_number',40).eq('direction','outbound').is('archived_at',null).is('deleted_at',null).single());
   const sequence=await prepareScriptSequence(client,script,lead),context=await preparationContext(client,lead),stamp=new Date().toISOString(),actionId=crypto.randomUUID();
   const action=check(await client.from('daisy_crm_actions').insert({id:actionId,created_by:member.user_id,lead_id:lead.id,kind:'call',status:'draft',reason:'Client-confirmed scheduled callback',payload:{content:validatedContent('call',sequence.content),script_id:sequence.sources[0].id,script_version:sequence.sources[0].version,script_sources:sequence.sources,preparation_areas:sequence.areas,preparation_sections:sequence.sections||[],preparation_context:{...context,scheduled_callback:{due_at:job.due_at,request_quote:job.evidence.request_quote}},lead_updated_at:lead.updated_at,finalized_at:stamp,...((job.evidence.relative_seconds||job.evidence.client_selected_time)?{owner_override:{authorized_by:member.user_id,authorized_at:stamp,source:'client_confirmed_callback_time',reason:job.evidence.request_quote,rules:['contact_hours']}}:{}),client_callback_job_id:job.id,recipient:{public_id:lead.lead_id,name:lead.first_name+' '+lead.last_name,phone:lead.phone,email:lead.email}},before_value:{value:null}}).select('*').single());
   check(await client.from('prephub_followup_jobs').update({review_action_id:action.id}).eq('id',job.id).eq('status','working'));
   const result=await executeAction(client,member,action.id);if(!result.ok)throw Error(result.error||'Callback blocked by current contact controls');
   check(await client.from('prephub_followup_jobs').update({status:'submitted',provider_id:result.action.provider_id,reason:'Callback submitted; conversation outcome pending',updated_at:stamp}).eq('id',job.id).eq('status','working'));processed.push({id:job.id,status:'submitted'});
  }catch(e){check(await client.from('prephub_followup_jobs').update({status:'needs_review',reason:e instanceof Error?e.message:'Callback dispatch unconfirmed',updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','working'));processed.push({id:job.id,status:'needs_review'});}
 }
 return {callbacks_enabled:true,processed};
}
