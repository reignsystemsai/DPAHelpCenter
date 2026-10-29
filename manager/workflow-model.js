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
  const terminal=a=>['completed','no-answer','busy','failed','canceled'].includes(a?.result?.call_status);
  return {areas,loginConfirmed,needs,rows,worklist,areaKey,eligible,terminal};
});
