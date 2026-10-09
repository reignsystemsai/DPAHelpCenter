
(()=>{
 const root=document.getElementById('homebuyer-credit-staging'),fico=document.getElementById('credit-readiness-fico'),confirm=document.getElementById('credit-readiness-confirm');
 let saved={};
 const names={overview:'My PrepHub',credit:'Credit Preparation',income:'Income & DTI',employment:'Employment History',documents:'My Documents',savings:'Savings & Fees'};
 let detected=null;
 function reportScore(){
  const work=window.PrepHubSectionSave?.readWorkbook();if(!work)return null;
  const excluded=new Set(work.progress_excluded||[]),latest={};
  for(const entry of work.progress_scores||[]){
   const model=String(entry.model||''),bureau=entry.bureau,score=Number(entry.score);
   const mortgageModel=/mortgage.*fico|fico.*mortgage/i.test(model)||({experian:/fico\s*(?:score\s*)?2\b/i,equifax:/fico\s*(?:score\s*)?5\b/i,transunion:/fico\s*(?:score\s*)?4\b/i}[bureau]?.test(model));
   if(entry.source!=='report'||!entry.report_id||excluded.has(entry.report_id)||!mortgageModel||!Number.isInteger(score)||score<300||score>850)continue;
   if(!latest[bureau]||String(entry.date||'')>String(latest[bureau].date||''))latest[bureau]=entry;
  }
  const entries=['experian','equifax','transunion'].map(b=>latest[b]);if(entries.some(e=>!e))return null;
  const scores=entries.map(e=>Number(e.score)).sort((a,b)=>a-b);
  return {score:scores[1],signature:JSON.stringify(entries.map(e=>[e.bureau,e.score,e.model,e.report_id,e.date])),text:entries.map(e=>e.bureau+': '+e.score).join(' · ')};
 }
 function update(){
  saved=window.PrepHubSectionSave?.readReadiness()||{};
  detected=reportScore();fico.disabled=!!detected;fico.value=detected?String(detected.score):(saved.fico||'');
  confirm.checked=detected?saved.reportSignature===detected.signature:saved.selfConfirmed===true;
  document.getElementById('credit-readiness-confirm-label').textContent=detected?'I confirmed the mortgage FICO scores detected in my reports.':'I confirm this is my middle mortgage FICO.';
  document.getElementById('credit-readiness-source').textContent=detected?'Report-detected · '+detected.text+' · Confirm extracted scores; lender verification still applies.':'Self-reported · Use your mortgage FICO, not a general credit-monitoring score.';
  const creditScore=Number(fico.value),complete=fico.value!==''&&Number.isInteger(creditScore)&&creditScore>=640&&creditScore<=850&&confirm.checked,score=complete?25:0;
  const signals=window.PrepHubReadinessSignals||{},assessed=window.PrepHubReadinessAssessed||{},baseline=window.PrepHubReadinessBaseline||{};const creditAssessed=detected||saved.fico!==undefined;const contribution=key=>(assessed[key]?signals[key]:baseline[key])?25:0;const scores={credit:creditAssessed?score:(baseline.credit?25:0),income:contribution('income'),employment:contribution('employment'),documents:contribution('documents')};scores.overview=scores.credit+scores.income+scores.employment+scores.documents;
 const completed=['credit','income','employment','documents'].filter(key=>scores[key]===25).length;
 const mainScore=root.querySelector('#prep-readiness-score');mainScore.textContent=scores.overview+'%';mainScore.classList.toggle('prep-ready',scores.overview===100);
 root.querySelector('#prep-readiness-copy').textContent=completed+' of 4 sections complete. Preparation progress; your lender confirms qualification.';
 root.querySelector('#prep-task-summary').textContent=completed===4?'All four preparation areas are complete.':'Complete each area to earn 25%. Your score updates as you make changes.';
 const areaMap={credit:'credit',dti:'income',job:'employment',taxes:'documents'};
 for(const area of root.querySelectorAll('[data-prep-key]')){const key=areaMap[area.dataset.prepKey];if(!key)continue;const label=area.querySelector('.prep-area-state');label.hidden=false;label.textContent=scores[key]+'%';label.classList.add('prep-score-badge');label.classList.toggle('is-complete',scores[key]===25);}
 const next=['credit','income','employment','documents'].find(key=>scores[key]===0);
 const hero=root.querySelector('[data-panel="overview"] .hero');
 if(hero){hero.querySelector('h2').textContent=next?'Next: '+names[next]:'Your preparation is complete.';
 hero.querySelector('p').textContent=next?'Open this section to complete your next preparation step.':'All four sections are complete. Your lender confirms your numbers, records, and loan eligibility.';
 const button=hero.querySelector('[data-go]');button.dataset.go=next||'documents';button.textContent=next?'Open '+names[next]:'Review My Document Packet';}

 root.querySelectorAll('[data-prep-score]').forEach(el=>{const key=el.dataset.prepScore,value=scores[key]||0;el.textContent=value+'%';el.classList.toggle('is-complete',key==='overview'?value===100:value===25);});
  const badge=document.getElementById('credit-readiness-contribution');badge.textContent=score+'% / 25%';badge.classList.toggle('is-complete',complete);
  const status=document.getElementById('credit-readiness-status');status.textContent=complete?'Credit ready · '+(detected?'Report-detected':'Self-reported')+' · 25% added to My PrepHub.':creditScore>=640&&creditScore<=850?'Confirm your middle mortgage FICO to earn 25%.':'A middle mortgage FICO of 640+ earns 25%.';
  status.classList.toggle('is-complete',complete);
  for(const option of root.querySelectorAll('#prep-department option'))option.textContent=option.value==='savings'?names.savings:names[option.value]+' · '+(scores[option.value]||0)+'%';
 }
 function persist(){window.PrepHubSectionSave.writeReadiness(saved);update();}
 fico.addEventListener('input',()=>{saved.fico=fico.value;saved.selfConfirmed=false;persist();});
 confirm.addEventListener('change',()=>{if(detected)saved.reportSignature=confirm.checked?detected.signature:null;else saved.selfConfirmed=confirm.checked;persist();});
 window.addEventListener('prephub-credit-workbook-saved',update);
 window.addEventListener('prephub-section-readiness',update);
 window.addEventListener('prephub-assessment-loaded',update);
 update();
})();
