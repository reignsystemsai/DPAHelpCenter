const plans:Record<string,string>={self:'Instant Prep Plan',review:'Agent Review + Plan',full:'First-Time Homebuyer Credit Pathway',sweep:'Credit Sweep + Tradeline Assessment'};
export function creditInterestNote(action:any,result:any,verifiedPlan?:any){
 const request=result.credit_support_request,turns=result.transcript||[],quote=String(request?.client_quote||'').trim();
 if(!action.lead_id||request?.requested!==true||!quote||quote.length>1200||request.plan_key&&!plans[request.plan_key])return null;
 const index=turns.findLastIndex((t:any)=>t.role==='client'&&t.text===quote),prompt=turns[index-1];if(index<0)return null;
 const saved=request.source==='saved_plan_request'&&verifiedPlan?.plan_key===request.plan_key&&verifiedPlan?.status==='follow_up_needed';
 if(request.source==='saved_plan_request'&&!saved)return null;
 if(!saved){
  if(index<1||prompt?.role!=='daisy'||!/(?:team.{0,80}(?:follow up|follow-up)|(?:follow up|follow-up).{0,80}team)/i.test(prompt.text)||!/(?:credit|plans)/i.test(prompt.text))return null;
  if(/\b(?:not interested|no thanks|don.t|do not|nope|maybe|not sure)\b/i.test(quote)||/^no\b/i.test(quote))return null;
  if(!/^(?:yes|yeah|yep|yup|sure|okay|ok|please|absolutely|that (?:was|is) a?\s*yes)\b|\b(?:interested|contact me|reach out|have.{0,15}team|want.{0,20}(?:plan|review|pathway|assessment)|like.{0,15}help)\b/i.test(quote))return null;
 }
 const window=String(request.window_quote||''),windowVerified=window&&turns.some((t:any)=>t.role==='client'&&t.text===window);
 const zoneQuote=String(request.timezone_quote||''),zoneVerified=zoneQuote&&turns.some((t:any)=>t.role==='client'&&t.text===zoneQuote);
 return {id:action.id,lead_id:action.lead_id,author_user_id:action.created_by,body:'Team follow-up requested: '+(plans[request.plan_key]||'PrepHub credit preparation plans (plan not selected)')+'. '+(saved?'Verified against the client’s saved PrepHub plan request. ':'')+'Client: “'+quote+'”'+(windowVerified?' Preferred contact window (not a booked appointment): “'+window+'”.':'')+(zoneVerified?' Timezone/location supplied: “'+zoneQuote+'”.':'')+' No enrollment or payment completed.'};
}
export async function syncCreditInterest(client:any,action:any,result:any){let verifiedPlan;if(result.credit_support_request?.source==='saved_plan_request'&&action.lead_id){const lead=await client.from('prephub_leads').select('credit_plan_request').eq('id',action.lead_id).maybeSingle();if(lead.error)throw lead.error;verifiedPlan=lead.data?.credit_plan_request;}const note=creditInterestNote(action,result,verifiedPlan);if(!note)return false;const saved=await client.from('lead_notes').upsert(note,{onConflict:'id'});if(saved.error)throw saved.error;return true;}
