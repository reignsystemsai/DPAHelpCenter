import {dictatedPhones} from './direct-number.ts';
export function commandHistory(history:any[]=[]){return (Array.isArray(history)?history:[]).filter(t=>['user','assistant'].includes(t?.role)&&typeof t.content==='string').slice(-60).map(t=>({role:t.role,content:t.content.trim().slice(0,3000)}));}
export function recentOwnerCallContext(history:any[]=[]){
 const owner=commandHistory(history).filter(t=>t.role==='user');
 for(let i=owner.length-1;i>=0;i--){const text=owner[i].content;
  if(/\b(?:cancel|don.t call|do not call|never call|different person|someone else)\b/i.test(text))return null;
  const numbers=dictatedPhones(text);
  if(numbers.length)return numbers.length===1?{phone:numbers[0],owner_words:text,subsequent_owner_instructions:owner.slice(i+1).map(t=>t.content)}:null;
 }
 return null;
}
export async function beginCommandAudit(client:any,member:any,body:any){
 const history=commandHistory(body.history),requestId=typeof body.request_id==='string'?body.request_id.slice(0,80):null;
 const row=await client.from('integration_events').insert({integration:'daisy_manager',event_type:'owner_command',status:'pending',external_id:requestId,request_payload:{manager_user_id:member.user_id,question:String(body.question||'').slice(0,4000),history},response_payload:{},error_message:'',attempted_at:new Date().toISOString()}).select('id').single();
 if(row.error)console.error('Daisy command audit could not start',row.error.code||'database_error');
 return async (data:any,toolErrors:any[]=[])=>{
  if(row.error||!row.data)return false;
  const errors=toolErrors.map(e=>({tool:String(e.tool||'').slice(0,100),error:String(e.error||'').slice(0,1500)}));
  const outcomes=(data.action_drafts||[]).map((a:any)=>({id:a.id,status:a.status,provider_id:a.provider_id||null,summary:a.result?.summary||null}));
  const failed=!!data.error||errors.length>0||outcomes.some((a:any)=>['needs_review','failed'].includes(a.status));
  const saved=await client.from('integration_events').update({status:failed?'failed':'succeeded',response_payload:{answer:data.answer||null,error:data.error||null,tool_errors:errors,action_outcomes:outcomes},error_message:data.error||errors.map(e=>e.error).join('; ').slice(0,3000),updated_at:new Date().toISOString()}).eq('id',row.data.id);
  if(saved.error)console.error('Daisy command audit could not finish',saved.error.code||'database_error');
  return !saved.error;
 };
}
