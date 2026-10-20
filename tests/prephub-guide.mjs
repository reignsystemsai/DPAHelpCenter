import {strict as a} from 'node:assert';
import {test} from 'node:test';
import {navigationStatus,normalizePresence,pages} from '../supabase/functions/_shared/prephub-guide.ts';
const now=Date.now(),row=(tab,delta=0)=>({tab,visible:true,seen_at:new Date(now-delta).toISOString()});
test('credit-only client on income is routed to actual Credit Preparation tab',()=>{const s=navigationStatus(['Credit'],[row('income')],now);a.equal(s.redirect_required,true);a.equal(s.recommended_tab,'credit');a.deepEqual(s.allowed_tabs,['credit']);});
test('DTI-only client on credit is routed to Income & DTI',()=>{const s=navigationStatus(['DTI'],[row('credit')],now);a.equal(s.redirect_required,true);a.equal(pages[s.recommended_tab].label,'Income & DTI');});
test('another needed page is allowed without unnecessary redirection',()=>{a.equal(navigationStatus(['Credit','DTI'],[row('income')],now).redirect_required,false);});
test('stale, hidden and future page evidence cannot be presented as live',()=>{for(const r of [row('credit',45001),{...row('credit'),visible:false},row('credit',-1000)])a.equal(navigationStatus(['Credit'],[r],now).page_status,'unavailable');});
test('different open visible tabs require a page-heading question',()=>{const s=navigationStatus(['Credit'],[row('income'),row('credit')],now);a.equal(s.page_status,'ambiguous');a.equal(s.current_page,null);});
test('telemetry drops financial values and unknown subsections',()=>{const s=normalizePresence({tab:'credit',session_id:'12345678-1234-1234-1234-123456789012',panel:'SSN',visible:true,income:65000,password:'secret'});a.equal(s.panel,null);a.deepEqual(Object.keys(s).sort(),['panel','session_id','tab','visible']);a.throws(()=>normalizePresence({tab:'admin',session_id:'bad',visible:true}));});
test('tax filing guidance stays separate from document upload completion',()=>{a.deepEqual(navigationStatus(['Taxes'],[],now).allowed_tabs,['documents']);});

import {preparationAreas} from '../supabase/functions/_shared/call-scripts.ts';
test('existing job intake alias routes work-history preparation',()=>{a.deepEqual(preparationAreas({focus_areas:['job']}),['Work History']);a.equal(navigationStatus(preparationAreas({focus_areas:['job']}),[row('income')],now).recommended_tab,'employment');});
