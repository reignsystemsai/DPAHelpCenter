// Read-only owner view over existing authenticated PrepHub page heartbeats.
const TTL_MS=45000;
const pageLabels={overview:'Prep Hub',credit:'Credit',income:'Income & DTI',employment:'Work History',documents:'Documents',savings:'Savings & Fees'};
export function summarizePresence(rows,now=Date.now()){
 const clients=new Map();
 for(const row of rows){const seen=Date.parse(row.seen_at),age=now-seen;if(!row.lead_id||row.visible!==true||!pageLabels[row.tab]||!Number.isFinite(age)||age<0||age>TTL_MS)continue;
  let item=clients.get(row.lead_id);if(!item){item={lead_id:row.lead_id,seen_at:row.seen_at,pages:[]};clients.set(row.lead_id,item);}if(seen>Date.parse(item.seen_at))item.seen_at=row.seen_at;if(!item.pages.includes(pageLabels[row.tab]))item.pages.push(pageLabels[row.tab]);
 }
 return [...clients.values()];
}
export function createPresenceHandler(db,now=()=>Date.now()){
 return async req=>{
  const origin=req.headers.get('origin')||'',allowed=['https://www.dpahelpcenter.com','https://dpahelpcenter.com'];
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(allowed.includes(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'});
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!allowed.includes(origin))return reply({error:'Origin not allowed'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply({error:'POST required'},405);
  const bearer=req.headers.get('authorization')||'';if(!/^Bearer\s+\S+$/i.test(bearer))return reply({error:'Manager sign-in required'},401);
  try{
   const auth=await db.auth.getUser(bearer.replace(/^Bearer\s+/i,''));if(auth.error||!auth.data?.user)return reply({error:'Manager sign-in required'},401);
   const member=await db.from('manager_members').select('active,role').eq('user_id',auth.data.user.id).maybeSingle();if(member.error)throw member.error;
   if(member.data?.active!==true||member.data.role!=='owner')return reply({error:'Owner access required'},403);
   const at=now(),presence=await db.from('prephub_page_presence').select('lead_id,tab,panel,visible,seen_at').gte('seen_at',new Date(at-TTL_MS).toISOString()).order('seen_at',{ascending:false}).limit(1000);
   if(presence.error)throw presence.error;
   return reply({ok:true,live:summarizePresence(presence.data||[],at),as_of:new Date(at).toISOString(),ttl_ms:TTL_MS,coverage:'authenticated_prephub'});
  }catch{return reply({error:'Live PrepHub status is temporarily unavailable'},503);}
 };
}
