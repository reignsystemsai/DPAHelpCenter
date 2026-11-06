import {randomUUID} from 'node:crypto';
export function database(seed={}){
 const tables=structuredClone(seed),queries=[];
 return {tables,queries,rpc:async()=>({data:{},error:null}),from(table){tables[table]??=[];let filters=[],op='select',value,limit=Infinity,sort=[],options={};
  const q={neq(k,v){filters.push(r=>r[k]!==v);return q;},gte(k,v){filters.push(r=>r[k]>=v);return q;},lt(k,v){filters.push(r=>r[k]<v);return q;},lte(k,v){filters.push(r=>r[k]<=v);return q;},upsert(v,o={}){op='upsert';value=v;options=o;return q;},select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},is(k,v){filters.push(r=>(r[k]??null)===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},ilike(k,v){filters.push(r=>new RegExp('^'+v.replace(/%/g,'.*')+'$','i').test(r[k]||''));return q;},order(k,{ascending=true}={}){sort.push([k,ascending]);return q;},limit(v){limit=v;return q;},insert(v){op='insert';value=v;return q;},update(v){op='update';value=v;return q;},async single(){return run(true);},async maybeSingle(){return run(true);},then(a,b){return Promise.resolve(run()).then(a,b);}};
  function run(single=false){queries.push({table,op,sort:structuredClone(sort)});let rows=tables[table].filter(r=>filters.every(f=>f(r)));
   if(op==='upsert'){const keys=(options.onConflict||'id').split(',');let found=tables[table].find(r=>keys.every(k=>r[k]===value[k]));if(table==='daisy_intake_call_jobs'&&!found&&['working','submitted'].includes(value.status)){found=tables[table].find(r=>r.phone===value.phone&&['working','submitted'].includes(r.status));if(found)return {data:null,error:{code:'23505'}};}if(found){if(options.ignoreDuplicates)return {data:[],error:null};Object.assign(found,structuredClone(value));rows=[found];}else{const row={id:randomUUID(),status:'pending',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...structuredClone(value)};tables[table].push(row);rows=[row];}}
   if(op==='insert'){const v=structuredClone(value);if(table==='daisy_owner_call_turns'&&tables[table].some(r=>r.turn_id===v.turn_id))return {data:null,error:{code:'23505'}};tables[table].push(v);rows=[v];}
   if(op==='update'&&table==='daisy_intake_call_jobs'&&['working','submitted'].includes(value.status)&&rows.some(row=>tables[table].some(other=>other.id!==row.id&&other.phone===row.phone&&['working','submitted'].includes(other.status))))return {data:null,error:{code:'23505'}};
   if(op==='update')rows.forEach(r=>Object.assign(r,structuredClone(value)));
   rows=rows.slice().sort((a,b)=>{for(const [k,asc] of sort){if(a[k]!==b[k])return (a[k]>b[k]?1:-1)*(asc?1:-1);}return 0;}).slice(0,limit);
   return {data:structuredClone(single?rows[0]||null:rows),error:null};
  }return q;
 }};
}
