import {savedTaxStatus,normalizeTaxDraft,liveTaxStatus} from '../_shared/prephub-tax-status.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.112.3';
import {normalizePresence,navigationStatus,recentTaxYears} from '../_shared/prephub-guide.ts';
import {buildPreparationPlan,loadPreparationEvidence} from '../_shared/preparation-plan.ts';
const origins=['https://www.dpahelpcenter.com','https://dpahelpcenter.com'];
const equal=(a:string,b:string)=>{let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;};
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'',headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 if(origins.includes(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'});
 const reply=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers});
 if(origin&&!origins.includes(origin))return reply({error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 try{
 const raw=await req.text();if(raw.length>6000)return reply({error:'Request too large'},413);const body=JSON.parse(raw);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 let lead:any;
 if(body.action==='presence'){
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');const auth=await db.auth.getUser(token);
 if(auth.error||!auth.data.user)return reply({error:'Sign in required'},401);
 let query=db.from('prephub_leads').select('id,user_id').eq('user_id',auth.data.user.id);if(body.lead_id)query=query.eq('lead_id',String(body.lead_id).slice(0,100));
 const found=await query.order('created_at',{ascending:false}).limit(1).maybeSingle();if(found.error)throw found.error;if(!found.data)return reply({error:'Account profile not found'},404);lead=found.data;
 const metadata={...normalizePresence(body),tax_draft:body.tab==='taxes'?normalizeTaxDraft(body.tax_draft,recentTaxYears()):null};const saved=await db.from('prephub_page_presence').upsert({...metadata,lead_id:lead.id,user_id:auth.data.user.id,seen_at:new Date().toISOString()},{onConflict:'lead_id,session_id'});if(saved.error)throw saved.error;
 return reply({saved:true});
 }
 if(body.action!=='read')return reply({error:'Unsupported action'},400);
 const expected=Deno.env.get('HELUX_API_KEY')||'',key=req.headers.get('x-helux-key')||'';
 if(!expected||!key||!equal(expected,key))return reply({error:'Caller authentication required'},401);
 const found=await db.from('prephub_leads').select('id,user_id,focus_areas,credit_score,claimed_at,initial_readiness_score,credit_plan_request,household_income,employment_history,tax_return_history').eq('lead_id',String(body.lead_id||'').slice(0,100)).maybeSingle();if(found.error)throw found.error;if(!found.data)return reply({error:'Call profile not found'},404);lead=found.data;
 const [presence,book,workspace]=await Promise.all([db.from('prephub_page_presence').select('tab,panel,visible,seen_at,tax_draft').eq('lead_id',lead.id).gte('seen_at',new Date(Date.now()-45000).toISOString()).order('seen_at',{ascending:false}),db.from('prephub_credit_workbooks').select('updated_at,readiness:content->credit_inputs->prepHubReadiness,tax_preparation:content->credit_inputs->taxPreparation').eq('lead_id',lead.id).maybeSingle(),db.from('prephub_document_workspaces').select('content').eq('user_id',lead.user_id).eq('lead_id',lead.id).maybeSingle()]);
 if(presence.error||book.error||workspace.error)throw presence.error||book.error||workspace.error;
 const readiness=book.data?.readiness||{},evidence=await loadPreparationEvidence(db,[lead.id],[lead]);
 const plan=buildPreparationPlan(lead,{preparation_area:'Preparation review',task_title:''},evidence.workbooks[0],evidence.reports,evidence.documents,evidence.access[0]);
 const publicAreas:Record<string,string>={'Income / DTI':'DTI','My Documents':'Documents'};
 const areas=plan.journey.remaining_areas.map((a:string)=>publicAreas[a]||a);
 const savedTax=savedTaxStatus(book.data,recentTaxYears(),workspace.data?.content?.people);
 const rawCredit=lead.credit_plan_request,creditRequest=rawCredit&&['self','review','full','sweep'].includes(rawCredit.plan_key)?{plan_key:rawCredit.plan_key,status:rawCredit.status==='follow_up_needed'?'follow_up_needed':'unknown',requested_at:rawCredit.requested_at||null,payment_status:'not_collected'}:null;
 return reply({...navigationStatus(areas,presence.data||[]),tax_years:recentTaxYears(),credit_plan_request:creditRequest,client_record:{source:'Client-reported CRM intake, not lender or IRS verification',credit_score:lead.credit_score??null,household_income:lead.household_income??null,employment_history:lead.employment_history??null,tax_return_history:lead.tax_return_history??null},journey:plan.journey,next_action:plan.next_action,steps:plan.steps,tax_progress:savedTax,live_tax_progress:liveTaxStatus(presence.data||[],savedTax),saved_progress:{total:Number.isInteger(readiness.total)&&readiness.total>=0&&readiness.total<=100?readiness.total:null,updated_at:book.data?.updated_at||null,sections:Object.fromEntries(['credit','income','employment','taxes'].map(k=>[k,{assessed:readiness.assessed?.[k]===true,contribution:readiness.sections?.[k]===25?25:0}]))},evidence_note:'Saved preparation assessment, not lender approval. Document completion does not prove taxes filed.'});
 }catch{return reply({error:'Page status unavailable; ask the client what page heading they see.'},400);}
});
