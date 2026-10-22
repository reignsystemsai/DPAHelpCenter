export function normalizeDirectPhone(value:any){
 const raw=String(value??'').trim();if(!raw||/[a-z]/i.test(raw)||!/^[+\d().\s-]+$/.test(raw))throw Error('Give the complete phone number without an extension');
 let digits=raw.replace(/\D/g,'');if(digits.length===10&&!raw.startsWith('+'))digits='1'+digits;
 if(!raw.startsWith('+')&&!(digits.length===11&&digits.startsWith('1')))throw Error('Include the country code for an international number');
 if(!/^[1-9]\d{7,14}$/.test(digits)||digits.startsWith('1')&&digits.length!==11)throw Error('Give a complete valid phone number');return '+'+digits;
}
export function numberWasDictated(phone:string,instruction:string){
 const words:Record<string,string>={zero:'0',oh:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9'};
 const spoken=instruction.toLowerCase().replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g,w=>words[w]);
 const candidates=spoken.match(/\+?\d[\d\s().-]{5,}\d/g)||[];return candidates.some(value=>{try{return normalizeDirectPhone(value)===phone;}catch{return false;}});
}
export function directAction(action:any){return action.kind==='call'&&action.lead_id===null&&action.payload?.call_mode==='direct_number'&&action.payload?.recipient?.kind==='direct_phone';}
