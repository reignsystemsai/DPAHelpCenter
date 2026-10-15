import {createClient} from 'npm:@supabase/supabase-js@2.112.3';
import {countFacts,seedScripts,creditNeed,iso} from './prephub-flow.ts';
export const db=()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
export async function rows(client:any,table:string,columns='*'){
 const out:any[]=[];for(let from=0;;from+=1000){const r=await client.from(table).select(columns).range(from,from+999);if(r.error)throw r.error;out.push(...r.data);if(r.data.length<1000)break;if(from>=99000)throw Error('Report too large; narrow the query');}return out;
}
export async function manager(client:any,req:Request){
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token)throw Error('Authentication required');
 const {data,error}=await client.auth.getUser(token);if(error||!data.user)throw Error('Authentication required');
 const m=await client.from('manager_members').select('user_id,role,active').eq('user_id',data.user.id).eq('active',true).maybeSingle();if(m.error)throw m.error;if(!m.data)throw Error('Manager access required');return m.data;
}
export async function snapshot(client:any){
 const [leads,ops,calls,comms,prefs]=await Promise.all([rows(client,'prephub_leads','id,lead_id,first_name,last_name,email,phone,credit_score,household_income,employment_history,tax_return_history,initial_readiness_score,current_readiness_score,focus_areas,assessment,claimed_at,created_at,updated_at'),rows(client,'lead_operations'),rows(client,'helux_cases'),rows(client,'lead_communications'),rows(client,'prephub_contact_preferences')]);
 return {leads,ops,calls,comms,prefs,...countFacts(leads,ops,calls,comms,prefs)};
}
export async function seed(client:any){
 const r=await client.from('prephub_outreach_scripts').upsert(seedScripts.map(x=>({...x})),{onConflict:'script_key,version',ignoreDuplicates:true});if(r.error)throw r.error;
}
export async function enroll(client:any,leads:any[],ops:any[],now=Date.now()){
 const s=await client.from('prephub_outreach_scripts').select('*').not('approved_at','is',null).order('version',{ascending:false});if(s.error)throw s.error;
 const scripts=new Map();for(const v of s.data)if(!scripts.has(v.script_key))scripts.set(v.script_key,v);
 if(!['welcome_call','credit_followup','prep_reminder'].every(k=>scripts.has(k)))throw Error('Approve the three scripts before starting the flow');
 const jobs:any[]=[];
 for(const lead of leads){const op=ops.find(x=>x.lead_id===lead.id);if(op?.archived_at||op?.deleted_at)continue;
  for(const [key,days] of [['welcome_call',1],[credit_followup_key(lead,op),3],['prep_reminder',7]] as const){if(!key)continue;const script=scripts.get(key);jobs.push({lead_id:lead.id,step_key:key,channel:script.channel,script_id:script.id,due_at:iso(now+Number(days)*86400000)});}
 }
 if(jobs.length){const r=await client.from('prephub_followup_jobs').upsert(jobs,{onConflict:'lead_id,step_key',ignoreDuplicates:true});if(r.error)throw r.error;}
 return jobs.length;
}
const credit_followup_key=(lead:any,op:any)=>creditNeed(lead,op)?'credit_followup':null;
