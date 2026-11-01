import {dictatedPhones,ownerCallInstruction,ownerCallText} from './direct-number.ts';
import {latestLeadRequested,conversationMode,savedScriptNumber,impliedSavedScriptRequest,phoneClarification,dispatchSavedScriptCommand} from './saved-script-dispatch.ts';
import {dispatchDirectCommand} from './direct-dispatch.ts';
const TABLE='daisy_owner_call_requests';
const uuid=(x:any)=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const data=(r:any)=>{if(r.error)throw Error(r.error.message||'Could not save the pending call request');return r.data;};
export const callScope=(x:any)=>uuid(x)?x:'legacy';
export function callSlots(question:string){
 const q=ownerCallText(question),cancel=/^(?:cancel|forget|do not (?:call|dial)|don.t (?:call|dial)|never call|stop calling)\b/i.test(q);
 const readOnly=/^(?:why|how|what|when|where|which|who|did|does|is|was|are|were|has|have|can|could|should|would|will|explain|check|look|review|show|list|display|open|describe|summarize|read|if|he said|she said|they said)\b/i.test(q)||/\b(?:preview|draft|example|hypothetical|pretend|imagine|without calling)\b/i.test(q)||/^["“”'‘’]/.test(q)||/^(?:you|she|he|they)\s+(?:called|used|said|asked)\b/i.test(q);
 const selected=savedScriptNumber(question),phoneReply=phoneClarification(question),phones=phoneReply||dictatedPhones(question),mode=conversationMode(question);
 const custom=q.match(/\b(?:tell|say|message|let\s+.{0,30}?know|ask(?!\s+for\b))\b[\s\S]*$/i)?.[0]||null;
 const customMessage=custom&&custom.replace(/^(?:tell|ask|message)(?:\s+(?:them|him|her|the customer))?\b|^say\b|^let\s+.{0,30}?know\b/i,'').trim()?custom:null;
 const start=!readOnly&&!cancel&&(ownerCallInstruction(question)||impliedSavedScriptRequest(question)||/^(?:another|one more|repeat that|repeat the)\s+call\b/i.test(q));
 const reference=/^(?:(?:another|one more|repeat (?:that|the))\s+call|(?:call|dial|ring)\s+(?:again|him|her|them|back)\b)/i.test(q);
 const name=question.match(/\b(?:ask for|customer is|customer(?:['’]?s)? name(?: is)?|name is|named)\s+([a-z][a-z'’-]*)/i)?.[1]||null;
 const target=q.replace(/^(?:call|dial|ring)\s+/i,'').split(/\b(?:at|using|with|use|script|sprint|and|as|tell|say|ask|message|treat)\b/i)[0].replace(/[,.! ]+$/,'').trim();
 const phoneHint=phones.length>0||/\+\s*\d|\bplus\b|\d[\d ().-]{5,}\d/.test(question);
 const scriptMention=/\b(?:script|sprint)\b/i.test(q);
 return {question,q,cancel,readOnly,start,reference,phones,phoneReply:!!phoneReply,mode,name,target,phoneHint,scriptMention,scriptNumber:selected,custom,customMessage};
}
export function reduceCallRequest(previous:any,question:string,newRequestId:string){
 const x=callSlots(question);if(x.readOnly)return null;
 if(x.cancel)return previous?{...previous,cancelled:true}:null;
 const scriptReply=previous?.kind==='saved_script'&&(!previous.script_number||previous.awaiting_field==='script')?savedScriptNumber('script '+x.q):null;
 const selection=previous?.candidates?.length>1?question.trim().match(/^(?:the )?(first|second|last)(?: (?:one|number))?[.! ]*$/i):null;
 const latestCorrection=!!previous&&previous.kind==='saved_script'&&!previous.phone&&!previous.phone_required&&/\b(?:last|latest|newest|most[ -]recent)\b/i.test(previous.target||'')&&/^(?:(?:as|a|the|last|latest|newest)\s+)?(?:lead|client|customer)[.! ]*$/i.test(x.q);
 const nameReply=!!previous&&(!previous.target||previous.awaiting_field==='recipient')&&!previous.phone&&/^[a-z][a-z .'’-]{0,60}$/i.test(x.q);
 const clarifying=!!previous&&(latestCorrection||!!scriptReply||!!selection||nameReply||x.phones.length>0||previous.awaiting_field==='phone'&&x.phoneHint||x.phoneReply||x.scriptMention||!!x.mode||!!x.name||previous.kind==='custom'&&!previous.message);
 if(!x.start&&!clarifying)return null;
 const fresh=x.start&&!previous;let p:any=previous?structuredClone(previous):{request_id:newRequestId,kind:'saved_script',script_number:40,phone:null,target:'',name:null,mode:null,message:null,phone_required:false,turns:[]};
 if(x.start&&latestLeadRequested(question)&&!x.phoneHint){p.phone=null;p.phone_required=false;p.candidates=[];p.name=null;}
 if(x.start){p.target=x.target||p.target;p.name=x.name||p.name;if(x.phoneHint){p.phone=null;p.phone_required=true;}if(x.scriptMention){p.kind='saved_script';p.script_number=x.scriptNumber;}else if(x.custom){p.kind='custom';p.script_number=null;p.message=x.customMessage;}else if(fresh)p.script_number=40;}
 if(scriptReply){p.kind='saved_script';p.script_number=scriptReply;}
 if(selection){p.phone=p.candidates[selection[1].toLowerCase()==='first'?0:selection[1].toLowerCase()==='second'?1:p.candidates.length-1];p.candidates=[];p.phone_required=false;}
 if(latestCorrection){p.target='the last lead';p.phone=null;p.phone_required=false;p.candidates=[];}
 if(nameReply&&!latestCorrection)p.target=x.q;
 if(!x.phones.length&&x.phoneHint){p.phone=null;p.phone_required=true;}
 if(x.phones.length===1){p.phone=x.phones[0];p.candidates=[];p.phone_required=false;}else if(x.phones.length>1){p.phone=null;p.candidates=x.phones;p.phone_required=true;}
 if(x.scriptMention){p.kind='saved_script';p.script_number=x.scriptNumber;}
 if(x.mode)p.mode=x.mode;if(x.name)p.name=x.name;
 if(p.kind==='custom'&&!p.message&&!x.phoneReply&&!x.start)p.message=question;
 p.turns=[...(p.turns||[]),question].slice(-12);p.last_turn_id=newRequestId;
 return p;
}
export async function cancelOwnerCallRequest(client:any,member:any,conversationId?:string){
 return data(await client.from(TABLE).update({status:'cancelled',updated_at:new Date().toISOString()}).eq('owner_id',member.user_id).eq('conversation_id',callScope(conversationId)).in('status',['awaiting_details','dispatching']).select('owner_id')).length>0;
}
async function actionReply(client:any,member:any,id:string,answer?:string){const action=data(await client.from('daisy_crm_actions').select('*').eq('id',id).eq('created_by',member.user_id).maybeSingle());return {ok:true,action:action||undefined,answer:answer||(action?.provider_id?'That call request has already been placed. Its transcript is available below.':'That call request is already being processed; no additional call was started.'),request_id:id};}
export async function dispatchOwnerCallRequest(client:any,member:any,body:any,deps={saved:dispatchSavedScriptCommand,custom:dispatchDirectCommand}){
 if(member.role!=='owner')return null;if(!uuid(body.request_id))throw Error('A unique call request ID is required');
 const question=String(body.question||'').trim(),slots=callSlots(question);if(slots.readOnly)return null;
 // A retried turn can never dispatch another copy of its existing action.
 const existing=data(await client.from('daisy_crm_actions').select('id').eq('id',body.request_id).eq('created_by',member.user_id).maybeSingle());if(existing)return actionReply(client,member,existing.id);
 const ledger=data(await client.from('daisy_owner_call_turns').select('*').eq('owner_id',member.user_id).eq('turn_id',body.request_id).maybeSingle());if(ledger){const oldAction=data(await client.from('daisy_crm_actions').select('id').eq('id',ledger.request_id).eq('created_by',member.user_id).maybeSingle());return actionReply(client,member,ledger.request_id,oldAction?undefined:ledger.status==='done'?ledger.answer:undefined);}
 const scope=callScope(body.conversation_id),row=data(await client.from(TABLE).select('*').eq('owner_id',member.user_id).eq('conversation_id',scope).maybeSingle());
 if(row&&((row.request?.turn_ids||[]).includes(body.request_id)||row.request_id===body.request_id)&&row.status!=='awaiting_details')return actionReply(client,member,row.request_id,row.status==='submitted'?undefined:row.request?.last_answer);
 const alive=row&&Date.parse(row.expires_at)>Date.now();
 if(row?.status==='dispatching'&&alive&&Date.now()-Date.parse(row.updated_at)>90000){
  const old=data(await client.from('daisy_crm_actions').select('*').eq('id',row.request_id).eq('created_by',member.user_id).maybeSingle());let settled:string|null=null;
  if(old?.provider_id||old&&['submitted','completed'].includes(old.status))settled='submitted';
  else if(!old||['failed','needs_review','cancelled'].includes(old.status))settled='failed';
  else if(old.status==='draft'){const cancelled=data(await client.from('daisy_crm_actions').update({status:'cancelled'}).eq('id',old.id).eq('created_by',member.user_id).eq('status','draft').select('id'));if(cancelled.length===1)settled='failed';}
  if(settled){const fixed=data(await client.from(TABLE).update({status:settled}).eq('owner_id',member.user_id).eq('conversation_id',scope).eq('version',row.version).eq('status','dispatching').select('owner_id'));if(fixed.length===1)row.status=settled;}
 }
 const pending=alive&&row.status==='awaiting_details'?row.request:null;
 if(row?.status==='dispatching'&&alive&&!slots.cancel)return actionReply(client,member,row.request_id);
 if(slots.cancel){if(row&&['awaiting_details','dispatching'].includes(row.status)){await cancelOwnerCallRequest(client,member,scope);return {ok:true,answer:'The pending call request is cancelled.'};}return null;}
 const previous=pending||(slots.start&&slots.reference&&alive&&row?.status==='submitted'?{...row.request,request_id:body.request_id,turns:[],turn_ids:[]}:null);
 const next=reduceCallRequest(previous,question,body.request_id);if(!next){if(slots.phoneReply)return {ok:true,answer:'There is no active pending call in this conversation. Tell me who to call and which script to use.'};return null;}
 const turn=await client.from('daisy_owner_call_turns').insert({owner_id:member.user_id,turn_id:body.request_id,conversation_id:scope,request_id:next.request_id,status:'processing'});if(turn.error?.code==='23505')return actionReply(client,member,next.request_id);if(turn.error)throw Error(turn.error.message);
 const remember=async(answer:string)=>{data(await client.from('daisy_owner_call_turns').update({status:'done',answer}).eq('owner_id',member.user_id).eq('turn_id',body.request_id));return answer;};
 next.turn_ids=[...(previous?.turn_ids||[]),body.request_id].slice(-20);
 const stamp=new Date().toISOString(),version=(row?.version||0)+1,record={owner_id:member.user_id,conversation_id:scope,request_id:next.request_id,request:next,status:'awaiting_details',version,updated_at:stamp,expires_at:new Date(Date.now()+30*60000).toISOString()};
 const write=row?client.from(TABLE).update(record).eq('owner_id',member.user_id).eq('conversation_id',scope).eq('version',row.version).select('*'):client.from(TABLE).insert(record).select('*');
 const saved=await write;if(saved.error?.code==='23505')return {ok:true,answer:'Your call request is being processed. No additional call was started.'};const stored=data(saved);if(stored.length!==1)return {ok:true,answer:'Your call request is already being updated. No additional call was started.'};
 let answer:string|null=null;
 if(next.kind==='saved_script'&&!next.script_number)answer='Which saved script number should I use? I’m keeping the recipient and call details.';
 else if(next.phone_required||next.candidates?.length>1)answer='What complete phone number should I call? I’m keeping the script and call details.';
 else if(next.kind==='custom'&&!next.message)answer='What would you like Daisy to say on this call?';
 else if(!next.phone&&!next.target)answer='Who should I call, or what complete phone number should I use?';
 else if(next.kind==='custom'&&!next.phone)answer='What complete phone number should I call? I’m keeping your message.';
 if(answer){next.awaiting_field=!next.script_number&&next.kind==='saved_script'?'script':next.kind==='custom'&&!next.message?'message':'phone';data(await client.from(TABLE).update({request:{...next,last_answer:answer}}).eq('owner_id',member.user_id).eq('conversation_id',scope).eq('version',version));await remember(answer);return {ok:true,answer,request_id:next.request_id,pending:true};}
 const claimed=data(await client.from(TABLE).update({status:'dispatching'}).eq('owner_id',member.user_id).eq('conversation_id',scope).eq('version',version).eq('status','awaiting_details').select('request_id'));if(claimed.length!==1)return {ok:true,answer:'That call request is already being processed. No additional call was started.'};
 try{
  const dispatchGuard=async()=>{const current=data(await client.from(TABLE).select('status,version,request_id').eq('owner_id',member.user_id).eq('conversation_id',scope).maybeSingle());if(current?.status!=='dispatching'||current.version!==version||current.request_id!==next.request_id)throw Error('The pending call was cancelled or replaced before dialing');};
  let result:any;
  if(next.kind==='saved_script')result=await deps.saved(client,member,question,[],next.request_id,undefined,{scriptNumber:next.script_number,phones:next.phone?[next.phone]:[],phoneSource:next.turns.join('\n'),target:next.target||'',suppliedName:next.name,conversationMode:next.mode,dispatchGuard});
  else result=await deps.custom(client,member,'Call '+next.phone+'. '+(next.name?'Ask for '+next.name+'. ':'')+next.message,next.request_id,next.phone,dispatchGuard);
  if(!result.action)next.awaiting_field=/could not find one active outbound script/i.test(result.answer||'')?'script':/more than one client/i.test(result.answer||'')?'recipient':'phone';
  const state=result.action?(['submitted','executing','completed'].includes(result.action.status)?'submitted':'failed'):'awaiting_details';
  data(await client.from(TABLE).update({status:state,request:{...next,last_answer:result.answer},updated_at:new Date().toISOString()}).eq('owner_id',member.user_id).eq('conversation_id',scope).eq('version',version));await remember(result.answer);return {...result,request_id:next.request_id,pending:state==='awaiting_details'};
 }catch(e){const message=e instanceof Error?e.message:'Call dispatch could not be confirmed';data(await client.from(TABLE).update({status:'failed',request:{...next,last_answer:'Call not confirmed: '+message}}).eq('owner_id',member.user_id).eq('conversation_id',scope).eq('version',version));throw e;}
}
