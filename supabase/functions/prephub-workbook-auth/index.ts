import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
const origins=new Set(['https://dpa-prephub-credit-staging.reign-ai-sys-8696.chatgpt.site','https://www.dpahelpcenter.com','https://dpahelpcenter.com']);
let modelCheck:{checked_at:number;accepted:boolean;status:number}|null=null;
const plans={self:{title:'Instant Prep Plan',price_cents:4997},review:{title:'Agent Review + Plan',price_cents:9700},full:{title:'First-Time Homebuyer Credit Pathway',price_cents:24900},sweep:{title:'Credit Sweep + Tradeline Assessment',price_cents:59900}};
const clean=(v:unknown,n=1000)=>typeof v==='string'?v.trim().slice(0,n):'';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';const preview=origin==='http://terminal.local:4173';
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':(origins.has(origin)||preview)?origin:'https://www.dpahelpcenter.com','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!origins.has(origin)&&!preview)return reply({error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 try{
  const raw=await req.text();if(raw.length>180000)return reply({error:'Request too large'},413);const body=JSON.parse(raw);const action=clean(body.action,40);
  if(action==='capabilities'){
   const key=Deno.env.get('OPENAI_API_KEY'),model=Deno.env.get('PREPHUB_AI_MODEL')||'gpt-4.1-mini';
   if(body.verify_ai===true&&key&&(!modelCheck||Date.now()-modelCheck.checked_at>600000)){
    try{const checked=await fetch('https://api.openai.com/v1/models/'+encodeURIComponent(model),{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(10000)});modelCheck={checked_at:Date.now(),accepted:checked.ok,status:checked.status};await checked.body?.cancel();}catch{modelCheck={checked_at:Date.now(),accepted:false,status:0};}
   }
   return reply({ai_configured:!!key,email_configured:!!Deno.env.get('RESEND_API_KEY'),...(body.verify_ai===true?{model,model_access_verified:modelCheck?.accepted||false,model_check_status:modelCheck?.status||0}:{})});
  }
  if(preview)return reply({error:'Use your signed-in PrepHub account for private actions'},403);
  if(action==='send_login'){
   const email=clean(body.email,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:'Enter a valid email'},400);
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(email)))).map(b=>b.toString(16).padStart(2,'0')).join('');
   const limit=await db.rpc('reserve_workbook_login',{p_email_hash:hash});if(limit.error)throw limit.error;if(!limit.data)return reply({error:'Please wait before requesting another sign-in code'},429);
   const lead=await db.from('prephub_leads').select('id').ilike('email',email).limit(1).maybeSingle();if(lead.error)throw lead.error;
   const generic={message:'If this email has a PrepHub profile, a sign-in code has been sent.'};if(!lead.data)return reply(generic);
   const key=Deno.env.get('RESEND_API_KEY');if(!key)return reply({error:'Email sign-in is temporarily unavailable'},503);
   const link=await db.auth.admin.generateLink({type:'magiclink',email});if(link.error||!link.data.properties?.email_otp)return reply({error:'Sign-in is temporarily unavailable'},503);
   const code=link.data.properties.email_otp;
   const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from:'DPA Help Center PrepHub <ready@mail.dpahelpcenter.com>',to:[email],subject:'Your PrepHub sign-in code',text:`Your PrepHub sign-in code is ${code}. Use it only in PrepHub. Do not share it with anyone.`})});if(!sent.ok)return reply({error:'The code could not be sent. Please try again later.'},503);return reply(generic);
  }
  if(action==='verify_login'){
   const auth=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false}});
   const verified=await auth.auth.verifyOtp({email:clean(body.email,254).toLowerCase(),token:clean(body.code,12),type:'email'});
   if(verified.error||!verified.data.session)return reply({error:'That code could not be verified'},401);
   const session=verified.data.session;
   const claim=await db.from('prephub_leads').update({user_id:session.user.id,claimed_at:new Date().toISOString()}).ilike('email',session.user.email!).is('user_id',null);if(claim.error)throw claim.error;
   return reply({session:{access_token:session.access_token,refresh_token:session.refresh_token,expires_at:session.expires_at,user:{id:session.user.id}}});
  }
  return reply({error:'Unsupported sign-in action'},400);
 }catch(_error){return reply({error:'Sign-in could not be completed right now.'},500);}
});
