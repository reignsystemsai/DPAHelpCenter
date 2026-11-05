import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {dispatchOwnerCallRequest} from '../functions/_shared/owner-call-request.ts';
import {dispatchSavedScriptCommand} from '../functions/_shared/saved-script-dispatch.ts';
import {understandOwnerCall} from '../functions/_shared/owner-call-understanding.ts';

// In-memory PostgREST boundary; no telephone provider or real client is contacted.
import {database} from './call-test-database.mjs';
const owner={user_id:randomUUID(),role:'owner'},conversation=randomUUID();
const pending={request_id:randomUUID(),kind:'saved_script',script_number:40,phone:'+16892828783',target:'Douglas Thompson',awaiting_field:'recipient',turns:['Call Douglas Thompson using script 40','Douglas Thompson +16892828783']};
function seeded(){return database({daisy_owner_call_requests:[{owner_id:owner.user_id,conversation_id:conversation,request_id:pending.request_id,request:pending,status:'awaiting_details',version:1,expires_at:new Date(Date.now()+600000).toISOString(),updated_at:new Date().toISOString()}]});}
const body=q=>({request_id:randomUUID(),conversation_id:conversation,question:q});
const latest={intent:'call',command:'Call the latest lead using script 40',selection:'latest_global',clarification:''};
test('newest-lead meaning supersedes the old duplicate phone lookup',async()=>{
 const db=seeded();let dispatched;
 const result=await dispatchOwnerCallRequest(db,owner,body('Daisy call the most recently that just came in using script number 40'),{understand:async()=>latest,saved:async(...args)=>{dispatched=args[6];return {answer:'Calling',action:{status:'submitted'}};}});
 assert.equal(result.pending,false);assert.equal(dispatched.scriptNumber,40);assert.deepEqual(dispatched.phones,[]);assert.equal(dispatched.recipientSelection,'latest_global');
});
test('uncertain speech asks confirmation, yes continues with the same script, retry cannot dial twice',async()=>{
 const db=seeded();let calls=0,seenProposal;
 const clarify={intent:'clarify',command:latest.command,selection:'latest_global',clarification:'Just so I make sure I understand you correctly, are you asking me to call the newest lead using script 40?'};
 const deps={understand:async(q,p)=>{if(q==='Yes'){seenProposal=p.confirmation_command;return latest;}return clarify;},saved:async()=>{calls++;return {answer:'Calling',action:{status:'submitted'}};}};
 const first=await dispatchOwnerCallRequest(db,owner,body('the newest leak'),deps);assert.equal(first.pending,true);assert.match(first.answer,/understand you correctly/);assert.equal(calls,0);
 const confirmation=body('Yes');await dispatchOwnerCallRequest(db,owner,confirmation,deps);assert.equal(seenProposal,latest.command);assert.equal(calls,1);
 await dispatchOwnerCallRequest(db,owner,confirmation,deps);assert.equal(calls,1);
});
test('unrelated questions never dispatch a pending call',async()=>{
 const db=seeded();const r=await dispatchOwnerCallRequest(db,owner,body('What script do you use for new clients?'),{understand:async()=>({intent:'other',command:'',selection:'unchanged',clarification:''}),saved:()=>assert.fail('must not dial')});assert.equal(r,null);
});
test('cancelled interpretation cannot dispatch',async()=>{
 const db=seeded();const r=await dispatchOwnerCallRequest(db,owner,body('No, cancel that'),{understand:async()=>({intent:'cancel',command:'',selection:'unchanged',clarification:''}),saved:()=>assert.fail('must not dial')});assert.match(r.answer,/cancelled/);assert.equal(db.tables.daisy_owner_call_requests[0].status,'cancelled');
});
test('interpretation outage asks rather than rejects or dials',async()=>{
 const r=await dispatchOwnerCallRequest(seeded(),owner,body('the newest lead'),{understand:async()=>{throw Error('network');},saved:()=>assert.fail('must not dial')});assert.equal(r.pending,true);assert.match(r.answer,/understand you correctly/);
});
test('invented phone digits cannot dispatch',async()=>{
 const r=await dispatchOwnerCallRequest(seeded(),owner,body('the newest lead'),{understand:async()=>({...latest,command:'Call +13055551234 using script 40'}),saved:()=>assert.fail('must not dial')});assert.equal(r.pending,true);
});
test('global newest selection queries creation time directly despite old phone',async()=>{
 const db=database({daisy_call_scripts:[{id:'script',script_number:40,direction:'outbound',content:{script_text:'Hello'},version:1}],prephub_leads:[{id:'old',lead_id:'old',created_at:'2026-11-01',phone:'+16892828783'},{id:'new',lead_id:'new',created_at:'2026-11-05',phone:'+13055551234'}]});let selected;
 await dispatchSavedScriptCommand(db,owner,latest.command,[],randomUUID(),{prepareAction:async(c,m,args)=>{selected=args.lead_id;return {action:{id:'a'}};},executeCurrentCall:async()=>({ok:true})},{scriptNumber:40,phones:['+16892828783'],target:'the latest lead',recipientSelection:'latest_global'});
 assert.equal(selected,'new');assert.deepEqual(db.queries.find(q=>q.table==='prephub_leads').sort,[['created_at',false],['id',false]]);
});
test('structured model request includes pending proposal and conversational context',async()=>{
 let payload;const r=await understandOwnerCall('Yes',{...pending,confirmation_command:latest.command},[{role:'assistant',content:'Are you asking me to call the newest lead?'}],{key:'test',model:'gpt-6.1-sol',fetch:async(url,opts)=>{payload=JSON.parse(opts.body);return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(latest)}]}]});}});
 assert.equal(r.intent,'call');assert.equal(payload.text.format.strict,true);assert.match(payload.input[0].content,/confirmation_command/);assert.match(payload.instructions,/Understand meaning/);
});
