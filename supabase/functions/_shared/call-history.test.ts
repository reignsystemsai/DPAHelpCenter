import {archiveRecording} from './call-history.ts';
const assert=(v:boolean)=>{if(!v)throw Error('Assertion failed')};
Deno.test('Audio archive stores private MP3 bytes and persists the client/call storage path',async()=>{
 const original=globalThis.fetch,operations:any[]=[];
 globalThis.fetch=async()=>new Response(new Uint8Array([1,2,3]),{status:200});
 try{
  const client:any={
   storage:{from(bucket:string){return {upload:async(path:string,bytes:any,options:any)=>{operations.push({bucket,path,bytes:[...bytes],options});return {error:null};}};}},
   from(){let update=false;const q:any={select(){return q},eq(){return q},single(){return q},update(value:any){update=true;operations.push(value);return q},then(resolve:any){return Promise.resolve({data:update?[{id:'call'}]:{result:{recording_status:'completed'},updated_at:'2026-10-16'},error:null}).then(resolve)}};return q;}
  };
  const path=await archiveRecording(client,{id:'call',lead_id:'buyer',result:{recording_status:'completed'}});
  assert(path==='buyer/call.mp3');assert(operations[0].bucket==='daisy-call-recordings'&&operations[0].bytes.length===3);assert(operations[0].options.contentType==='audio/mpeg');assert(operations[1].result.recording_storage_path===path);
 }finally{globalThis.fetch=original}
});
Deno.test('Unavailable audio is not fabricated and previously archived audio is reused',async()=>{assert(await archiveRecording({}, {result:{}})===null);assert(await archiveRecording({}, {result:{recording_storage_path:'buyer/call.mp3'}})==='buyer/call.mp3')});
