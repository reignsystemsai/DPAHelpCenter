import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

const BUCKET='prephub-documents',MAX_FILE=50*1024*1024,MAX_FILES=200,LINK_SECONDS=7*86400;
const origins=new Set(['https://www.dpahelpcenter.com','https://dpahelpcenter.com','https://dpahelpcenter-pr-46.onrender.com']);
const categories=new Set(['identity','pay','w2','tax','bank','contract','business','benefit','other']);
const uuid=(x:any)=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const clean=(x:any,n=100)=>typeof x==='string'?x.trim().slice(0,n):'';
const escape=(x:any)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const fileFields='id,person_id,category,slot_id,period_label,filename,mime_type,size_bytes,created_at,saved_at,state';
class Problem extends Error{constructor(message:string,public code=400){super(message);}}
function check(error:any){if(error)throw new Problem('Could not save your document work. Please retry.',503);}
function workspaceContent(x:any){
 if(!x||!Array.isArray(x.people)||x.people.length<1||x.people.length>2)throw new Problem('Add one or two people to your document packet.');
 const ids=new Set();const people=x.people.map((p:any)=>{
  if(!uuid(p.id)||ids.has(p.id))throw new Problem('Invalid person in document packet.');ids.add(p.id);
  const slots:any={};for(const [category,list] of Object.entries(p.slots||{})){
   if(!categories.has(category)||!Array.isArray(list)||list.length>24)throw new Problem('Invalid document slots.');
   const keys=new Set();slots[category]=list.map((s:any)=>{const id=clean(s.id,64);if(!/^[a-z_]+:[1-9][0-9]?$/.test(id)||!id.startsWith(category+':')||keys.has(id))throw new Problem('Invalid upload slot.');keys.add(id);return {id,label:clean(s.label,100),period:clean(s.period,80)};});
  }
  return {id:p.id,name:clean(p.name,60),lastName:clean(p.lastName,60),mode:p.mode==='self'?'self':'w2',frequency:['weekly','biweekly','semimonthly','monthly'].includes(p.frequency)?p.frequency:'biweekly',payDays:p.payDays===60?60:30,taxYear:Math.max(2000,Math.min(new Date().getFullYear()-1,Number(p.taxYear)||new Date().getFullYear()-1)),notes:clean(p.notes,2000),slots};
 });
 return {version:2,people,lenderEmail:clean(x.lenderEmail,254).toLowerCase()};
}
async function storedWorkspace(uid:string){const r=await db.from('prephub_document_workspaces').select('content,revision,updated_at').eq('user_id',uid).maybeSingle();check(r.error);return r.data;}
async function ownDocument(uid:string,id:any){if(!uuid(id))throw new Problem('Choose a saved document.');const r=await db.from('prephub_documents').select('*').eq('user_id',uid).eq('id',id).maybeSingle();check(r.error);if(!r.data)throw new Problem('Document not found in your account.',404);return r.data;}
function fileOutput(row:any){return {id:row.id,personId:row.person_id,category:row.category,slotId:row.slot_id,period:row.period_label,name:row.filename,type:row.mime_type,size:Number(row.size_bytes),createdAt:row.created_at,savedAt:row.saved_at};}
async function completeFile(uid:string,id:string){
 const row=await ownDocument(uid,id);if(row.state==='removed')throw new Problem('This file was removed from your packet.',409);if(row.state==='saved')return fileOutput(row);
 const info=await db.storage.from(BUCKET).info(row.storage_path);if(info.error||Number(info.data?.size)!==Number(row.size_bytes))throw new Problem('Your upload has not finished. Retry Upload & Save.',409);
 const signed=await db.storage.from(BUCKET).createSignedUrl(row.storage_path,60);check(signed.error);
 const response=await fetch(signed.data.signedUrl,{headers:{Range:'bytes=0-15'}});if(!response.ok||!response.body)throw new Problem('Could not verify the uploaded file.',503);
 const reader=response.body.getReader(),head:number[]=[];while(head.length<8){const {done,value}=await reader.read();if(done)break;head.push(...value.slice(0,8-head.length));}await reader.cancel();
 const pdf=head[0]===37&&head[1]===80&&head[2]===68&&head[3]===70&&head[4]===45,png=head[0]===137&&head[1]===80&&head[2]===78&&head[3]===71&&head[4]===13&&head[5]===10&&head[6]===26&&head[7]===10,jpg=head[0]===255&&head[1]===216&&head[2]===255;
 if((pdf?'application/pdf':png?'image/png':jpg?'image/jpeg':'')!==row.mime_type)throw new Problem('This file is not a recognized PDF, JPG or PNG. Choose the original document.');
 const result=await db.from('prephub_documents').update({state:'saved',saved_at:new Date().toISOString()}).eq('user_id',uid).eq('id',id).eq('state','pending').select(fileFields).maybeSingle();check(result.error);if(result.data)return fileOutput(result.data);const current=await ownDocument(uid,id);if(current.state==='saved')return fileOutput(current);throw new Problem('This file changed while saving. Reload your packet.',409);
}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'',headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origins.has(origin)?origin:'https://www.dpahelpcenter.com','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
 const reply=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!origins.has(origin))return reply({error:'This origin is not allowed.'},403);
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return reply({error:'Use POST.'},405);
 try{
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token)throw new Problem('Sign in to save your documents.',401);
  const auth=await db.auth.getUser(token);if(auth.error||!auth.data.user)throw new Problem('Sign in to your PrepHub account.',401);const user=auth.data.user,uid=user.id;
  const raw=await req.text();if(raw.length>100000)throw new Problem('Document request is too large.');let body:any;try{body=JSON.parse(raw);}catch{throw new Problem('Invalid document request.');}
  const lead=await db.from('prephub_leads').select('id,first_name').eq('user_id',uid).order('created_at',{ascending:false}).limit(1).maybeSingle();check(lead.error);if(!lead.data)throw new Problem('No PrepHub profile is connected to this account.',404);
  const leadId=lead.data.id,action=clean(body.action,30);
  if(action==='load'){
   const [workspace,documents,packets]=await Promise.all([storedWorkspace(uid),db.from('prephub_documents').select(fileFields).eq('user_id',uid).eq('state','saved').order('created_at'),db.from('prephub_document_packets').select('id,recipient,state,document_ids,created_at,sent_at,expires_at').eq('user_id',uid).order('created_at',{ascending:false}).limit(10)]);check(documents.error||packets.error);return reply({workspace,files:documents.data.map(fileOutput),packets:packets.data,max_file_bytes:MAX_FILE});
  }
  if(action==='save_workspace'){
   const content=workspaceContent(body.content),existing=await storedWorkspace(uid),revision=Number(body.revision)||0;
   if(existing&&existing.revision!==revision)throw new Problem('This document packet changed in another window. Reload it before saving.',409);
   const fields={user_id:uid,lead_id:leadId,content,revision:revision+1,updated_at:new Date().toISOString()};
   const saved=existing?await db.from('prephub_document_workspaces').update(fields).eq('user_id',uid).eq('revision',revision).select('revision,updated_at').maybeSingle():await db.from('prephub_document_workspaces').insert(fields).select('revision,updated_at').single();check(saved.error);if(!saved.data)throw new Problem('Your packet changed in another window. Reload to continue.',409);return reply({saved:true,...saved.data});
  }
  if(action==='reserve'){
   const content=(await storedWorkspace(uid))?.content;if(!content)throw new Problem('Save this person’s name before uploading.');const person=content.people.find((p:any)=>p.id===body.personId);if(!person?.name||!person?.lastName)throw new Problem('Enter the first and last name for this person.');
   const category=clean(body.category,20),slotId=clean(body.slotId,64),slot=person.slots?.[category]?.find((s:any)=>s.id===slotId);if(!categories.has(category)||!slot)throw new Problem('Choose an upload slot in your packet.');
   const filename=clean(body.name,200),type=clean(body.type,50),size=Number(body.size),checksum=clean(body.checksum,64);
   if(!filename||!['application/pdf','image/jpeg','image/png'].includes(type)||!Number.isSafeInteger(size)||size<1||size>MAX_FILE||!/^[a-f0-9]{64}$/.test(checksum))throw new Problem('Choose a PDF, JPG or PNG up to 50 MB.');
   const duplicate=await db.from('prephub_documents').select('*').eq('user_id',uid).eq('person_id',person.id).eq('category',category).eq('slot_id',slotId).eq('checksum',checksum).neq('state','removed').maybeSingle();check(duplicate.error);let row=duplicate.data;
   if(row?.state==='saved')return reply({saved:true,file:fileOutput(row),duplicate:true});
   if(row){const info=await db.storage.from(BUCKET).info(row.storage_path);if(!info.error)return reply({saved:true,file:await completeFile(uid,row.id),duplicate:true});}
   if(!row){const count=await db.from('prephub_documents').select('id',{count:'exact',head:true}).eq('user_id',uid).neq('state','removed');check(count.error);if((count.count||0)>=MAX_FILES)throw new Problem('This packet has 200 files. Remove unneeded files before adding more.');const id=crypto.randomUUID(),ext=type==='application/pdf'?'pdf':type==='image/png'?'png':'jpg';const inserted=await db.from('prephub_documents').insert({id,user_id:uid,lead_id:leadId,person_id:person.id,category,slot_id:slotId,period_label:slot.period||slot.label,filename,storage_path:uid+'/'+person.id+'/'+id+'.'+ext,mime_type:type,size_bytes:size,checksum}).select('*').single();check(inserted.error);row=inserted.data;}
   const signed=await db.storage.from(BUCKET).createSignedUploadUrl(row.storage_path,{upsert:false});check(signed.error);return reply({saved:false,id:row.id,path:row.storage_path,token:signed.data.token,bucket:BUCKET});
  }
  if(action==='complete')return reply({saved:true,file:await completeFile(uid,body.id)});
  if(action==='view'){
   const row=await ownDocument(uid,body.id);if(row.state!=='saved')throw new Problem('This file is not in your saved packet.',404);const signed=await db.storage.from(BUCKET).createSignedUrl(row.storage_path,120,{download:row.filename});check(signed.error);return reply({url:signed.data.signedUrl});
  }
  if(action==='remove'||action==='restore'){
   const row=await ownDocument(uid,body.id);if(!row.saved_at)throw new Problem('Only completed uploads can be removed or restored.');const saved=await db.from('prephub_documents').update({state:action==='remove'?'removed':'saved',removed_at:action==='remove'?new Date().toISOString():null}).eq('user_id',uid).eq('id',row.id).select(fileFields).single();check(saved.error);return reply({saved:true,file:fileOutput(saved.data)});
  }
  if(action==='send'){
   const recipient=clean(body.recipient,254).toLowerCase(),requestId=body.requestId,ids=Array.isArray(body.ids)?[...new Set(body.ids)]:[];
   if(body.confirmed!==true||!uuid(requestId)||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient)||ids.length<1||ids.length>MAX_FILES||!ids.every(uuid))throw new Problem('Review your recipient and saved files before sending.');
   const key=Deno.env.get('RESEND_API_KEY');if(!key)throw new Problem('Lender email delivery is not configured yet.',503);
   const prior=await db.from('prephub_document_packets').select('*').eq('user_id',uid).eq('id',requestId).maybeSingle();check(prior.error);let packet=prior.data;
   if(packet&&(packet.recipient!==recipient||JSON.stringify([...packet.document_ids].sort())!==JSON.stringify([...ids].sort())))throw new Problem('This send request changed. Review a new packet.',409);
   if(packet?.state==='sent')return reply({sent:true,recipient,email_id:packet.email_id,sent_at:packet.sent_at});
   if(packet&&Date.now()-new Date(packet.created_at).getTime()>23*3600000)throw new Problem('This send request expired. Review a new packet.',409);
   if(!packet){
    const rate=await db.from('prephub_document_packets').select('id',{count:'exact',head:true}).eq('user_id',uid).gte('created_at',new Date(Date.now()-86400000).toISOString());check(rate.error);if((rate.count||0)>=10)throw new Problem('You’ve sent several packets today. Please try again tomorrow.',429);
    const documents=await db.from('prephub_documents').select('*').eq('user_id',uid).eq('state','saved').in('id',ids);check(documents.error);if(documents.data.length!==ids.length)throw new Problem('A selected document is no longer saved. Review the packet again.',409);
    const content=(await storedWorkspace(uid))?.content;if(!content)throw new Problem('Save your document packet before sending.');const expiresAt=new Date(Date.now()+LINK_SECONDS*1000).toISOString();
    const records=documents.data.sort((a:any,b:any)=>content.people.findIndex((p:any)=>p.id===a.person_id)-content.people.findIndex((p:any)=>p.id===b.person_id)||a.category.localeCompare(b.category)||a.slot_id.localeCompare(b.slot_id));
    const links=await db.storage.from(BUCKET).createSignedUrls(records.map((d:any)=>d.storage_path),LINK_SECONDS,{download:true});check(links.error);if(links.data.some((l:any)=>l.error||!l.signedUrl))throw new Problem('Could not prepare every saved document. Try again.',503);
    const rows=records.map((d:any,i:number)=>{const person=content.people.find((p:any)=>p.id===d.person_id);if(!person)throw new Problem('A document belongs to a person missing from this packet.');return {label:[person.name,person.lastName].filter(Boolean).join(' ')+' · '+d.category+' · '+d.period_label,name:d.filename,url:links.data[i].signedUrl};});
    const html='<div style="font:15px/1.6 Arial,sans-serif;color:#081f5c;max-width:640px"><h1 style="font-size:24px">Your Homebuyer Document Packet</h1><p>A PrepHub client has shared '+rows.length+' saved documents with you for mortgage preparation. Download links expire in seven days. Please handle these private records securely.</p>'+rows.map((r:any)=>'<p style="padding:12px;border-bottom:1px solid #dde5f0"><strong>'+escape(r.label)+'</strong><br><a href="'+escape(r.url)+'">'+escape(r.name)+'</a></p>').join('')+'<p>Sent through DPA Help Center PrepHub. Document collection does not constitute a lending approval.</p></div>';
    const payload={from:'DPA Help Center PrepHub <ready@mail.dpahelpcenter.com>',to:[recipient],reply_to:user.email||'info@dpahelpcenter.com',subject:'PrepHub homebuyer document packet',html,text:'Your Homebuyer Document Packet\nPrivate document links expire in seven days.\n\n'+rows.map((r:any)=>r.label+'\n'+r.name+'\n'+r.url).join('\n\n'),tags:[{name:'email_type',value:'prephub_document_packet'}]};
    const insert=await db.from('prephub_document_packets').upsert({id:requestId,user_id:uid,lead_id:leadId,recipient,document_ids:ids,state:'sending',payload,expires_at:expiresAt},{onConflict:'id',ignoreDuplicates:true});check(insert.error);
    const stored=await db.from('prephub_document_packets').select('*').eq('user_id',uid).eq('id',requestId).single();check(stored.error);packet=stored.data;
    if(packet.recipient!==recipient||JSON.stringify([...packet.document_ids].sort())!==JSON.stringify([...ids].sort()))throw new Problem('This send request changed. Review a new packet.',409);
   }
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'prephub-documents/'+packet.id},body:JSON.stringify(packet.payload)});const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.id){await db.from('prephub_document_packets').update({state:'failed'}).eq('user_id',uid).eq('id',packet.id);throw new Problem('The email was not accepted. Your files are saved; retry sending.',503);}
   const sentAt=new Date().toISOString(),update=await db.from('prephub_document_packets').update({state:'sent',email_id:result.id,sent_at:sentAt}).eq('user_id',uid).eq('id',packet.id);check(update.error);return reply({sent:true,recipient,email_id:result.id,sent_at:sentAt});
  }
  throw new Problem('Unknown document action.');
 }catch(error){const problem=error instanceof Problem?error:new Problem('Could not complete the document request. Please retry.',503);return reply({error:problem.message},problem.code);}
});
