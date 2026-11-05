export function engagementFor(lead:any, data:any){
 const events:Array<{reason:string,at:string}>=[];
 const add=(reason:string,at:any)=>{if(at&&Number.isFinite(Date.parse(at)))events.push({reason,at});};
 if(lead.claimed_at)add('PrepHub account linked',lead.claimed_at);
 for(const c of data.communications||[])if(c.lead_id===lead.id){
  if(c.metadata?.client_response_recorded===true)add('Client spoke with Daisy',c.occurred_at||c.created_at);
  if(c.direction==='inbound')add('Client reply / inbound contact',c.occurred_at||c.created_at);
  else if(['answered','connected'].includes(String(c.status).toLowerCase()))add('Connected call',c.occurred_at||c.created_at);
 }
 for(const c of data.calls||[])if(c.lead_id===lead.id&&!c.metadata?.deleted_at&&!c.metadata?.archived_at){
  // Provider "completed" alone may mean voicemail; require a recorded human outcome.
  if(c.metadata?.client_response_recorded===true)add('Client spoke with Daisy',c.last_call_at||c.updated_at);
  const result=String(c.last_call_result||'').toLowerCase().replace(/[\s-]+/g,'_');
  if(['answered','connected','interested','callback_requested','callback_scheduled','human_answered','conversation_completed'].includes(result))add('Answered Daisy / requested callback',c.last_call_at||c.updated_at);
 }
 for(const d of data.documents||[])if(d.lead_id===lead.id&&d.state==='saved')add('Document uploaded',d.saved_at||d.created_at);
 for(const w of data.workbooks||[])if(w.lead_id===lead.id)add('Saved PrepHub progress',w.updated_at);
 for(const d of data.reports||[])if(d.lead_id===lead.id)add('Credit report uploaded',d.created_at);
 for(const p of data.preferences||[])if(p.lead_id===lead.id){add('Requested a callback',p.callback_requested_at);add('Requested help',p.interested_at);add('Client reply',p.last_reply_at);}
 events.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 return {id:lead.id,engaged:events.length>0,reason:events[0]?.reason||'No client engagement recorded',at:events[0]?.at||null};
}

export function engagementGroup(engagement:any,fields:any={}){
 if(['DPA Transfers','DPA Transfer Leads'].includes(fields.prep_group))return 'DPA Transfers';
 if(fields.prep_group==='New Leads'&&(Date.parse(engagement.at)||0)<=(Date.parse(fields.prep_group_updated_at)||0))return 'New Leads';
 return fields.prep_group==='Engaged Leads'||engagement.engaged?'Engaged Leads':'New Leads';
}
