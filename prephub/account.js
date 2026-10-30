(function(){
'use strict';
const root=document.getElementById('homebuyer-credit-staging'),q=s=>root.querySelector(s),client=window.PrepHubAccount;
const taxesScript=document.createElement('script');taxesScript.src='/prephub/taxes.js?v=20261030-taxes-1';const taxesReady=new Promise((resolve,reject)=>{taxesScript.onload=resolve;taxesScript.onerror=()=>reject(Error('Taxes could not load. Refresh to retry.'));});document.head.append(taxesScript);
const params=new URLSearchParams(location.search),mapping={credit:'credit',dti:'income',job:'employment',taxes:'taxes'},paths={credit:'credit',dti:'income',employment:'employment',taxes:'taxes'};
const requested=params.get('view')||paths[location.pathname.split('/').filter(Boolean)[0]]||null;
const showView=window.PrepHubView.show;
window.PrepHubView.show=function(view){showView(view);if(q('[data-panel="'+view+'"]')?.hidden===false){const url=new URL(location.href);url.searchParams.set('view',view);history.replaceState(null,'',url);}};
root.addEventListener('click',event=>{const button=event.target.closest('[data-view],[data-go]');if(button)window.PrepHubView.show(button.dataset.view||button.dataset.go);});
q('#prep-department').addEventListener('change',event=>window.PrepHubView.show(event.target.value));
let connected=false,desired=['overview','credit','income','employment','taxes','documents','savings'].includes(requested)?requested:null;
const labels={credit:'Credit preparation',dti:'Income & DTI',job:'Employment history',taxes:'Taxes'};
function score(value){const n=Math.max(0,Math.min(100,Number(value)||0));q('#prep-readiness-score').textContent=n+'%';q('#prep-readiness-copy').textContent=n===100?'Your assessment is ready for the next step. Continue preparing with your lender.':'Complete your remaining preparation areas and return to review your progress.';}
function login(view){if(view)desired=view;q('#prep-login-dialog').showModal();q('#prep-login-email').focus();}
window.PrepHubSignIn=()=>login();
window.PrepHubRequireAccount=view=>{if(view==='overview'||connected)return true;login(view);return false;};
q('#prep-account-login').addEventListener('click',()=>login());
q('#prep-login-close').addEventListener('click',()=>q('#prep-login-dialog').close());
function lock(signedOut=false){
 connected=false;document.body.classList.add('prep-locked');
 document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
 q('#prep-account-name').textContent='My PrepHub';q('#prep-account-logout').hidden=true;q('#prep-account-login').hidden=false;
 q('#prep-auth-title').textContent=signedOut?'Thank you for preparing with us.':'Your personal PrepHub';
 q('#prep-auth-copy').textContent=signedOut?'You’re signed out. Sign in with your secure email link to continue.':'Sign in with your secure email link to view your preparation plan.';
 window.PrepHubReadinessBaseline={};window.PrepHubReadinessScores={};window.PrepHubIntakeCredit=null;
}
window.PrepHubSignOut=async()=>{
 lock(true);q('#prep-auth-copy').textContent='Saving your latest changes and signing out…';
 await Promise.allSettled([window.PrepHubWorkbook?.flush(),window.PrepHubDocuments?.flush()]);
 const owner=(await client.auth.getSession()).data.session?.user?.id;
 const result=await client.auth.signOut({scope:'local'});
 if(result.error){q('#prep-auth-copy').textContent='Your information is hidden. Sign-out could not finish; please retry.';q('#prep-auth-retry').hidden=false;return;}
 ['dpa_prephub_score','dpa_prephub_first_name','dpa_prephub_email','dpa_prephub_lead_id','dpa_prephub_next_view','dpa_prephub_require_email','prephub-workbook-session-v1','dpa-prephub-work-draft-v2:'+owner,'dpa_prephub_documents_draft:'+owner].forEach(key=>localStorage.removeItem(key));
 location.replace('/prephub/?signed_out=1&v=20261016-personal-plan');
};
q('#prep-account-logout').addEventListener('click',window.PrepHubSignOut);
q('#prep-auth-retry').addEventListener('click',window.PrepHubSignOut);
q('#prep-auth-signin').addEventListener('click',()=>login());
client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')lock(true);});
window.addEventListener('pagehide',()=>document.body.classList.add('prep-locked'));
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
q('#prep-login-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.submitter,status=q('#prep-login-status');button.disabled=true;status.textContent='Sending your secure login link…';
 try{const email=q('#prep-login-email').value.trim().toLowerCase();const lead=params.get('lead')||localStorage.getItem('dpa_prephub_lead_id')||'';
 const response=await fetch('https://fklchtsxahepzfzgcqdp.supabase.co/functions/v1/prephub-intake',{method:'POST',headers:{'Content-Type':'application/json',apikey:'sb_publishable_TUIi5-8ISzGLtdFKxO-k6g_HCHz7nOk',Authorization:'Bearer sb_publishable_TUIi5-8ISzGLtdFKxO-k6g_HCHz7nOk'},body:JSON.stringify({action:'send_login',email,lead_id:lead})});
 const body=await response.json();if(!response.ok)throw new Error(body.error||'We could not send your login link. Please try again.');
 localStorage.setItem('dpa_prephub_email',email);localStorage.setItem('dpa_prephub_next_view',desired);status.textContent='Check your email for your secure PrepHub login link.';
 }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});
function make(tag,text,className){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
async function refresh(){
 const {data,error}=await client.auth.getSession();if(error)throw error;connected=!!data.session;
 q('#prep-account-login').hidden=connected;q('#prep-account-logout').hidden=!connected;
 if(!connected){lock(params.has('signed_out'));return;}
 let query=client.from('prephub_leads').select('id,lead_id,first_name,credit_score,household_income,employment_history,tax_return_history,current_readiness_score,assessment').eq('user_id',data.session.user.id);const target=params.get('lead')||localStorage.getItem('dpa_prephub_lead_id');if(target)query=query.eq('lead_id',target);const result=await query.order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(result.error)throw result.error;if(!result.data)throw new Error('Your account is connected, but no saved preparation profile was found. Call 1-833-302-8953 for help.');
 const profile=result.data;q('#prep-account-name').textContent=profile.first_name?profile.first_name+'’s PrepHub':'My PrepHub';q('#prep-account-status').textContent='Account connected · Save your work as you prepare.';
 window.PrepHubReadinessBaseline=window.PrepHubPreparation.baseline(profile);window.PrepHubIntakeCredit=profile.credit_score;
 window.dispatchEvent(new Event('prephub-assessment-loaded'));

}
async function init(){
 await window.PrepHubAccountReady;
 const visitor=localStorage.getItem('dpa_visitor_id')||crypto.randomUUID();localStorage.setItem('dpa_visitor_id',visitor);
 const heartbeat=()=>client.functions.invoke('track-site-visit',{body:{scope:'prephub',visitor_id:visitor,path:location.pathname}}).catch(()=>{});heartbeat();setInterval(heartbeat,30000);
 await refresh();
 if(connected){
 if(!window.PrepHubWorkbookLoaded)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Your saved preparation could not finish loading. Refresh to retry.')),15000);window.addEventListener('prephub-workbook-loaded',()=>{clearTimeout(timer);resolve();},{once:true});});
 await window.PrepHubDocumentsReady;await taxesReady;window.PrepHubTaxes?.refresh();
 const pending=localStorage.getItem('dpa_prephub_next_view');if(['overview','credit','income','employment','taxes','documents','savings'].includes(pending)){desired=pending;localStorage.removeItem('dpa_prephub_next_view');}
 window.PrepHubView.show(desired||window.PrepHubPreparation.next(window.PrepHubReadinessScores||{}));document.body.classList.remove('prep-locked');localStorage.setItem('dpa_prephub_return_url',location.origin+'/prephub/');
 }

}
init().catch(async error=>{q('#prep-auth-copy').textContent=error.message;q('#prep-auth-title').textContent='We couldn’t open your preparation yet.';q('#prep-account-status').textContent=error.message;const current=await client.auth.getSession();if(!current.error){const signedIn=!!current.data?.session;q('#prep-account-login').hidden=signedIn;q('#prep-account-logout').hidden=!signedIn;}});
})();

(()=>{const s=document.createElement('script');s.src='/prephub/page-presence.js?v=20261020-live-guide-1';document.head.appendChild(s);})();
