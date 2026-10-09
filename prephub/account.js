(function(){
'use strict';
const root=document.getElementById('homebuyer-credit-staging'),q=s=>root.querySelector(s),client=window.PrepHubAccount;
const params=new URLSearchParams(location.search),mapping={credit:'credit',dti:'income',job:'employment',taxes:'documents'},paths={credit:'credit',dti:'income',employment:'employment',taxes:'documents'};
const requested=params.get('view')||paths[location.pathname.split('/').filter(Boolean)[0]]||'overview';
const showView=window.PrepHubView.show;
window.PrepHubView.show=function(view){showView(view);if(q('[data-panel="'+view+'"]')?.hidden===false){const url=new URL(location.href);url.searchParams.set('view',view);history.replaceState(null,'',url);}};
root.addEventListener('click',event=>{const button=event.target.closest('[data-view],[data-go]');if(button)window.PrepHubView.show(button.dataset.view||button.dataset.go);});
q('#prep-department').addEventListener('change',event=>window.PrepHubView.show(event.target.value));
let connected=false,desired=['overview','credit','income','employment','documents','savings'].includes(requested)?requested:'overview';
const labels={credit:'Credit preparation',dti:'Income & DTI',job:'Employment history',taxes:'My documents'};
function score(value){const n=Math.max(0,Math.min(100,Number(value)||0));q('#prep-readiness-score').textContent=n+'%';q('#prep-readiness-copy').textContent=n===100?'Your assessment is ready for the next step. Continue preparing with your lender.':'Complete your remaining preparation areas and return to review your progress.';}
function login(view){if(view)desired=view;q('#prep-login-dialog').showModal();q('#prep-login-email').focus();}
window.PrepHubSignIn=()=>login();
window.PrepHubRequireAccount=view=>{if(view==='overview'||connected)return true;login(view);return false;};
q('#prep-account-login').addEventListener('click',()=>login());
q('#prep-login-close').addEventListener('click',()=>q('#prep-login-dialog').close());
q('#prep-account-logout').addEventListener('click',async()=>{await window.PrepHubWorkbook?.flush();await window.PrepHubDocuments?.flush();await client.auth.signOut();location.assign('/prephub/');});
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
 if(!connected){window.PrepHubReadinessBaseline={};window.dispatchEvent(new Event('prephub-assessment-loaded'));q('#prep-account-status').textContent='Connect your profile to save your preparation.';const value=params.get('score')||localStorage.getItem('dpa_prephub_score');if(value!==null)score(value);window.PrepHubView.show('overview');return;}
 const result=await client.from('prephub_leads').select('id,first_name,current_readiness_score,assessment').eq('user_id',data.session.user.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(result.error)throw result.error;if(!result.data)throw new Error('Your account is connected, but no saved preparation profile was found. Call 1-833-302-8953 for help.');
 const profile=result.data;q('#prep-account-name').textContent=profile.first_name?profile.first_name+'’s PrepHub':'My PrepHub';q('#prep-account-status').textContent='Account connected · Save your work as you prepare.';
 const answers=profile.assessment||{};const yes=v=>v===true||v==='Yes';
 window.PrepHubReadinessBaseline={credit:yes(answers.credit_640_plus),income:yes(answers.income_70k_plus),employment:yes(answers.job_history_2yrs),documents:yes(answers.tax_returns_2yrs)};
 window.dispatchEvent(new Event('prephub-assessment-loaded'));

}
async function init(){
 await window.PrepHubAccountReady;
 const visitor=localStorage.getItem('dpa_visitor_id')||crypto.randomUUID();localStorage.setItem('dpa_visitor_id',visitor);
 const heartbeat=()=>client.functions.invoke('track-site-visit',{body:{scope:'prephub',visitor_id:visitor,path:location.pathname}}).catch(()=>{});heartbeat();setInterval(heartbeat,30000);
 await refresh();
 if(connected){const pending=localStorage.getItem('dpa_prephub_next_view');if(['overview','credit','income','employment','documents','savings'].includes(pending)){desired=pending;localStorage.removeItem('dpa_prephub_next_view');}window.PrepHubView.show(desired);localStorage.setItem('dpa_prephub_return_url',location.origin+'/prephub/');}
}
init().catch(async error=>{q('#prep-account-status').textContent=error.message;const current=await client.auth.getSession();if(!current.error){const signedIn=!!current.data?.session;q('#prep-account-login').hidden=signedIn;q('#prep-account-logout').hidden=!signedIn;}});
})();
