import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {db} from '../_shared/prephub-data.ts';
import {runIntakeCalls} from '../_shared/automatic-intake-calls.ts';
const json=(value:any,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const same=(a:string,b:string)=>{let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;};
Deno.serve(async req=>{if(req.method==='GET')return json({revision:'20261105-automatic-intake-v1'});if(req.method!=='POST')return json({error:'POST required'},405);try{const body=await req.json(),client=db(),settings=await client.from('prephub_followup_settings').select('runner_token').eq('id',true).single();if(settings.error||!settings.data?.runner_token||!same(String(body.runner_token||''),settings.data.runner_token))return json({error:'Unauthorized'},401);return json(await runIntakeCalls(client));}catch(error){console.error('Automatic intake call sweep failed',error instanceof Error?error.message:'Unknown');return json({error:'Call sweep unavailable; requests remain recorded'},500);}});
