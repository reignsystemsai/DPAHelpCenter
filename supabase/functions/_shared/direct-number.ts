export function normalizeDirectPhone(value:any){
 const raw=String(value??'').trim();if(!raw||/[a-z]/i.test(raw)||!/^[+\d().\s-]+$/.test(raw))throw Error('Give the complete phone number without an extension');
 let digits=raw.replace(/\D/g,'');if(digits.length===10&&!raw.startsWith('+'))digits='1'+digits;
 if(!raw.startsWith('+')&&!(digits.length===11&&digits.startsWith('1')))throw Error('Include the country code for an international number');
 if(!/^[1-9]\d{7,14}$/.test(digits)||digits.startsWith('1')&&digits.length!==11)throw Error('Give a complete valid phone number');return '+'+digits;
}
// Resolve explicit international prefixes before considering a bare national number.
export function dictatedPhones(instruction:string){
 const words:Record<string,string>={zero:'0',oh:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9'};
 let spoken=instruction.toLowerCase().replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g,w=>words[w]).replace(/\bplus\s*/g,'+').replace(/\+((?:\d\s+){1,2}\d)(?=[,;])/g,(_,v)=>'+'+v.replace(/\s/g,''));
 if(!/\+\d/.test(spoken))spoken=spoken.replace(/\bcountry code\s*(?:is\s*|of\s*|:)?\s*([1-9]\d{0,2})(?=[\s,;]|$)/g,'country code +$1');
 // Accept a country code spoken after the national number as well as before it.
 const suffix=spoken.match(/\b(?:use[ds]?\s+)?\+([1-9]\d{0,2})(?!\d)\s+(?:for\s+)?(?:the\s+)?country code\b/);
 if(suffix){const before=spoken.slice(0,suffix.index);const numbers=before.match(/\d[\d ().-]{6,}\d/g)||[];const resolved:string[]=[];for(const raw of numbers){const digits=raw.replace(/\D/g,'');try{resolved.push(normalizeDirectPhone('+'+(digits.startsWith(suffix[1])&&digits.length===11?digits:suffix[1]+digits)));}catch{}}if(resolved.length)return [...new Set(resolved)];}
 const explicit:string[]=[];
 const add=(raw:string,target:string[])=>{try{target.push(normalizeDirectPhone(raw));}catch{}};
 for(const m of spoken.matchAll(/\+(\d[\d ().-]{6,}\d)/g))add('+'+m[1],explicit);
 // Speech often inserts “and then”, “for the country code”, etc. between
 // an explicitly stated prefix and the national digits. Never silently use +1.
 for(const m of spoken.matchAll(/\+([1-9]\d{0,2})(?!\d)[^\d+]{1,90}(\d[\d ().-]{6,}\d)/g)){
  const national=m[2].replace(/\D/g,'');if(national.length>=7&&national.length<=12)add('+'+m[1]+national,explicit);
 }
 if(explicit.length)return [...new Set(explicit)];
 if(/\+[1-9]\d{0,2}(?!\d)/.test(spoken))return [];
 const national:string[]=[];for(const raw of spoken.match(/\d[\d\s().-]{5,}\d/g)||[])add(raw,national);return [...new Set(national)];
}
export function numberWasDictated(phone:string,instruction:string){return dictatedPhones(instruction).includes(phone);}
export function directAction(action:any){return action.kind==='call'&&action.lead_id===null&&['direct_number','saved_script_phone'].includes(action.payload?.call_mode)&&action.payload?.recipient?.kind==='direct_phone';}

// Resolve follow-up commands only from owner turns, never Daisy's proposed digits.
export function ownerCallInstruction(request:string){
 const q=request.trim().replace(/^(?:(?:hey|okay|ok|yes|daisy|please|just|rain)[,! ]+)*/i,'');
 return /^(?:(?:i (?:want|need) you to|can you|could you|would you|go ahead and|please|just)\s+)*(?:(?:call|dial|ring)\s+|(?:make|place|start|retry|try)\s+(?:(?:the|that|this|same)\s+)*(?:phone\s+)?call\b)/i.test(q)&&!/\b(?:don.t|do not|never|cancel|draft|preview|example|hypothetical|what if|instead of|without calling)\b/i.test(request);
}
export function ownerPhoneEvidence(phone:string,request:string,history:any[]=[],recipientName=''){
 const current=dictatedPhones(request);
 if(current.length)return current.length===1&&current[0]===phone?request:null;
 // A new/incomplete phone expression must be clarified, never replaced by history.
 if(/\+\s*\d|country code|\d[\d ().-]{5,}\d/i.test(request)||!ownerCallInstruction(request))return null;
 const referential=/\b(?:call|dial|ring)\s+(?:(?:her|him|them|again|back)|(?:(?:the|that|this|same)\s+)?(?:number|person|client))\b|\b(?:make|place|retry|start|try)\s+(?:(?:the|that|this|same)\s+)*(?:phone\s+)?call\b/i.test(request);
 const name=recipientName.trim();
 const named=!!name&&name!==phone&&request.toLowerCase().includes(name.toLowerCase());
 if(!referential&&!named)return null;
 const turns=(Array.isArray(history)?history:[]).filter(t=>t?.role==='user'&&typeof t.content==='string').slice(-30);
 for(let i=turns.length-1;i>=0;i--){
  const text=turns[i].content;
  if(/\b(?:cancel|don.t call|do not call|never call|different person|someone else)\b/i.test(text))return null;
  const numbers=dictatedPhones(text);
  if(numbers.length){
   if(numbers.length!==1||numbers[0]!==phone)return null;
   if(named&&!text.toLowerCase().includes(name.toLowerCase()))return null;
   return text;
  }
  if(/\+\s*\d|country code|\d[\d ().-]{5,}\d/i.test(text))return null;
 }
 return null;
}

export function normalizeOwnerPhone(value:any,request:string,history:any[]=[],recipientName=''){
 // A tool may omit '+' even though the owner explicitly supplied the country code.
 // Reconstruct only an exact digit match to an authoritative owner expression.
 const raw=String(value??'').trim().replace(/[‐‑–—]/g,'-');
 let phone:string|null=null;try{phone=normalizeDirectPhone(raw);}catch{}
 if(phone&&ownerPhoneEvidence(phone,request,history,recipientName))return phone;
 if(!/^[+\d().\s-]+$/.test(raw))throw Error('Give the complete phone number without an extension');
 const candidates=[...new Set([request,...(Array.isArray(history)?history:[]).filter(t=>t?.role==='user'&&typeof t.content==='string').slice(-30).map(t=>t.content)].flatMap(dictatedPhones))];
 const matches=candidates.filter(p=>p.slice(1)===raw.replace(/\D/g,'')&&ownerPhoneEvidence(p,request,history,recipientName));
 if(matches.length===1)return matches[0];
 throw Error('The proposed number does not match the owner-supplied country code and digits in this conversation. Clarify only missing or conflicting digits.');
}
