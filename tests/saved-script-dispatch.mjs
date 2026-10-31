import {test} from 'node:test';import assert from 'node:assert/strict';
import {savedScriptIntent,dispatchSavedScriptCommand} from '../supabase/functions/_shared/saved-script-dispatch.ts';
import {directAction} from '../supabase/functions/_shared/direct-number.ts';
const requestId='11111111-1111-4111-8111-111111111111',scriptId='22222222-2222-4222-8222-222222222222';
function fixture({linked=true}={}){let prepared=0,dispatches=0;const tables={daisy_crm_actions:[],daisy_call_scripts:[{id:scriptId,script_number:40,direction:'outbound',archived_at:null,deleted_at:null,version:11,content:{opening:'Hi, {first_name}. Congratulations!',script_text:'[PrepHub:identity]\\nHi, {first_name}. Congratulations!\\n\\n[PrepHub:identity_followup]\\nI’m sorry. I should have asked. Is this {first_name} speaking?',objective:'PrepHub orientation',key_points:['Saved script only'],recording_requested:true}}],prephub_leads:linked?[{id:'lead',lead_id:'DPA-EXAMPLE',first_name:'Douglas',last_name:'Example',phone:'3055550101'}]:[]};
class Q{constructor(table){this.rows=tables[table]||[];this.filters=[];}select(){return this;}eq(k,v){this.filters.push(r=>r[k]===v);return this;}is(k,v){this.filters.push(r=>(r[k]??null)===v);return this;}ilike(k,v){this.filters.push(r=>String(r[k]).toLowerCase().endsWith(v.replace('%','').toLowerCase()));return this;}limit(){return this;}insert(v){this.v=v;return this;}result(single=false){if(this.v){const existing=this.rows.find(r=>r.id===this.v.id);if(existing)return {error:{code:'23505'}};this.rows.push({...this.v,status:'draft'});this.v=null;}const hits=this.rows.filter(r=>this.filters.every(f=>f(r)));return {data:single?hits[0]||null:hits,error:null};}single(){return Promise.resolve(this.result(true));}maybeSingle(){return Promise.resolve(this.result(true));}then(a,b){return Promise.resolve(this.result()).then(a,b);}}
const client={from:t=>new Q(t)},deps={prepareAction:async(c,m,args,owner)=>{prepared++;assert.equal(args.saved_script.version,11);const action={id:owner.requestId,created_by:m.user_id,status:'draft',payload:{owner_saved_script_request:owner.question,saved_script_ready:true,script_id:args.saved_script.id}};tables.daisy_crm_actions.push(action);return {action};},executeCurrentCall:async(c,m,a,q)=>{assert.equal(a.payload.owner_saved_script_request,q);if(a.status==='draft'){dispatches++;a.status='submitted';a.provider_id='CA-mock';}return {action:a,answer:'Calling now.'};}};return {client,deps,tables,get prepared(){return prepared;},get dispatches(){return dispatches;}};}
test('recognizes the actual spoken Sprint number command and defaults a bare phone command to script 40',()=>{for(const q of ['Call 305-555-0101 using script 40','Call 305-555-0101 using Sprint number 40','Daisy, call 305-555-0101']){const intent=savedScriptIntent(q);assert.equal(intent.scriptNumber,40);assert.deepEqual(intent.phones,['+13055550101']);}assert.equal(savedScriptIntent('Call 3055550101 and tell them hello'),null);for(const q of ['Do not call 3055550101 using script 40','Preview a call to 3055550101 using script 40','If I tell Daisy to call 3055550101 using script 40'])assert.equal(savedScriptIntent(q),null);});
test('complete number-and-script request prepares and dispatches once without asking for name or approval',async()=>{const f=fixture(),q='Call 3055550101 using Sprint number 40';const r=await dispatchSavedScriptCommand(f.client,{role:'owner',user_id:'owner'},q,[],requestId,f.deps);assert.equal(r.action.provider_id,'CA-mock');assert.equal(f.prepared,1);assert.equal(f.dispatches,1);await dispatchSavedScriptCommand(f.client,{role:'owner',user_id:'owner'},q,[],requestId,f.deps);assert.equal(f.dispatches,1);});
test('a phone outside the CRM uses the saved script directly without creating a client or inventing a name',async()=>{const f=fixture({linked:false});const r=await dispatchSavedScriptCommand(f.client,{role:'owner',user_id:'owner'},'Call +573001234567 using script 40',[],requestId,f.deps);assert.equal(f.prepared,0);assert.equal(f.dispatches,1);assert.equal(r.action.lead_id,null);assert.equal(r.action.payload.call_mode,'saved_script_phone');assert.equal(r.action.payload.recipient.phone,'+573001234567');assert.match(r.action.payload.content.script_text,/May I have your first name/);assert.ok(directAction(r.action));assert.equal(f.tables.prephub_leads.length,0);});
test('an explicit follow-up call retains the earlier owner-provided script and number',()=>{const h=[{role:'user',content:'Call 3055550101 using Sprint number 40'},{role:'user',content:'That is for Doug'}];const intent=savedScriptIntent('Call Doug',h);assert.equal(intent.scriptNumber,40);assert.deepEqual(intent.phones,['+13055550101']);assert.equal(intent.target,'Doug');});

test('an in-flight retry does not finalize or dispatch a half-prepared request',async()=>{const f=fixture(),q='Call 3055550101 using script 40';f.tables.daisy_crm_actions.push({id:requestId,created_by:'owner',status:'draft',payload:{owner_saved_script_request:q}});await dispatchSavedScriptCommand(f.client,{role:'owner',user_id:'owner'},q,[],requestId,f.deps);assert.equal(f.dispatches,0);assert.equal(f.prepared,0);});

test('country code after national digits, numeric correction and another-call wording keep script 40 on the direct route',()=>{
 const q="Daisy call 305-555-0101 with script number 40 the customer's name is Doug used plus one for the country code";
 assert.deepEqual(savedScriptIntent(q).phones,['+13055550101']);
 const h=[{role:'user',content:q}];
 assert.deepEqual(savedScriptIntent('1305-555-0101',h).phones,['+13055550101']);
 h.push({role:'user',content:'1305-555-0101'});
 const repeat=savedScriptIntent("it's another call and you script number 40",h);
 assert.equal(repeat.scriptNumber,40);assert.deepEqual(repeat.phones,['+13055550101']);
 assert.equal(savedScriptIntent('1305-555-0101'),null);
 assert.equal(savedScriptIntent('Another call',h.concat({role:'user',content:'Cancel that call'})),null);
});
test('two separate requests to the same person each dispatch while retrying the same request does not',async()=>{
 const f=fixture();const q='Call 3055550101 using script 40';
 await dispatchSavedScriptCommand(f.client,{role:'owner',user_id:'owner'},q,[],requestId,f.deps);
 await dispatchSavedScriptCommand(f.client,{role:'owner',user_id:'owner'},'Another call using script 40',[{role:'user',content:q}],'33333333-3333-4333-8333-333333333333',f.deps);
 assert.equal(f.dispatches,2);
 await dispatchSavedScriptCommand(f.client,{role:'owner',user_id:'owner'},'Another call using script 40',[{role:'user',content:q}],'33333333-3333-4333-8333-333333333333',f.deps);
 assert.equal(f.dispatches,2);
});

test('conversational addresses and polite requests always dispatch the exact chosen saved script',async()=>{
 for(const prefix of ['Chat I want you to','Chat, I need you to','Daisy, could you please','Hey Chat, go ahead and','I would like you to','Will you','Please, Daisy, just']){
  const f=fixture(),q=prefix+" call +1-305-555-0101 the customer's name is Doug go over script number 40";
  const intent=savedScriptIntent(q);assert.ok(intent,q);assert.equal(intent.scriptNumber,40);assert.deepEqual(intent.phones,['+13055550101']);
  const r=await dispatchSavedScriptCommand(f.client,{role:'owner',user_id:'owner'},q,[],requestId,f.deps);
  assert.equal(r.action.status,'submitted',q);assert.equal(r.action.payload.script_id,scriptId);assert.equal(f.dispatches,1);assert.equal(f.tables.daisy_call_scripts.length,1);
 }
 assert.equal(savedScriptIntent('Chat, why did you call +13055550101 using script 40?'),null);
 assert.equal(savedScriptIntent('Chat, do not call +13055550101 using script 40'),null);
 assert.equal(savedScriptIntent('Chat, can Daisy call +13055550101 using script 40?'),null);
});

test('transcription noise before an explicit Daisy call still uses the requested saved script',async()=>{
 const q='Jake Paul Daisy call +1-305-555-0101 you script number 40';const f=fixture();
 const intent=savedScriptIntent(q);assert.equal(intent.scriptNumber,40);assert.deepEqual(intent.phones,['+13055550101']);
 const result=await dispatchSavedScriptCommand(f.client,{role:'owner',user_id:'owner'},q,[],requestId,f.deps);
 assert.equal(result.action.status,'submitted');assert.equal(result.action.payload.script_id,scriptId);assert.equal(f.dispatches,1);assert.equal(f.tables.daisy_call_scripts.length,1);
 for(const text of ['Why did Jake Paul Daisy call +13055550101 using script 40?','He said Daisy call +13055550101 using script 40','Do not let Daisy call +13055550101 using script 40'])assert.equal(savedScriptIntent(text),null,text);
});

test('natural new-client override dispatches the supplied number without consulting CRM history',async()=>{
 const f=fixture(),queries=[],original=f.client.from;f.client.from=t=>{queries.push(t);return original(t);};
 const q='I need you to plus 1305-555-0101 ask for Doug you script 40 and treat me as a new client';
 const intent=savedScriptIntent(q);assert.equal(intent.conversationMode,'new_client');assert.equal(intent.suppliedName,'Doug');
 const r=await dispatchSavedScriptCommand(f.client,{role:'owner',user_id:'owner'},q,[],requestId,f.deps);
 assert.equal(r.action.payload.conversation_mode,'new_client');assert.equal(r.action.payload.recipient.name,'Doug');assert.equal(f.dispatches,1);assert.equal(f.prepared,0);assert.ok(!queries.includes('prephub_leads'));assert.ok(!queries.includes('lead_notes'));
});
test('follow-up with ask-for wording uses saved script 40 and resolves the phone to its client',async()=>{
 const f=fixture(),prepare=f.deps.prepareAction;let ownerArgs;f.deps.prepareAction=async(...args)=>{ownerArgs=args;return prepare(...args);};
 const q='Daisy call +1-305-555-0101 ask for Doug and treat me as a follow-up client';
 assert.equal(savedScriptIntent(q).conversationMode,'follow_up');
 await dispatchSavedScriptCommand(f.client,{role:'owner',user_id:'owner'},q,[],requestId,f.deps);
 assert.equal(f.prepared,1);assert.equal(ownerArgs[2].lead_id,'DPA-EXAMPLE');assert.equal(ownerArgs[3].conversationMode,'follow_up');assert.equal(f.dispatches,1);
 for(const q of ['Call Doug as a new client','Daisy, call Doug as a first-time customer','Call Doug as a follow up','Call Doug as an existing client'])assert.ok(savedScriptIntent(q),q);
 for(const q of ['Why did you treat +13055550101 as a new client using script 40?','Do not call +13055550101 as a new client with script 40'])assert.equal(savedScriptIntent(q),null);
});

test('the customer is Doug wording preserves the spoken name for a fresh call',async()=>{
 const f=fixture(),q='Daisy I need you to call +1-305-555-0101 the customer is Doug go over script number 40 with him and treat him as a new client';
 assert.equal(savedScriptIntent(q).suppliedName,'Doug');const r=await dispatchSavedScriptCommand(f.client,{role:'owner',user_id:'owner'},q,[],requestId,f.deps);assert.equal(r.action.payload.recipient.name,'Doug');assert.match(r.action.payload.content.opening,/Hi, Doug/);assert.equal(f.dispatches,1);
});
