const plans:Record<string,string>={self:'Instant Prep Plan',review:'Agent Review + Plan',full:'First-Time Homebuyer Credit Pathway',sweep:'Credit Sweep + Tradeline Assessment'};
export function creditInterestNote(action:any,result:any){
 const request=result.credit_support_request,turns=result.transcript||[],quote=String(request?.client_quote||'').trim();
 if(!action.lead_id||request?.requested!==true||!quote||quote.length>1200||request.plan_key&&!plans[request.plan_key])return null;
 const index=turns.findLastIndex((t:any)=>t.role==='client'&&t.text===quote),prompt=turns[index-1];
 if(index<1||prompt?.role!=='daisy'||!/(?:team.{0,80}(?:follow up|follow-up)|(?:follow up|follow-up).{0,80}team)/i.test(prompt.text)||!/(?:credit|plans)/i.test(prompt.text))return null;
 if(/\b(?:not interested|no thanks|don.t|do not|nope)\b/i.test(quote)||/^no\b/i.test(quote))return null;
 if(!/^(?:yes|yeah|yep|yup|sure|okay|ok|please|absolutely|that (?:was|is) a?\s*yes)\b|\b(?:interested|contact me|reach out|have.{0,15}team|want.{0,20}(?:plan|review|pathway|assessment)|like.{0,15}help)\b/i.test(quote))return null;
 return {id:action.id,lead_id:action.lead_id,author_user_id:action.created_by,body:'Team follow-up requested: '+(plans[request.plan_key]||'PrepHub credit preparation plans (plan not selected)')+'. Client: “'+quote+'” No enrollment or payment completed.'};
}
export async function syncCreditInterest(client:any,action:any,result:any){const note=creditInterestNote(action,result);if(!note)return false;const saved=await client.from('lead_notes').upsert(note,{onConflict:'id'});if(saved.error)throw saved.error;return true;}
