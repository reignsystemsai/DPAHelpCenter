import assert from 'node:assert/strict';
import {countFacts,contactDecision,callEvidence,seedScripts} from '../supabase/functions/_shared/prephub-flow.ts';

const now=Date.parse('2026-10-15T16:00:00Z'),lead={id:'1',credit_score:606,first_name:'Test',assessment:{credit_640_plus:false}},job={channel:'call',step_key:'welcome_call',created_at:'2026-10-10T16:00:00Z'},pref={voice_permission_verified_at:'2026-10-14T16:00:00Z'};
assert.equal(callEvidence({sequence_status:'Calling',attempts_used:0}),false);
assert.equal(countFacts([lead],[],[{lead_id:'1',direction:'outbound',sequence_status:'Calling',attempts_used:0}],[],[]).counts.no_recorded_outbound_call,1);
assert.equal(countFacts([lead],[],[],[],[]).counts.credit_preparation_needs,1);
assert.equal(countFacts([lead],[{lead_id:'1',archived_at:'2026-10-10'}],[],[],[]).counts.active_clients,0);
assert.equal(contactDecision(job,lead,{},pref,[],[],now).status,'ready');
assert.match(contactDecision(job,lead,{},null,[],[],now).reason,/permission/);
assert.equal(contactDecision(job,lead,{},pref,[{do_not_call:true}],[],now).status,'paused');
assert.equal(contactDecision({...job,channel:'email'},lead,{}, {email_paused:true},[],[],now).status,'paused');
assert.equal(contactDecision(job,lead,{}, {...pref,interested_at:'2026-10-14'},[],[],now).status,'needs_review');
assert.equal(contactDecision(job,lead,{},pref,[{callback_at:'2026-10-16',sequence_status:'Callback Scheduled'}],[],now).status,'needs_review');
assert.equal(contactDecision(job,lead,{},pref,[],[{direction:'inbound',occurred_at:'2026-10-14'}],now).status,'needs_review');
assert.match(contactDecision(job,lead,{},pref,[],[],Date.parse('2026-10-16T02:00:00Z')).reason,/window/);
assert.match(contactDecision(job,lead,{},pref,[],[{direction:'outbound',channel:'email',status:'sent',occurred_at:'2026-10-15T15:00:00Z'}],now).reason,/Spacing/);
assert(seedScripts.every(s=>!s.content.body?.includes('webinar')));
console.log('PASS: count definitions, archive isolation, consent, opt-outs, interest/reply/callback pauses, hours, contact spacing, script-locked call branches.');
