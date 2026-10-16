import {purgeOne} from '../_shared/trash.ts';
import {db,manager} from '../_shared/prephub-data.ts';
const headers={'Access-Control-Allow-Origin':'https://www.dpahelpcenter.com','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const json=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers});
const check=(r:any)=>{if(r.error)throw Error(r.error.message);return r.data;};

Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return json({error:'POST required'},405);try{
 const client=db(),body=await req.json();let items=body.items;
 if(body.action==='purge_expired'){
  const settings=check(await client.from('prephub_followup_settings').select('runner_token').eq('id',true).single());if(!settings.runner_token||typeof body.runner_token!=='string'||body.runner_token!==settings.runner_token)return json({error:'Unauthorized'},401);
  const cutoff=new Date(Date.now()-30*86400000).toISOString(),leads=check(await client.from('lead_operations').select('lead_id,deleted_at').lt('deleted_at',cutoff).limit(100)),cases=check(await client.from('helux_cases').select('id,metadata').not('metadata->>deleted_at','is',null).lt('metadata->>deleted_at',cutoff).limit(100));items=[...leads.map((r:any)=>({kind:'lead',id:r.lead_id,deletedAt:r.deleted_at})),...cases.map((r:any)=>({kind:'helux',id:r.id,deletedAt:r.metadata.deleted_at}))];
 }else{const member=await manager(client,req);if(member.role!=='owner')return json({error:'Owner access required'},403);if(body.action!=='delete_permanently'||body.confirm!==true)return json({error:'Confirm permanent deletion'},400);}
 if(!Array.isArray(items)||items.length>200)return json({error:'Select up to 200 Trash records'},400);const deleted=[],failed=[];for(const item of [...items].sort((a,b)=>(a.kind==='helux'?0:1)-(b.kind==='helux'?0:1))){try{await purgeOne(client,item);deleted.push(item.id);}catch(e){failed.push({id:item.id,error:e instanceof Error?e.message:'Deletion failed'});}}
 return json({ok:failed.length===0,deleted,failed});
 }catch(e){return json({error:e instanceof Error?e.message:'Trash could not be updated'},400);}});
