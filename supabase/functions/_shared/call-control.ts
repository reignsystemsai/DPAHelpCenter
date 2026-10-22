import {applyCallResult} from './action-results.ts';
const check=(r:any)=>{if(r.error)throw Error(r.error.message||'Call state unavailable');return r.data;};
const ended=(s:string)=>['completed','failed','canceled','busy','no-answer'].includes(s);
export function stopCallCommand(q:string){return !/\b(?:don.t|do not|never|how|why)\b/i.test(q)&&/\b(?:end|stop|hang up|disconnect|cancel)\s+(?:(?:the|that|this|last|current|active|phone|all)\s+)*(?:call|calls)\b|\bhang up(?: now)?[.! ]*$/i.test(q);}
export async function stopOwnerCalls(client:any,member:any,question:string,actionId?:string){
 if(member.role!=='owner'||!stopCallCommand(question))throw Error('Explicit owner hang-up command required');
 let query=client.from('daisy_crm_actions').select('*').eq('created_by',member.user_id).eq('kind','call');
 query=actionId?query.eq('id',actionId):query.in('status',['executing','submitted']);
 const calls=check(await query.order('created_at',{ascending:false}).limit(20));
 if(!calls.length)return {answer:'There are no active calls to end.',actions:[]};
 if(calls.length>1&&!/\ball\b/i.test(question)&&!actionId)return {answer:'There is more than one active call. Tell me which call to end, or say end all calls.',actions:[]};
 const actions=[];for(const call of calls){
  if(!['executing','submitted','needs_review'].includes(call.status)){actions.push(call);continue;}
  // Every provider call is limited to 300 seconds at dispatch. A much older
  // no-SID claim is a stale request, not evidence of an ongoing conversation.
  const expired=!call.provider_id&&Date.parse(call.created_at)<Date.now()-600000;
  let saved;
  if(expired)saved=check(await client.from('daisy_crm_actions').update({status:'cancelled',result:{...call.result,call_status:'canceled',owner_requested_stop:true,stale_dispatch_cleared:true,summary:'Owner canceled a stale dispatch after the configured call limit. No provider call identity or completed conversation was recorded.'},updated_at:new Date().toISOString()}).eq('id',call.id).eq('updated_at',call.updated_at).select('*').single());
  else {
   const r=await fetch('https://helux-ai-workforce.onrender.com/api/v1/manager/calls/'+call.id+'/stop',{method:'POST',headers:{'x-helux-key':Deno.env.get('HELUX_API_KEY')||''},signal:AbortSignal.timeout(15000)});
   const data=await r.json().catch(()=>({}));if(!r.ok||!ended(data.status))throw Error(data.error||'The calling provider has not confirmed hang-up. The call is not marked ended.');
   await applyCallResult(client,{...data,action_id:call.id});saved=check(await client.from('daisy_crm_actions').select('*').eq('id',call.id).single());
  }actions.push(saved);
 }
 return {answer:actions.every(a=>a.result?.stale_dispatch_cleared)?'The stale call request is canceled. No active provider call was recorded. You can request a new call now.':actions.length===1?'The provider confirmed the call has ended. You can request a new call now.':'The selected calls have ended. You can request a new call now.',actions};
}
export const stopCallTool={type:'function',name:'end_owner_call',description:'End an owner-requested active phone call. Use the current explicit hang-up command; no new script or extra approval is required.',parameters:{type:'object',properties:{owner_request:{type:'string'},action_id:{type:['string','null']}},required:['owner_request','action_id'],additionalProperties:false},strict:true};
