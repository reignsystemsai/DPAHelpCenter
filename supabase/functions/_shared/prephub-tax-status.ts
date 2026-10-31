// Return only this recipient's saved tax-status flags, never workbook notes or documents.
export function savedTaxStatus(book:any,years:number[],workspacePeople?:any[]){const raw=book?.tax_preparation?.people||{};return {saved_at:book?.updated_at||null,source:'saved client selections; not IRS verification',people:Object.entries(raw).filter(([id])=>!Array.isArray(workspacePeople)||workspacePeople.some(p=>p.id===id)).slice(0,4).map(([person,value]:[string,any])=>({person_id:person,years:Object.fromEntries(years.filter(y=>typeof value?.[y]?.filed==='boolean').map(y=>[y,value[y].filed]))}))};}
export function normalizeTaxDraft(value:any,years:number[]){
 if(!value||typeof value!=='object'||!/^[a-f0-9-]{36}$/i.test(value.person_id||''))return null;
 const flags=Object.fromEntries(years.filter(y=>typeof value.years?.[y]==='boolean').map(y=>[y,value.years[y]]));
 return {person_id:value.person_id,years:flags,dirty:value.dirty===true};
}
export function liveTaxStatus(rows:any[],saved:any,now=Date.now()){
 const active=rows.filter(r=>r.visible===true&&r.tab==='taxes'&&r.tax_draft&&now-Date.parse(r.seen_at)>=0&&now-Date.parse(r.seen_at)<=45000),states=[...new Set(active.map(r=>JSON.stringify([r.tax_draft.person_id,r.tax_draft.years])))];
 if(states.length!==1)return {status:states.length?'ambiguous':'unavailable',source:'Live client selections; not filing verification',people:[]};
 const latest=active.slice().sort((a,b)=>Date.parse(b.seen_at)-Date.parse(a.seen_at))[0],draft=latest.tax_draft,stored=saved.people.find((p:any)=>p.person_id===draft.person_id),match=Object.keys(draft.years).length===2&&!!stored&&Object.entries(draft.years).every(([y,v])=>stored.years[y]===v);
 return {status:'live',source:'Live client selections; separate from saved progress',seen_at:latest.seen_at,saved_match:match,people:[{person_id:draft.person_id,years:draft.years}]};
}
