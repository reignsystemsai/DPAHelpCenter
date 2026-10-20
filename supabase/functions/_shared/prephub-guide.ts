// Page identifiers and navigation labels are allowlisted; never capture input values.
export const pages:Record<string,{label:string,steps:string[]}>= {
 overview:{label:'My Prep Hub',steps:['Choose the tab for the current preparation area.']},
 credit:{label:'Credit Preparation',steps:['Gather My Three Credit Reports','My Free Homebuyer Credit Analysis','Start My Disputes','Track Your Progress']},
 income:{label:'Income & DTI',steps:['Choose the appropriate income type and use your own records.','Add monthly debt payments.','Include principal and interest, taxes, insurance and applicable PMI in the housing estimate.','Review the estimate, then Save My Numbers.']},
 employment:{label:'Employment History',steps:['Add employers and work dates across two years; different employers are allowed.','Explain any gaps, then Save My History.']},
 documents:{label:'My Documents',steps:['Choose the relevant document category and upload your own records. Never read private identifiers aloud.']},
 savings:{label:'Savings & Fees',steps:['Review estimated upfront costs; your lender confirms exact amounts.']}
};
export const areaTabs:Record<string,string>={Credit:'credit',Income:'income',DTI:'income','Work History':'employment',Taxes:'documents'};
export function normalizePresence(body:any){
 if(!pages[body.tab]||!/^[0-9a-f-]{36}$/i.test(body.session_id||'')||typeof body.visible!=='boolean')throw Error('Invalid page metadata');
 const panel=body.tab==='credit'&&['reports','flags','disputes','followup','balances','questions'].includes(body.panel)?body.panel:null;
 return {session_id:body.session_id,tab:body.tab,panel,visible:body.visible};
}
export function navigationStatus(areas:string[],rows:any[],now=Date.now()){
 const fresh=rows.filter(r=>r.visible===true&&pages[r.tab]&&now-Date.parse(r.seen_at)>=0&&now-Date.parse(r.seen_at)<=45000);
 const tabs=[...new Set(fresh.map(r=>r.tab))];const current=tabs.length===1?fresh[0]:null;
 const allowed=[...new Set(areas.map(a=>areaTabs[a]).filter(Boolean))];
 return {page_status:tabs.length>1?'ambiguous':current?'live':'unavailable',current_page:current?{tab:current.tab,label:pages[current.tab].label,panel:current.panel,seen_at:current.seen_at}:null,preparation_areas:areas,recommended_tab:allowed[0]||null,allowed_tabs:allowed,redirect_required:!!current&&allowed.length>0&&!allowed.includes(current.tab),navigation:pages,limits:'Current tab and known section only; not screen pixels or unsaved entries. If stale, ambiguous or unavailable ask the client for the page heading. Page presence is not milestone completion.'};
}
