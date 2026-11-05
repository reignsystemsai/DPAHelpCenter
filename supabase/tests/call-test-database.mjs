export function database(seed={}){
 const tables=structuredClone(seed),queries=[];
 return {tables,queries,from(table){tables[table]??=[];let filters=[],op='select',value,limit=Infinity,sort=[];
  const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},is(k,v){filters.push(r=>(r[k]??null)===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},ilike(k,v){filters.push(r=>new RegExp('^'+v.replace(/%/g,'.*')+'$','i').test(r[k]||''));return q;},order(k,{ascending}){sort.push([k,ascending]);return q;},limit(v){limit=v;return q;},insert(v){op='insert';value=v;return q;},update(v){op='update';value=v;return q;},async single(){return run(true);},async maybeSingle(){return run(true);},then(a,b){return Promise.resolve(run()).then(a,b);}};
  function run(single=false){queries.push({table,op,sort:structuredClone(sort)});let rows=tables[table].filter(r=>filters.every(f=>f(r)));
   if(op==='insert'){const v=structuredClone(value);if(table==='daisy_owner_call_turns'&&tables[table].some(r=>r.turn_id===v.turn_id))return {data:null,error:{code:'23505'}};tables[table].push(v);rows=[v];}
   if(op==='update')rows.forEach(r=>Object.assign(r,structuredClone(value)));
   rows=rows.slice().sort((a,b)=>{for(const [k,asc] of sort){if(a[k]!==b[k])return (a[k]>b[k]?1:-1)*(asc?1:-1);}return 0;}).slice(0,limit);
   return {data:structuredClone(single?rows[0]||null:rows),error:null};
  }return q;
 }};
}
