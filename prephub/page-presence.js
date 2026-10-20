/* Only authenticated page identifiers; no input values, document contents or credentials. */
(()=>{'use strict';
const endpoint='https://fklchtsxahepzfzgcqdp.supabase.co/functions/v1/prephub-call-guide',session_id=crypto.randomUUID(),tabs=['overview','credit','income','employment','documents','savings'];
let client,busy=false,timer;
async function send(){if(!client||busy)return;busy=true;try{
 const {data}=await client.auth.getSession();if(!data.session)return;
 const root=document.getElementById('homebuyer-credit-staging'),page=Array.from(root.querySelectorAll('[data-panel]')).find(e=>!e.hidden&&tabs.includes(e.dataset.panel));if(!page)return;
 const section=root.querySelector('[data-workbook][aria-expanded="true"]');
 await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({action:'presence',lead_id:new URLSearchParams(location.search).get('lead')||localStorage.getItem('dpa_prephub_lead_id')||undefined,session_id,tab:page.dataset.panel,panel:section?.dataset.workbook||null,visible:document.visibilityState==='visible'&&!document.body.classList.contains('prep-locked')})});
 }catch{/* Optional awareness must not block the workbook. */}finally{busy=false;}}
function changed(){clearTimeout(timer);timer=setTimeout(send,200);}
(async()=>{await window.PrepHubAccountReady;client=window.PrepHubAccount;if(!client)return;new MutationObserver(changed).observe(document.getElementById('homebuyer-credit-staging'),{subtree:true,attributes:true,attributeFilter:['hidden','aria-expanded']});new MutationObserver(changed).observe(document.body,{attributes:true,attributeFilter:['class']});document.addEventListener('visibilitychange',changed);client.auth.onAuthStateChange(changed);setInterval(send,15000);send();})();
})();
