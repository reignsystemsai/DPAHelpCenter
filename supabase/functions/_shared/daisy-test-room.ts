import {preparationContext,prepareScriptSequence} from './call-scripts.ts';
import {readCallerSettings} from './caller-settings.ts';
const take=(r:any)=>{if(r.error)throw r.error;return r.data;};
export async function testRoomAction(client:any,member:any,body:any){
 if(member.role!=='owner')throw Error('Owner access required');
 const operation=String(body.operation||'config');
 if(operation==='config'){
  const leads=take(await client.from('prephub_leads').select('lead_id,first_name,last_name,focus_areas').order('created_at',{ascending:false}).limit(300));
  const scripts=take(await client.from('daisy_call_scripts').select('id,script_number,title,category,version').eq('direction','outbound').is('archived_at',null).is('deleted_at',null).order('script_number'));
  return {ok:true,leads,scripts};
 }
 if(!['start','list','session','audio','delete'].includes(operation))throw Error('Unknown test operation');
 let payload:any;
 if(operation==='start'){
  const lead=take(await client.from('prephub_leads').select('*').eq('lead_id',String(body.lead_id||'')).single());
  const primary=take(await client.from('daisy_call_scripts').select('*').eq('id',String(body.script_id||'')).eq('direction','outbound').is('archived_at',null).is('deleted_at',null).single());
  const sequence=await prepareScriptSequence(client,primary,lead),settings=await readCallerSettings(client);
  payload={first_name:lead.first_name,script:sequence.content,script_sources:sequence.sources,preparation_areas:sequence.areas,preparation_sections:sequence.sections||[],preparation_context:{...await preparationContext(client,lead),call_at:new Date().toISOString(),timezone:'America/New_York'},caller_settings:{version:settings.version,settings:settings.settings}};
 }
 if(['audio','session','delete'].includes(operation)&&!/^[a-f0-9-]{36}$/i.test(String(body.id||'')))throw Error('Choose a saved test session');
 const key=Deno.env.get('HELUX_API_KEY');if(!key)throw Error('Caller connection is not configured');
 const response=await fetch('https://helux-ai-workforce.onrender.com/api/v1/manager/test-room',{method:'POST',headers:{'Content-Type':'application/json','x-helux-key':key},body:JSON.stringify({operation,owner_id:member.user_id,id:body.id,label:String(body.label||'Daisy rehearsal').slice(0,160),...(payload?{payload}:{})}),signal:AbortSignal.timeout(25000)});
 if(operation==='audio'&&response.ok)return {ok:true,audio_response:response};
 const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Test room request failed');return data;
}
