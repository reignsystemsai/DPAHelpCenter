export const norm=(x:unknown)=>String(x??'').toLowerCase().replace(/[\s_-]/g,'');
export const timestamp=(x:unknown)=>Number.isFinite(Date.parse(String(x||'')))?Date.parse(String(x)):0;
export const iso=(n:number)=>new Date(n).toISOString();
export const escapeHtml=(x:unknown)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function creditNeed(lead:any,operation:any={}){
 const override=operation.department_status?.prep_fields?.creditStatus;
 if(override)return override!=='Complete';
 return (Number(lead.credit_score)>0&&Number(lead.credit_score)<640)||lead.assessment?.credit_640_plus===false||(lead.focus_areas||[]).includes('credit');
}
export function callEvidence(call:any){
 return !!call&&(!!call.last_call_at||Number(call.attempts_used)>0||!!call.metadata?.twilio_call_sid);
}
export function countFacts(leads:any[],operations:any[],calls:any[],communications:any[],preferences:any[],now=Date.now()){
 const ops=new Map(operations.map(x=>[x.lead_id,x]));
 const active=leads.filter(l=>!ops.get(l.id)?.archived_at&&!ops.get(l.id)?.deleted_at);
 const activeIds=new Set(active.map(l=>l.id));
 const liveCalls=calls.filter(c=>activeIds.has(c.lead_id)&&!c.metadata?.deleted_at&&!c.metadata?.archived_at);
 const missing=active.filter(l=>!liveCalls.some(c=>c.lead_id===l.id&&c.direction==='outbound'&&callEvidence(c))&&!communications.some(c=>c.lead_id===l.id&&c.channel==='call'&&c.direction==='outbound'&&c.provider==='twilio_prephub'&&!!c.provider_message_id&&!['queued','submitted'].includes(norm(c.status))));
 const overdue=liveCalls.filter(c=>timestamp(c.callback_at||c.next_call_at)>0&&timestamp(c.callback_at||c.next_call_at)<now&&!c.do_not_call&&!['completed','donotcall','paused'].includes(norm(c.sequence_status)));
 const recent=communications.filter(c=>activeIds.has(c.lead_id));
 const pendingInterest=preferences.filter(p=>activeIds.has(p.lead_id)&&p.interested_at);
 return {active,counts:{active_clients:active.length,credit_preparation_needs:active.filter(l=>creditNeed(l,ops.get(l.id))).length,no_recorded_outbound_call:missing.length,overdue_callbacks:new Set(overdue.map(c=>c.lead_id)).size,emails_sent:new Set(recent.filter(c=>c.channel==='email'&&['sent','delivered'].includes(norm(c.status))).map(c=>c.lead_id)).size,interested_clients:pendingInterest.length},missingCallIds:missing.map(l=>l.id)};
}
export function contactDecision(job:any,lead:any,op:any,pref:any,calls:any[],communications:any[],now=Date.now()){
 if(op?.archived_at||op?.deleted_at)return {status:'canceled',reason:'Lead archived or deleted'};
 if(!lead)return {status:'canceled',reason:'Lead not found'};
 if(job.channel==='call'&&(pref?.call_paused||calls.some(c=>c.do_not_call||norm(c.sequence_status)==='donotcall')))return {status:'paused',reason:'Do not call / calls paused'};
 if(job.channel==='email'&&pref?.email_paused)return {status:'paused',reason:'Email unsubscribed / paused'};
 if(pref?.interested_at||pref?.callback_requested_at||pref?.last_reply_at)return {status:'needs_review',reason:'Interest, reply or callback request needs owner attention'};
 const callback=calls.find(c=>timestamp(c.callback_at||c.next_call_at)>0&&!['completed','donotcall','paused'].includes(norm(c.sequence_status)));
 if(callback)return {status:'needs_review',reason:'Existing callback: '+(callback.callback_at||callback.next_call_at)};
 if(communications.some(c=>c.direction==='inbound'&&timestamp(c.occurred_at)>timestamp(job.created_at)))return {status:'needs_review',reason:'Inbound reply or call received after enrollment'};
 if(job.step_key==='credit_followup'&&!creditNeed(lead,op))return {status:'skipped',reason:'Credit preparation need no longer indicated'};
 if(job.channel==='call'&&!job.owner_directed&&!pref?.voice_permission_verified_at)return {status:'needs_review',reason:'AI voice permission has not been verified'};
 const touches=communications.filter(c=>c.direction==='outbound'&&timestamp(c.occurred_at)>now-7*86400000&&!['failed','queued','canceled'].includes(norm(c.status)));
 const override=job.owner_directed===true&&job.override_cadence===true;
 if(!override&&(touches.length>=3||(job.channel==='call'&&touches.filter(c=>c.channel==='call').length>=2)))return {status:'pending',reason:'Weekly contact limit; deferred',due_at:iso(now+86400000)};
 const last=Math.max(0,...touches.map(c=>timestamp(c.occurred_at)));
 if(!override&&last>now-24*3600000)return {status:'pending',reason:'Spacing contacts by at least 24 hours',due_at:iso(last+24*3600000)};
 const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(now));
 if(!override&&(hour<9||hour>=18))return {status:'pending',reason:'Contact window is 9 AM–6 PM Eastern',due_at:iso(now+3600000)};
 return {status:'ready',reason:'Ready'};
}
export const seedScripts=[
 {script_key:'welcome_call',version:1,title:'PrepHub Welcome & Walkthrough',channel:'call',content:{opening:"Hi {first_name}, this is Daisy, the AI homebuyer preparation assistant with DPA Help Center. You previously asked us about preparing to buy a home. Is now a good time for a quick introduction?",overview:"PrepHub helps you organize your credit, income and monthly debts, work history, and documents. Sign in at dpahelpcenter.com and open My Prep Hub. Choose one preparation area to work on first. These are preparation tools; your lender confirms qualification and exact numbers.",question:"Would you like help choosing your next step? Say yes or press 1. To request a callback, say callback or press 2. To stop calls, say stop or press 9.",interested:"I've recorded that you would like help. Our team will review your request and follow up with you. Thank you.",callback:"I've recorded your callback request for our team. We will review it before arranging another call. Thank you.",decline:"Thank you for your time. You can return to PrepHub whenever you are ready.",stop:"I've recorded your request to stop calls. Thank you.",unknown:"I can record a request for our team to help you. Say yes for help, callback to request a callback, or stop to stop calls.",voicemail:"Hi, this is Daisy, the AI homebuyer preparation assistant with DPA Help Center. You can sign in at dpahelpcenter.com to review your next steps in PrepHub. Call us at 1-833-302-8953 if you would like help. Thank you."}},
 {script_key:'credit_followup',version:1,title:'Credit Preparation Follow-up',channel:'email',content:{subject:'{first_name}, would you like help preparing your credit?',body:"Hi {first_name},\n\nYour intake indicated that credit preparation may be one of your next steps toward homeownership. In PrepHub, you can organize your credit information and review the areas that need attention.\n\nWould you like our team to explain the available credit preparation options? Select I'm interested below, or call 1-833-302-8953. We will discuss the scope and any cost with you before you decide.\n\nNo score improvement, deletion or loan approval is promised.\n\nDPA Help Center",cta:'I’m interested'}},
 {script_key:'prep_reminder',version:1,title:'One Next Preparation Step',channel:'email',content:{subject:'{first_name}, take your next step in PrepHub',body:"Hi {first_name},\n\nYou do not have to complete everything at once. Sign in to PrepHub and choose one area: credit, income and debts, work history, or documents. Save your progress so you can continue later.\n\nIf you would like our team to help you choose a next step, select I'm interested below, or call 1-833-302-8953.\n\nDPA Help Center",cta:'I’d like help'}}
] as const;
