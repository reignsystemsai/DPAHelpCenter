import {dictatedPhones,normalizeDirectPhone,ownerCallInstruction,ownerCallText} from './direct-number.ts';
import {prepareAction,validatedContent} from './crm-actions.ts';
import {personalizeScript,scriptText} from './call-scripts.ts';
import {executeCurrentCall,immediateCallCommand} from './direct-dispatch.ts';
const check=(r:any)=>{if(r.error)throw r.error;return r.data;};
const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const blocked=(q:string)=>/\b(?:don.t|do not|never|cancel|draft|preview|example|hypothetical|what if|without calling|instead of calling)\b/i.test(q);
export function savedScriptNumber(q:string){const words:Record<string,number>={forty:40,'forty one':41,'forty two':42,'forty three':43,'forty four':44};const found=[...q.matchAll(/\b(?:script|sprint)\s*(?:number\s*|no\.?\s*|#\s*)?(\d{1,5}\b|forty(?:[ -](?:one|two|three|four))?\b)/gi)].map(m=>/^\d/.test(m[1])?Number(m[1]):words[m[1].toLowerCase().replace('-',' ')]);return new Set(found).size===1?found[0]:null;}
export function savedScriptIntent(question:string,history:any[]=[]){
 const prior=(Array.isArray(history)?history:[]).filter(t=>t?.role==='user'&&typeof t.content==='string').slice(-12);
 const repeat=/^(?:(?:it['’]?s|it is|this is)\s+)?(?:another|one more|repeat the|repeat that)\s+call\b/i.test(question.trim());
 const phoneReply=/^[+\d().\s-]+$/.test(question.trim())&&dictatedPhones(question).length===1;
 const command=ownerCallText(question);if((!ownerCallInstruction(command)&&!repeat&&!phoneReply)||blocked(question))return null;
 let number=savedScriptNumber(question);if(number===null&&immediateCallCommand(question))return null;let phones=dictatedPhones(question),source=question;
 let priorRequest=false;
 for(let i=prior.length-1;i>=0;i--){const text=prior[i].content;if(blocked(text)||/\b(?:different person|someone else)\b/i.test(text))break;
  const priorPhones=dictatedPhones(text);if(!phones.length&&priorPhones.length&&!/\+\s*\d|\d[\d ().-]{5,}\d/.test(question)){phones=priorPhones;source=text;}
  if(ownerCallInstruction(text)&&savedScriptNumber(text)!==null){priorRequest=true;if(number===null)number=savedScriptNumber(text);break;}
 }
 if((repeat||phoneReply)&&!priorRequest)return null;
 if(number===null)number=40;
 const target=command.replace(/^(?:call|dial|ring)\s+/i,'').split(/\b(?:using|with|use|script|sprint|at)\b/i)[0].replace(/[,.! ]+$/,'').trim();
 return {scriptNumber:number,phones,phoneSource:source,target};
}
export async function dispatchSavedScriptCommand(client:any,member:any,question:string,history:any[],requestId:string,deps={prepareAction,executeCurrentCall}){
 const intent=savedScriptIntent(question,history);if(!intent)return null;
 if(member.role!=='owner')throw Error('Owner access required');if(!uuid(requestId))throw Error('A unique call request ID is required');
 const previous=check(await client.from('daisy_crm_actions').select('*').eq('id',requestId).eq('created_by',member.user_id).maybeSingle());
 if(previous){if(previous.payload?.owner_saved_script_request!==question)throw Error('Call request ID already belongs to another instruction');if(previous.status==='draft'&&previous.payload?.saved_script_ready)return deps.executeCurrentCall(client,member,previous,question);return {ok:true,action:previous,answer:previous.provider_id?'That call request has already been placed. The live transcript is available below.':'That request is already being processed. I have not confirmed a new call.'};}
 if(intent.phones.length>1)return {ok:true,answer:'Which of those numbers should I call using script '+intent.scriptNumber+'?'};
 const scripts=check(await client.from('daisy_call_scripts').select('*').eq('script_number',intent.scriptNumber).eq('direction','outbound').is('archived_at',null).is('deleted_at',null));
 if(scripts.length!==1)return {ok:true,answer:'I could not find one active outbound script #'+intent.scriptNumber+'. No call was placed.'};const script=scripts[0];
 let leads:any[]=[];
 if(intent.phones.length){const phone=intent.phones[0],candidates=check(await client.from('prephub_leads').select('*').ilike('phone','%'+phone.slice(-4)).limit(25));leads=candidates.filter((l:any)=>{try{return normalizeDirectPhone(l.phone)===phone;}catch{return false;}});}
 else if(/^me(?: now| please)?[.! ]*$/i.test(intent.target)){const profile=check(await client.from('manager_members').select('email').eq('user_id',member.user_id).single());if(profile?.email)leads=check(await client.from('prephub_leads').select('*').eq('email',profile.email).limit(3));}
 else if(/^[a-z][a-z .'’-]{0,80}$/i.test(intent.target)&&!/^(?:him|her|them|the number|that number|again|now)$/i.test(intent.target)){const names=intent.target.split(/\s+/);let query=client.from('prephub_leads').select('*').ilike('first_name',names[0]+'%');if(names.length>1)query=query.ilike('last_name',names.slice(1).join(' '));leads=check(await query.limit(3));}
 if(leads.length!==1&&!intent.phones.length)return {ok:true,answer:leads.length>1?'More than one client matches. Which client should I call using script '+intent.scriptNumber+'?':intent.phones.length?'That number is not linked to a PrepHub client, so I could not load the client context for script '+intent.scriptNumber+'. No call was placed.':'What complete phone number should I call using script '+intent.scriptNumber+'?'};
 const lead=leads.length===1?leads[0]:null;
 let action;
 try{if(!lead){const phone=intent.phones[0],name=/^[a-z][a-z .'’-]{0,80}$/i.test(intent.target)&&!/^me$/i.test(intent.target)?intent.target:'';let content=personalizeScript({...script.content,script_text:scriptText(script.content)},{first_name:name,last_name:'',lead_id:'',phone,email:''});if(!name){content.opening=String(content.opening).replace(/Hi,?\s*[,.]\s*Congratulations!/i,'Hi. Congratulations!');content.script_text=String(content.script_text).replace(/Hi,?\s*[,.]\s*Congratulations!/i,'Hi. Congratulations!').replace(/I’m sorry\. I should have asked[. —-]*Is this\s+speaking\?/i,'I’m sorry. I should have asked. May I have your first name?');}content=validatedContent('call',content);action=check(await client.from('daisy_crm_actions').insert({id:requestId,created_by:member.user_id,lead_id:null,kind:'call',reason:'Owner requested script #'+script.script_number,payload:{call_mode:'saved_script_phone',owner_saved_script_request:question,saved_script_ready:true,phone_source:'owner_supplied_conversation',content,script_id:script.id,script_version:script.version,script_sources:[{id:script.id,version:script.version,script_number:script.script_number}],preparation_areas:[],preparation_sections:[],preparation_context:{source:'Owner-requested phone call; no client profile is linked. Do not invent submitted form facts, assistance amounts, preparation needs, welcome delivery or saved progress.',intake:{}},recipient:{kind:'direct_phone',public_id:null,name:name||phone,phone,email:null}},before_value:null}).select('*').single());}else{const prepared=await deps.prepareAction(client,member,{kind:'call',lead_id:lead.lead_id,reason:'Owner requested call using script #'+script.script_number,content:personalizeScript({...script.content,script_text:scriptText(script.content)},lead),saved_script:script,script_category:script.category},{requestId,question});action=prepared.action;}}
 catch(e){const duplicate=check(await client.from('daisy_crm_actions').select('*').eq('id',requestId).eq('created_by',member.user_id).maybeSingle());if(!duplicate||duplicate.payload?.owner_saved_script_request!==question)throw e;if(duplicate.status!=='draft'||!duplicate.payload?.saved_script_ready)return {ok:true,action:duplicate,answer:'That call request is already being processed. No second call was started.'};action=duplicate;}
 return deps.executeCurrentCall(client,member,action,question);
}
