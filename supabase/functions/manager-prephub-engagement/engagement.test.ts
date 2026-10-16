import {engagementFor} from './engagement.ts';
const lead={id:'a'},base={communications:[],calls:[],documents:[],reports:[],preferences:[]},at='2026-10-16T00:00:00Z';
const assert=(v:boolean)=>{if(!v)throw Error('Assertion failed');};
Deno.test('Welcome sent, missed call, voicemail and another client do not imply engagement',()=>{
 for(const data of [{communications:[{lead_id:'a',direction:'outbound',channel:'email',status:'sent',occurred_at:at}]},{calls:[{lead_id:'a',last_call_result:'no_answer',last_call_at:at}]},{calls:[{lead_id:'a',last_call_result:'completed',last_call_at:at}]},{documents:[{lead_id:'b',state:'saved',saved_at:at}]}])assert(!engagementFor(lead,{...base,...data}).engaged);
});
Deno.test('Reply, answered call, upload, callback and sign-in create engagement',()=>{
 for(const data of [{communications:[{lead_id:'a',direction:'inbound',occurred_at:at}]},{calls:[{lead_id:'a',last_call_result:'answered',last_call_at:at}]},{documents:[{lead_id:'a',state:'saved',saved_at:at}]},{reports:[{lead_id:'a',created_at:at}]},{preferences:[{lead_id:'a',callback_requested_at:at}]}])assert(engagementFor(lead,{...base,...data}).engaged);
 assert(engagementFor({...lead,claimed_at:at},base).engaged);
});
Deno.test('Draft upload is not engagement, latest evidence wins',()=>{
 assert(!engagementFor(lead,{...base,documents:[{lead_id:'a',state:'pending',created_at:at}]}).engaged);
 assert(engagementFor({...lead,claimed_at:'2026-10-01T00:00:00Z'},{...base,reports:[{lead_id:'a',created_at:at}]}).reason==='Credit report uploaded');
});
