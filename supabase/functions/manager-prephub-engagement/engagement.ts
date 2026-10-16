export function engagementFor(lead:any, data:any){
 const events:Array<{reason:string,at:string}>=[];
 const add=(reason:string,at:any)=>{if(at&&Number.isFinite(Date.parse(at)))events.push({reason,at});};
 if(lead.claimed_at)add('Signed in to PrepHub',lead.claimed_at);
 for(const c of data.communications||[])if(c.lead_id===lead.id){
  if(c.direction==='inbound')add('Client reply / inbound contact',c.occurred_at||c.created_at);
  else if(['answered','connected'].includes(String(c.status).toLowerCase()))add('Connected call',c.occurred_at||c.created_at);
 }
 for(const c of data.calls||[])if(c.lead_id===lead.id&&!c.metadata?.deleted_at&&!c.metadata?.archived_at){
  // Provider "completed" alone may mean voicemail; require a recorded human outcome.
  const result=String(c.last_call_result||'').toLowerCase().replace(/[\s-]+/g,'_');
  if(['answered','connected','interested','callback_requested','callback_scheduled','human_answered','conversation_completed'].includes(result))add('Answered Daisy / requested callback',c.last_call_at||c.updated_at);
 }
 for(const d of data.documents||[])if(d.lead_id===lead.id&&d.state==='saved')add('Document uploaded',d.saved_at||d.created_at);
 for(const d of data.reports||[])if(d.lead_id===lead.id)add('Credit report uploaded',d.created_at);
 for(const p of data.preferences||[])if(p.lead_id===lead.id){add('Requested a callback',p.callback_requested_at);add('Requested help',p.interested_at);add('Client reply',p.last_reply_at);}
 events.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 return {id:lead.id,engaged:events.length>0,reason:events[0]?.reason||'No client engagement recorded',at:events[0]?.at||null};
}
