import {dictatedPhones,normalizeDirectPhone,ownerCallInstruction,ownerCallText} from './direct-number.ts';
import {prepareAction,validatedContent} from './crm-actions.ts';
import {personalizeScript,scriptText} from './call-scripts.ts';
import {executeCurrentCall,immediateCallCommand} from './direct-dispatch.ts';
const check=(r:any)=>{if(r.error)throw Error(r.error.message||'Call request could not be saved');return r.data;};
const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const blocked=(q:string)=>/\b(?:don.t|do not|never|cancel|draft|preview|example|hypothetical|what if|without calling|instead of calling)\b/i.test(q);
export function conversationMode(q:string){
 const fresh=/\b(?:new|first[ -]time|brand[ -]new)\s+(?:client|customer|lead)\b|\b(?:as if|like)\s+(?:i(?:['’]m| am)|they(?:['’]re| are))\s+new\b/i.test(q);
 const follow=/\bfollow[ -]?up(?:\s+(?:client|customer|call))?\b|\b(?:returning|existing)\s+(?:client|customer)\b|\b(?:pick up|continue)\s+(?:where|from)\b/i.test(q);
 return fresh&&!follow?'new_client':follow&&!fresh?'follow_up':null;
}
export function savedScriptNumber(q:string){
 const words:Record<string,number>={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
 const found:number[]=[];
 for(const m of q.matchAll(/\b(?:script|sprint)\s*(?:number\s*|no\.?\s*|#\s*)?/gi)){
  const tail=q.slice(m.index!+m[0].length),numeric=tail.match(/^(\d{1,5})\b/);let value:number|null=null,consumed='';
  if(numeric){value=Number(numeric[1]);consumed=numeric[0];}
  else{let total=0,group=0,seen=false;for(const token of tail.toLowerCase().split(/[ -]+/)){const w=token.replace(/[,.!?].*$/,'');if(Object.hasOwn(words,w)){group+=words[w];seen=true;}else if(w==='and'&&seen&&(group>=100||total>0)){}else if(w==='hundred'&&seen)group*=100;else if(w==='thousand'&&seen){total+=group*1000;group=0;}else break;consumed+=token+' ';}if(seen)value=total+group;}
  if(value!==null&&value>0&&value<=99999){if(/^\s*(?:or|and|maybe|\/)\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty)\b/i.test(tail.slice(consumed.trimEnd().length)))return null;found.push(value);}
 }
 return found.length&&new Set(found).size===1?found[0]:null;
}

// A complete saved-script instruction may survive dictation without the call verb.
// Recognize its intent from the recipient + selected script + requested action/mode,
// instead of requiring one particular assistant address or polite prefix.
export function impliedSavedScriptRequest(question:string){
 const q=ownerCallText(question);
 if(blocked(question)||savedScriptNumber(question)===null||dictatedPhones(question).length!==1)return false;
 if(/^(?:why|how|when|what|which|who|where|did|does|is|was|are|were|has|have|would|should|could|can|will|tell me|explain|check|look|review|if|he said|she said|they said)\b/i.test(q)||/\b(?:said|says|asked|hypothetical|example)\b/i.test(q))return false;
 return !!conversationMode(question)||/\b(?:go (?:over|through)|use|using|run|read|follow|with)\b[\s\S]*\b(?:script|sprint)\b/i.test(q);
}
export function phoneClarification(question:string){
 const phoneOnly=(q:string)=>/^(?:[+\d().,\s-]|\b(?:plus|zero|oh|one|two|three|four|five|six|seven|eight|nine)\b)+$/i.test(ownerCallText(q).replace(/^(?:yes[, ]+)?(?:it['’]s|it is|(?:the|my|that) (?:phone )?number is)\s+/i,'').trim());
 const correction=question.match(/\b(?:that is|i mean|correction|make that|the correct number is)\s+(.+)$/i)?.[1];
 const text=correction&&phoneOnly(correction)?correction:question;
 const phones=dictatedPhones(text);return phoneOnly(text)&&phones.length===1?phones:null;
}
export function savedScriptIntent(question:string,history:any[]=[]){
 const prior=(Array.isArray(history)?history:[]).filter(t=>t?.role==='user'&&typeof t.content==='string').slice(-12);
 const repeat=/^(?:(?:it['’]?s|it is|this is)\s+)?(?:another|one more|repeat the|repeat that)\s+call\b/i.test(question.trim());
 const clarifiedPhones=phoneClarification(question),phoneReply=!!clarifiedPhones;
 const command=ownerCallText(question);let mode=conversationMode(question);if((!ownerCallInstruction(command)&&!repeat&&!phoneReply&&!impliedSavedScriptRequest(question))||blocked(question))return null;
 let number=savedScriptNumber(question);if(number===null&&!mode&&immediateCallCommand(question))return null;let phones=clarifiedPhones||dictatedPhones(question),source=question;
 let priorRequest=false;
 for(let i=prior.length-1;i>=0;i--){const text=prior[i].content;if(blocked(text)||/\b(?:different person|someone else)\b/i.test(text))break;
  const priorPhones=dictatedPhones(text);if(!phones.length&&priorPhones.length&&!/\+\s*\d|\d[\d ().-]{5,}\d/.test(question)){phones=priorPhones;source=text;}
  if(ownerCallInstruction(text)&&(savedScriptNumber(text)!==null||!immediateCallCommand(text))){priorRequest=true;if(number===null)number=savedScriptNumber(text)??40;if(phoneReply&&mode===null)mode=conversationMode(text);break;}
 }
 if((repeat||phoneReply)&&!priorRequest)return null;
 if(number===null)number=40;
 const target=command.replace(/^(?:call|dial|ring)\s+/i,'').split(/\b(?:using|with|use|script|sprint|at)\b/i)[0].replace(/[,.! ]+$/,'').trim();
 const suppliedName=question.match(/\b(?:ask for|customer is|customer(?:['’]s)? name(?: is)?|name is|named)\s+([a-z][a-z'’-]*)/i)?.[1];
 return {scriptNumber:number,phones,phoneSource:source,target:target.replace(/\s+(?:as|and treat|treat|as if)\b[\s\S]*$/i,'').trim(),conversationMode:mode,suppliedName};
}
export async function dispatchSavedScriptCommand(client:any,member:any,question:string,history:any[],requestId:string,deps={prepareAction,executeCurrentCall},resolvedIntent?:any){
 const intent=resolvedIntent||savedScriptIntent(question,history);if(!intent)return null;
 if(member.role!=='owner')throw Error('Owner access required');if(!uuid(requestId))throw Error('A unique call request ID is required');
 const previous=check(await client.from('daisy_crm_actions').select('*').eq('id',requestId).eq('created_by',member.user_id).maybeSingle());
 if(previous){if(previous.payload?.owner_saved_script_request!==question)throw Error('Call request ID already belongs to another instruction');if(previous.status==='draft'&&previous.payload?.saved_script_ready)return deps.executeCurrentCall(client,member,previous,question);return {ok:true,action:previous,answer:previous.provider_id?'That call request has already been placed. The live transcript is available below.':'That request is already being processed. I have not confirmed a new call.'};}
 if(intent.phones.length>1)return {ok:true,answer:'Which of those numbers should I call using script '+intent.scriptNumber+'?'};
 const scripts=check(await client.from('daisy_call_scripts').select('*').eq('script_number',intent.scriptNumber).eq('direction','outbound').is('archived_at',null).is('deleted_at',null));
 if(scripts.length!==1)return {ok:true,answer:'I could not find one active outbound script #'+intent.scriptNumber+'. No call was placed.'};const script=scripts[0];
 let leads:any[]=[];
 if(intent.phones.length){const phone=intent.phones[0],candidates=check(await client.from('prephub_leads').select('*').ilike('phone','%'+phone.slice(-4)).limit(25));leads=candidates.filter((l:any)=>{try{return normalizeDirectPhone(l.phone)===phone;}catch{return false;}});}
 else if(!intent.phones.length&&/^me(?: now| please)?[.! ]*$/i.test(intent.target)){const profile=check(await client.from('manager_members').select('email').eq('user_id',member.user_id).single());if(profile?.email)leads=check(await client.from('prephub_leads').select('*').eq('email',profile.email).limit(3));}
 else if(!intent.phones.length&&/^[a-z][a-z .'’-]{0,80}$/i.test(intent.target)&&!/^(?:him|her|them|the number|that number|again|now)$/i.test(intent.target)){const names=intent.target.split(/\s+/);let query=client.from('prephub_leads').select('*').ilike('first_name',names[0]+'%');if(names.length>1)query=query.ilike('last_name',names.slice(1).join(' '));leads=check(await query.limit(3));}
 if(leads.length!==1&&!intent.phones.length)return {ok:true,answer:leads.length>1?'More than one client matches. Which client should I call using script '+intent.scriptNumber+'?':intent.phones.length?'That number is not linked to a PrepHub client, so I could not load the client context for script '+intent.scriptNumber+'. No call was placed.':'What complete phone number should I call using script '+intent.scriptNumber+'?'};
 const lead=leads.length===1?leads[0]:null;
 let action;
 try{if(!lead){const phone=intent.phones[0],name=intent.suppliedName||(/^[a-z][a-z .'’-]{0,80}$/i.test(intent.target)&&!/^me$/i.test(intent.target)?intent.target:'');let content=personalizeScript({...script.content,script_text:scriptText(script.content)},{first_name:name,last_name:'',lead_id:'',phone,email:''});if(!name){content.opening=String(content.opening).replace(/Hi,?\s*[,.]\s*Congratulations!/i,'Hi. Congratulations!');content.script_text=String(content.script_text).replace(/Hi,?\s*[,.]\s*Congratulations!/i,'Hi. Congratulations!').replace(/I’m sorry\. I should have asked[. —-]*Is this\s+speaking\?/i,'I’m sorry. I should have asked. May I have your first name?');}content=validatedContent('call',content);action=check(await client.from('daisy_crm_actions').insert({id:requestId,created_by:member.user_id,lead_id:null,kind:'call',reason:'Owner requested script #'+script.script_number,payload:{call_mode:'saved_script_phone',conversation_mode:intent.conversationMode,owner_saved_script_request:question,saved_script_ready:true,phone_source:'owner_supplied_conversation',content,script_id:script.id,script_version:script.version,script_sources:[{id:script.id,version:script.version,script_number:script.script_number}],preparation_areas:[],preparation_sections:[],preparation_context:{source:'Owner-requested phone call; no client profile is linked. Do not invent submitted form facts, assistance amounts, preparation needs, welcome delivery or saved progress.',intake:{}},recipient:{kind:'direct_phone',public_id:null,name:name||phone,phone,email:null}},before_value:null}).select('*').single());}else{const prepared=await deps.prepareAction(client,member,{kind:'call',lead_id:lead.lead_id,reason:'Owner requested call using script #'+script.script_number,content:personalizeScript({...script.content,script_text:scriptText(script.content)},lead),saved_script:script,script_category:script.category},{requestId,question,conversationMode:intent.conversationMode});action=prepared.action;}}
 catch(e){const duplicate=check(await client.from('daisy_crm_actions').select('*').eq('id',requestId).eq('created_by',member.user_id).maybeSingle());if(!duplicate||duplicate.payload?.owner_saved_script_request!==question)throw e;if(duplicate.status!=='draft'||!duplicate.payload?.saved_script_ready)return {ok:true,action:duplicate,answer:'That call request is already being processed. No second call was started.'};action=duplicate;}
 if(intent.dispatchGuard)try{await intent.dispatchGuard();}catch(e){await client.from('daisy_crm_actions').update({status:'cancelled'}).eq('id',action.id).eq('created_by',member.user_id).eq('status','draft');throw e;}
 return deps.executeCurrentCall(client,member,action,question);
}
