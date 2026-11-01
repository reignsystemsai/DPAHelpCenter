import {businessClean,datasetNames,queryCRM,fieldCatalog} from './crm-query.ts';
import {savedProgress} from './daisy-report.ts';
import {creditNeed,callEvidence} from './prephub-flow.ts';
import {scriptText} from './call-scripts.ts';
const tables:Record<string,string>={clients:'prephub_leads',intake_assessments:'prephub_leads',archived_clients:'prephub_leads',deleted_clients:'prephub_leads',operations:'lead_operations',helux_cases:'helux_cases',communications:'lead_communications',notes:'lead_notes',partners:'manager_members',webinars:'webinars',webinar_registrations:'webinar_registrations',contact_preferences:'prephub_contact_preferences',followup_jobs:'prephub_followup_jobs',followup_scripts:'prephub_outreach_scripts',followup_settings:'prephub_followup_settings',saved_progress:'prephub_credit_workbooks',visitor_presence:'site_daily_visitors',daisy_actions:'daisy_crm_actions',call_script_library:'daisy_call_scripts',preparation_tasks:'prephub_followup_jobs'};
export const onDemandCatalog=Object.fromEntries(datasetNames.map(name=>[name,{loaded:false,meaning:name==='clients'?'Current active clients; id is public DPA ID, record_uuid joins lead_id in other datasets. Includes household_income, credit_score, tax_return_history, employment_history, readiness_percent, credit_complete, income_complete, employment_complete, documents_complete, name, contact fields. Annual income is self-reported. Unknown progress remains null.':name==='intake_assessments'?'Historical intake snapshots; never substitute for current client fields.':name==='call_script_library'?'Saved scripts, script_number, version, title, category, direction, content, spoken_script, archived_at, deleted_at.':name==='daisy_actions'?'Actions with status, recipient, exact payload.content, results, transcript and provider status. Drafts have not executed.':'Saved '+name.replaceAll('_',' ')+' records. Query fields including id, lead_id, client_name and actual business fields. Unknown fields return an error; do not guess values.'}]));
// Page through the selected dataset only. Push exact client scope into SQL before
// loading related evidence; never feed an entire CRM snapshot to the model.
async function read(client:any,table:string,ids?:string[],key='lead_id',filters:any[]=[],columns='*'){
 if(ids&&ids.length===0)return [];
 const out:any[]=[];
 for(let start=0;;start+=1000){let q=client.from(table).select(columns);if(ids)q=q.in(key,ids);
  for(const f of filters){if(['eq','gt','gte','lt','lte'].includes(f.operator)&&/^[a-z_]+$/.test(f.field)&&!['name','record_uuid'].includes(f.field)){if(f.value===null){if(f.operator==='eq')q=q.is(f.field,null);else if(f.operator==='ne')q=q.not(f.field,'is',null);}else if(f.operator==='eq'&&typeof f.value==='string'&&!/^(?:id|.*_id)$/.test(f.field))q=q.ilike(f.field,f.value.replace(/[\\%_]/g,'\\$&'));else q=q[f.operator](f.field,f.value);}}
  const r=await q.range(start,start+999);if(r.error)throw Error(r.error.message||'CRM read failed');out.push(...r.data);if(r.data.length<1000)return out;if(start>=99000)throw Error('Dataset too large; narrow the request');
 }
}
async function people(client:any,filters:any[]){
 const safe=filters.filter(f=>['id','name','record_uuid','first_name','last_name','email','phone'].includes(f.field));
 let q=client.from('prephub_leads').select('*');
 for(const f of safe){if(f.field==='id'&&f.operator==='eq')q=q.eq('lead_id',f.value);else if(f.field==='record_uuid'&&f.operator==='eq')q=q.eq('id',f.value);else if(['name','first_name','last_name','email','phone'].includes(f.field)&&['eq','contains'].includes(f.operator)){
 const value=String(f.value??'');if(!/^[\p{L}\p{N}@ .+'_-]+$/u.test(value))continue;
 if(f.field==='name'){const words=value.trim().split(/\s+/);if(words.length>1)q=q.ilike('first_name','%'+words[0]+'%').ilike('last_name','%'+words.at(-1)+'%');else q=q.or('first_name.ilike.%'+value+'%,last_name.ilike.%'+value+'%');}else q=q.ilike(f.field,f.operator==='eq'?value:'%'+value+'%');}}
 const out:any[]=[];for(let start=0;;start+=1000){const r=await q.range(start,start+999);if(r.error)throw Error(r.error.message||'Client lookup failed');out.push(...r.data);if(r.data.length<1000)return out;if(start>=99000)throw Error('Client query too large');}
}
export async function queryCRMOnDemand(client:any,args:any){
 if(!datasetNames.includes(args?.dataset)||!Array.isArray(args.filters))throw Error('Invalid CRM dataset');
 const dataset=args.dataset,clientDataset=['clients','intake_assessments','archived_clients','deleted_clients'].includes(dataset);
 const nameFilters=args.filters.filter((f:any)=>f.field==='client_name'&&['eq','contains'].includes(f.operator));
 let leads:any[]=[];let data:any[]=[];
 if(clientDataset||nameFilters.length)leads=await people(client,clientDataset?args.filters:nameFilters.map((f:any)=>({...f,field:'name'})));
 const clientIds=leads.map(l=>l.id);
 if(clientDataset){
  const needsEngagement=args.include_records||[...args.filters.map((f:any)=>f.field),args.group_by,args.sort_by,...(args.numeric_fields||[])].some((f:any)=>/calls|communications|interest|callback/.test(String(f)));
  const [ops,books,prefs,calls,comms]=await Promise.all([read(client,'lead_operations',clientIds),dataset==='clients'?read(client,'prephub_credit_workbooks',clientIds,'lead_id',[],'lead_id,updated_at,readiness:content->credit_inputs->prepHubReadiness'):[],dataset==='clients'&&needsEngagement?read(client,'prephub_contact_preferences',clientIds):[],dataset==='clients'&&needsEngagement?read(client,'helux_cases',clientIds):[],dataset==='clients'&&needsEngagement?read(client,'lead_communications',clientIds):[]]);
  data=leads.filter(l=>{const op=ops.find(o=>o.lead_id===l.id);return dataset==='archived_clients'?!!op?.archived_at&&!op?.deleted_at:dataset==='deleted_clients'?!!op?.deleted_at:dataset==='intake_assessments'||!op?.archived_at&&!op?.deleted_at;}).map(l=>{const name=l.first_name+' '+l.last_name,op=ops.find(o=>o.lead_id===l.id),workbook=books.find(w=>w.lead_id===l.id),progress=savedProgress(workbook?.readiness),pref=prefs.find(p=>p.lead_id===l.id),score=progress?.total??Number(l.current_readiness_score);if(dataset==='intake_assessments')return businessClean({lead_id:l.id,client_name:name,historical_assessment:l.assessment,client_active:!op?.archived_at&&!op?.deleted_at});const {assessment,...canonical}=l;
   return businessClean({...canonical,id:l.lead_id,record_uuid:l.id,name,readiness_percent:[0,25,50,75,100].includes(score)?score:null,readiness_source:progress?'Saved PrepHub snapshot':'Stored CRM score; may reflect intake only',section_progress:progress?.sections||null,section_assessed:progress?.assessed||null,progress_recorded_at:progress?.recorded_at||null,last_saved_workbook_at:workbook?.updated_at||null,intake_readiness_percent:l.initial_readiness_score,credit_preparation_need:creditNeed(l,op),account_claimed_at:l.claimed_at||null,confirmed_interest_at:pref?.interested_at||null,callback_requested_at:pref?.callback_requested_at||null,next_action:op?.next_action||null,...Object.fromEntries(['credit','income','employment','documents'].map(k=>[k+'_complete',progress?.assessed?.[k]?progress.sections[k]===25:null])),...Object.fromEntries(['credit','tax','review','dpa'].map(d=>['department_'+d,d==='dpa'?Number(l.initial_readiness_score)===100:d==='credit'?Number(l.credit_score)<640:d==='tax'?l.tax_return_history!=='filed_2_years':Number(l.household_income)<70000||!['employed_2_years','switched_jobs_2_years','switched_jobs_continuous_2_years','recent_college_graduate'].includes(l.employment_history)])),calls:calls.filter(c=>c.lead_id===l.id&&!c.metadata?.deleted_at&&!c.metadata?.archived_at).map(c=>({direction:c.direction,attempt_evidence:callEvidence(c),status:c.sequence_status,result:c.last_call_result,at:c.last_call_at,callback:c.callback_at||c.next_call_at,do_not_call:c.do_not_call,summary:c.call_summary})),recent_communications:comms.filter(c=>c.lead_id===l.id).sort((a,b)=>Date.parse(b.occurred_at)-Date.parse(a.occurred_at)).slice(0,8)});
  });
 }else{
  const filters=args.filters.filter((f:any)=>!['client_name','spoken_script'].includes(f.field));
  data=await read(client,tables[dataset],nameFilters.length?clientIds:undefined,'lead_id',filters,dataset==='saved_progress'?'lead_id,updated_at,readiness:content->credit_inputs->prepHubReadiness':'*');
  if(dataset==='preparation_tasks')data=data.filter(r=>r.task_kind==='preparation');
  if(dataset==='helux_cases')data=data.filter(r=>!r.metadata?.archived_at&&!r.metadata?.deleted_at);
  if(data.some(r=>r.lead_id)&&!leads.length)leads=await read(client,'prephub_leads',[...new Set(data.map(r=>r.lead_id).filter(Boolean))],'id',[],'id,first_name,last_name');
  data=data.map(r=>businessClean({...r,...(r.lead_id?{client_name:leads.find(l=>l.id===r.lead_id)?leads.find(l=>l.id===r.lead_id).first_name+' '+leads.find(l=>l.id===r.lead_id).last_name:null}:{}),...(dataset==='call_script_library'?{spoken_script:scriptText(r.content)}:{})}));
 }
 let result;try{result=queryCRM({[dataset]:data},args);}catch(e){throw Error((e instanceof Error?e.message:'Invalid query')+'. Available fields: '+JSON.stringify(fieldCatalog(data)));}return {...result,available_fields:fieldCatalog(data),scope:result.scope+' Only the requested dataset and relevant client evidence were loaded; total_dataset_records describes this query scope.'};
}
