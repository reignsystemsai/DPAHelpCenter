const check=(r:any)=>{if(r.error)throw Error(r.error.message);return r.data;};
export async function purgeOne(client:any,item:any){
 if(!/^[0-9a-f-]{36}$/i.test(item.id||'')||!Number.isFinite(Date.parse(item.deletedAt)))throw Error('Invalid Trash record');
 if(item.kind==='helux'){const rows=check(await client.from('helux_cases').delete().eq('id',item.id).eq('metadata->>deleted_at',item.deletedAt).select('id'));if(!rows.length)throw Error('Trash record changed; refresh first');return;}
 if(item.kind!=='lead')throw Error('Invalid Trash record type');
 const existing=check(await client.from('lead_operations').select('deleted_at,purging_at,updated_at').eq('lead_id',item.id).single());if(Date.parse(existing.deleted_at)!==Date.parse(item.deletedAt))throw Error('Trash record changed; refresh first');if(existing.purging_at&&Date.now()-Date.parse(existing.purging_at)<900000)throw Error('Deletion already in progress');
 const pending=check(await client.from('daisy_crm_actions').select('id').eq('lead_id',item.id).in('status',['executing','submitted']));if(pending.length)throw Error('A call or action is still pending. Refresh its result before deleting.');
 const claim=check(await client.from('lead_operations').update({purging_at:new Date().toISOString()}).eq('lead_id',item.id).eq('deleted_at',item.deletedAt).eq('updated_at',existing.updated_at||'').select('lead_id'));
 if(!claim.length)throw Error('Trash changed while deleting; refresh first');
 try{
  const reports=check(await client.from('prephub_credit_reports').select('storage_path').eq('lead_id',item.id)),docs=check(await client.from('prephub_documents').select('storage_path').eq('lead_id',item.id)),calls=check(await client.from('daisy_crm_actions').select('result').eq('lead_id',item.id));
  for(const [bucket,paths] of [['prephub-credit-reports',reports.map((r:any)=>r.storage_path)],['prephub-documents',docs.map((r:any)=>r.storage_path)],['daisy-call-recordings',calls.map((r:any)=>r.result?.recording_storage_path)]] as any){const keys=paths.filter(Boolean);if(keys.length)check(await client.storage.from(bucket).remove(keys));}
  check(await client.rpc('finalize_trashed_lead',{p_lead:item.id,p_deleted:item.deletedAt}));
 }catch(e){await client.from('lead_operations').update({purging_at:null}).eq('lead_id',item.id);throw e;}
}
