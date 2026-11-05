const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('manager/workflow-dashboard.js','utf8');
test('Call is immediately after Open Work for the three workflow stages and absent in Live Now',()=>{
 const ctx={individualCalls:new Map(),esc:String,expanded:null,expandedGroup:null,timeInStage:()=>'',presence:()=>'',milestone:()=>'',next:()=>'',M:{areas:[],eligible:()=>null},window:{DaisyPreparationQueue:{date:String}}};vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function leadCallCell('),source.indexOf('const activeLiveRows=')),ctx);
 const r={customer:{id:'row',dbId:'exact-uuid',name:'Douglas',leadId:'DPA-123'},login:false,transferred:false,gaps:[]};
 for(const stage of ['new','preparation','dpa']){const html=ctx.clientRow(r,stage);assert.match(html,/<\/small><\/td><td class="pd-call-cell">/);assert.match(html,/data-pd-call="exact-uuid"/);assert.match(html,new RegExp('data-pd-call-stage="'+stage+'"'));assert.equal((html.match(/<td[ >]/g)||[]).length,7);}
 const live=ctx.clientRow(r,'live');assert(!live.includes('data-pd-call='));assert.equal((live.match(/<td[ >]/g)||[]).length,6);
});
test('one click sends exact lead/stage without a confirmation popup and blocks repeat clicks in flight',async()=>{
 const requests=[],ctx={individualCalls:new Map(),crypto:{randomUUID:()=> 'request-id'},render(){},pollLeadCall(){},request:async(a,b)=>{requests.push({a,b});return {call_started:true,script_number:40,action:{id:'action'}};}};vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('async function callLead('),source.indexOf('async function pollLeadCall(')),ctx);
 await ctx.callLead('lead-id','new');await ctx.callLead('lead-id','new');assert.equal(requests.length,1);assert.equal(requests[0].a,'start_lead_call');assert.equal(requests[0].b.lead_id,'lead-id');assert.equal(requests[0].b.expected_stage,'new');assert.equal(ctx.individualCalls.get('lead-id').state,'active');
});
test('an unconfirmed network result reuses the request ID when checking the call',async()=>{
 const ids=[],ctx={individualCalls:new Map(),crypto:{randomUUID:()=> 'same-request'},render(){},pollLeadCall(){},request:async(a,b)=>{ids.push(b.request_id);throw Error('Network unavailable');}};vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('async function callLead('),source.indexOf('async function pollLeadCall(')),ctx);
 await ctx.callLead('lead-id','new');assert.equal(ctx.individualCalls.get('lead-id').state,'review');await ctx.callLead('lead-id','new');assert.deepEqual(ids,['same-request','same-request']);
});
