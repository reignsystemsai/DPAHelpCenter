const ENDED=new Set(['completed','failed','canceled','busy','no-answer']);
export function createMonitorHandler(db,{key,fetcher=fetch,now=()=>Date.now()}){
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
   const owner=auth.data.user.id,member=await db.from('manager_members').select('active,role').eq('user_id',owner).maybeSingle();if(member.error)throw member.error;
   if(member.data?.active!==true||member.data.role!=='owner')return reply({error:'Owner access required'},403);
   const body=await req.json(),operation=body.operation||'list';
   if(operation==='list'){
    const r=await db.from('daisy_crm_actions').select('id,lead_id,created_at,executed_at,status,result,payload,prephub_leads(first_name,last_name)').eq('created_by',owner).eq('kind','call').in('status',['executing','submitted']).gte('created_at',new Date(now()-600000).toISOString()).order('created_at',{ascending:false}).limit(20);if(r.error)throw r.error;
    const calls=(r.data||[]).filter(c=>!ENDED.has(c.result?.call_status)).map(c=>({id:c.id,lead_id:c.lead_id,name:[c.prephub_leads?.first_name,c.prephub_leads?.last_name].filter(Boolean).join(' ')||c.payload?.recipient?.name||'Daisy call',status:c.result?.call_status||'connecting',started_at:c.executed_at||c.created_at}));
    return reply({ok:true,calls,as_of:new Date(now()).toISOString()});
   }
   if(operation!=='connect'||!/^[a-f0-9-]{36}$/i.test(String(body.action_id||'')))return reply({error:'Choose a live call'},400);
   const row=await db.from('daisy_crm_actions').select('id,status,result,created_at').eq('id',body.action_id).eq('created_by',owner).eq('kind','call').maybeSingle();if(row.error)throw row.error;
   const c=row.data;if(!c)return reply({error:'Call not found'},404);
   if(!['submitted','executing'].includes(c.status)||ENDED.has(c.result?.call_status)||Date.parse(c.created_at)<now()-600000)return reply({error:'This call is no longer live'},409);
   const serviceKey=key();if(!serviceKey)throw Error('Caller unavailable');
   const r=await fetcher('https://helux-ai-workforce.onrender.com/api/v1/manager/calls/'+c.id+'/listen',{method:'POST',headers:{'Content-Type':'application/json','x-helux-key':serviceKey},body:JSON.stringify({owner_id:owner}),signal:AbortSignal.timeout(12000)});
   const data=await r.json();if(!r.ok||!data.ok)return reply({error:r.status===409?'This call is no longer live':'Live audio is temporarily unavailable'},r.status===409?409:503);
   if(data.websocket_url!=='wss://helux-ai-workforce.onrender.com/api/v1/manager/listen')throw Error('Unexpected listener endpoint');
   return reply({ok:true,action_id:c.id,token:data.token,websocket_url:data.websocket_url});
  }catch{return reply({error:'Live calls are temporarily unavailable. Try Refresh.'},503);}
 };
}
