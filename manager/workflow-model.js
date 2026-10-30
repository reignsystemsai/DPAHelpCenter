/* Shared, read-only projections used by the PrepHub workflow dashboard. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PrepWorkflowModel=api;})(typeof window==='object'?window:globalThis,()=>{
  const areas=[{key:'login',title:'New / Not Engaged',button:'Start Login Calls',goal:'Prep Hub login',match:/orientation|welcome|login/i},{key:'credit',title:'Credit',button:'Start Credit Calls',goal:'Clear credit milestones',match:/credit/i},{key:'income',title:'DTI & Income',button:'Start Income Calls',goal:'Complete income review',match:/income|dti/i},{key:'taxes',title:'Taxes',button:'Start Tax Calls',goal:'Complete tax documents',match:/tax/i},{key:'work',title:'Work History',button:'Start Work Calls',goal:'Complete work history',match:/work|employ/i}];
  function loginConfirmed(c,task){return Boolean(c.claimedAt||task?.preparation_plan?.steps?.some(s=>s.id==='access'&&s.status==='recorded'));}
  function needs(c){return [c.creditStatus!=='Complete'&&'credit',(c.incomeStatus!=='Complete'||c.dtiStatus!=='Complete')&&'income',c.taxStatus!=='Complete'&&'taxes',c.employmentStatus!=='Complete'&&'work'].filter(Boolean);}
  function rows(customers,taskFor){return customers.filter(c=>!c.archived).map(c=>{const task=taskFor(c.dbId),login=loginConfirmed(c,task),steps=task?.preparation_plan?.steps||[],gaps=needs(c),transferred=c.group==='DPA Transfers';return {customer:c,task,login,gaps,transferred,steps,recorded:steps.filter(s=>['recorded','saved_complete'].includes(s.status)).length,reported:steps.filter(s=>s.status==='client_reported').length};});}
  function worklist(rows,key){return rows.filter(r=>!r.transferred&&(key==='login'?!r.login:r.login&&r.gaps.includes(key)&&!(areaKey(r.task?.preparation_area)===key&&r.task?.preparation_plan?.section_complete)));}
  function areaKey(area){return /credit/i.test(area||'')?'credit':/income|dti/i.test(area||'')?'income':/tax/i.test(area||'')?'taxes':/work|employ/i.test(area||'')?'work':null;}
  function eligible(r,now=Date.now()){
    const task=r.task;if(task?.preferences?.call_paused||task?.admin_paused||task?.status==='paused')return 'Calls paused';
    if(task&&task.task_owner!=='Daisy')return 'Assigned to administrator';
    if(['working','submitted'].includes(task?.status))return 'Call already in progress';
    const callback=(task?.scheduled_callbacks||[]).find(c=>!['completed','canceled','skipped'].includes(c.status)&&Date.parse(c.due_at)>now);
    if(callback)return 'Scheduled callback — '+callback.due_at;
    if(task?.due_at&&Date.parse(task.due_at)>now)return 'Not due yet';
    return null;
  }
  function checkpointGroups(rows){return [
    {key:'new',title:'New / Not Engaged',goal:'First goal: Prep Hub login',rows:rows.filter(r=>!r.transferred&&!r.login)},
    {key:'preparation',title:'Engaged / Preparation',goal:'Next goal: Complete the next checkpoint',rows:rows.filter(r=>!r.transferred&&r.login)},
    {key:'dpa',title:'DPA Ready',goal:'Preparation handoff recorded · Ready for real estate follow-up',rows:rows.filter(r=>r.transferred)}
  ];}
  function stepState(step){const checked=['recorded','saved_complete'].includes(step?.status);return {checked,label:checked?'Complete':step?.status==='client_reported'?'Client reported':step?.status==='in_progress'?'In progress':'Pending'};}
  function liveStatus(snapshot,receivedAt,leadId,now=Date.now()){
    if(!snapshot?.ok||!Number.isFinite(Date.parse(snapshot.as_of)))return {state:'unavailable'};
    const elapsed=now-receivedAt;if(elapsed<0||elapsed>45000)return {state:'unavailable'};
    const person=(snapshot.live||[]).find(x=>x.lead_id===leadId);if(!person)return {state:'no_signal'};
    const age=Date.parse(snapshot.as_of)-Date.parse(person.seen_at)+elapsed;if(!Number.isFinite(age)||age<0||age>45000)return {state:'no_signal'};
    return {state:'live',pages:person.pages||[],seen_at:person.seen_at};
  }
  const validStamp=(value,now)=>{const n=Date.parse(value||'');return Number.isFinite(n)&&n<=now?n:null;};
  function stageTiming(r,now=Date.now()){
    const value=r.transferred?r.customer.handoffAt:r.login?(r.customer.claimedAt||r.steps.find(s=>s.id==='access'&&s.status==='recorded')?.recorded_at):r.customer.intakeCreatedAt;
    const at=validStamp(value,now);return at===null?null:{at,days:Math.floor((now-at)/86400000)};
  }
  function attention(r,call,now=Date.now()){
    if(r.transferred)return [];
    const t=r.task,reasons=[],pending=(t?.scheduled_callbacks||[]).filter(c=>!['completed','canceled','cancelled','skipped'].includes(c.status));
    const overdue=pending.some(c=>{const at=validStamp(c.due_at,now);return at!==null&&at<now;});
    const held=Boolean(t?.admin_paused||t?.preferences?.call_paused||['paused','working','submitted','completed','canceled'].includes(t?.status));
    const due=validStamp(t?.due_at,now);
    if(overdue)reasons.push('Overdue callback');
    else if(!held&&due!==null&&due<now&&!pending.some(c=>Date.parse(c.due_at)>now))reasons.push('Overdue task');
    if(/^(failed|error)$/i.test(call?.last_call_result||''))reasons.push('Latest call failed');
    const dates=[stageTiming(r,now)?.at,...r.steps.filter(s=>stepState(s).checked).map(s=>validStamp(s.recorded_at,now))].filter(n=>n!==null&&n!==undefined);
    if(!held&&dates.length&&now-Math.max(...dates)>=7*86400000)reasons.push('No recorded checkpoint progress in 7+ days');
    return reasons;
  }
  function funnel(rows){const total=rows.length,logged=rows.filter(r=>r.login).length,handoffs=rows.filter(r=>r.transferred).length;return {total,logged,handoffs,loginRate:total?Math.round(logged/total*100):null,handoffRate:total?Math.round(handoffs/total*100):null};}
  const terminal=a=>['completed','no-answer','busy','failed','canceled'].includes(a?.result?.call_status);
  return {areas,loginConfirmed,needs,rows,worklist,areaKey,eligible,terminal,checkpointGroups,stepState,liveStatus,stageTiming,attention,funnel};
});
