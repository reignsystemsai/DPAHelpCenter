const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('Sign-out hides the workspace before saving, clears browser profile hints, and replaces history with thank-you screen',async()=>{
 const elements=new Map(),removed=[],classes=new Set();let redirected,scope,release;
 const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',hidden:false,addEventListener(){},close(){},focus(){}});return elements.get(id);};
 const root={querySelector:element,addEventListener(){}};
 const client={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){},signOut:async options=>{scope=options.scope;return {error:null};}},functions:{invoke:async()=>({})}};
 const window={PrepHubAccount:client,PrepHubAccountReady:Promise.resolve(),PrepHubView:{show(){}},addEventListener(){},PrepHubWorkbook:{flush:()=>new Promise(resolve=>{release=resolve;})}};
 const document={getElementById:()=>root,querySelectorAll:()=>[],body:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}}};
 const context={window,document,URLSearchParams,URL,Event,crypto:{randomUUID:()=> 'visitor'},location:{search:'',pathname:'/prephub/',origin:'https://www.dpahelpcenter.com',replace:x=>redirected=x},localStorage:{getItem:()=>null,setItem(){},removeItem:x=>removed.push(x)},history:{replaceState(){}},setInterval(){},setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(__dirname+'/account.js','utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));classes.clear();
 const operation=window.PrepHubSignOut();assert(classes.has('prep-locked'));assert.equal(redirected,undefined);
 release();await operation;assert.equal(scope,'local');assert(removed.includes('dpa_prephub_score'));assert(removed.includes('dpa_prephub_lead_id'));assert.equal(redirected,'/prephub/?signed_out=1&v=20261016-personal-plan');
});
