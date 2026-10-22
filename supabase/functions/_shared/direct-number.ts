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
export function directAction(action:any){return action.kind==='call'&&action.lead_id===null&&action.payload?.call_mode==='direct_number'&&action.payload?.recipient?.kind==='direct_phone';}
