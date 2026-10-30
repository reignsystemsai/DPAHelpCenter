export function preparationAreas(lead:any):string[]{
 const aliases:Record<string,string>={credit:'Credit',credit_review:'Credit',income:'Income',income_review:'Income',dti:'DTI',dti_review:'DTI',job:'Work History',employment:'Work History',work_history:'Work History',employment_review:'Work History',taxes:'Taxes',taxes_review:'Taxes',tax:'Taxes'};
 const areas=new Set<string>();for(const raw of Array.isArray(lead.focus_areas)?lead.focus_areas:[]){const area=aliases[String(raw).toLowerCase()];if(area)areas.add(area);}
 if(lead.credit_score!==null&&lead.credit_score!==undefined&&Number.isFinite(Number(lead.credit_score))&&Number(lead.credit_score)>0&&Number(lead.credit_score)<640)areas.add('Credit');
 return [...areas].sort((a,b)=>a==='Credit'?-1:b==='Credit'?1:0);
}
