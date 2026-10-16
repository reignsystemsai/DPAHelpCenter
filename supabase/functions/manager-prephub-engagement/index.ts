import {createClient} from 'npm:@supabase/supabase-js@2.112.3';
import {engagementFor} from './engagement.ts';
Deno.serve(async req=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'https://www.dpahelpcenter.com','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const reply=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 try{
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 const {data:auth,error}=await db.auth.getUser(token);if(error||!auth.user)return reply({error:'Sign in to Network Manager'},401);
 const member=await db.from('manager_members').select('active').eq('user_id',auth.user.id).maybeSingle();if(member.error)throw member.error;if(!member.data?.active)return reply({error:'Manager access required'},403);
 async function rows(table:string,columns:string){const all:any[]=[];for(let offset=0;;offset+=1000){const result=await db.from(table).select(columns).order(table==='prephub_contact_preferences'?'lead_id':'id').range(offset,offset+999);if(result.error)throw result.error;all.push(...result.data||[]);if((result.data?.length||0)<1000)return all;}}
 const [leads,communications,calls,documents,reports,preferences]=await Promise.all([
 rows('prephub_leads','id,claimed_at'),rows('lead_communications','lead_id,channel,direction,status,occurred_at,created_at'),
 rows('helux_cases','lead_id,last_call_result,last_call_at,updated_at,metadata'),rows('prephub_documents','lead_id,state,saved_at,created_at'),
 rows('prephub_credit_reports','lead_id,created_at'),rows('prephub_contact_preferences','lead_id,callback_requested_at,interested_at,last_reply_at')]);
 return reply({leads:leads.map(lead=>engagementFor(lead,{communications,calls,documents,reports,preferences}))});
 }catch(error){console.error('PrepHub engagement load failed');return reply({error:'Engagement activity could not be loaded.'},500);}
});
