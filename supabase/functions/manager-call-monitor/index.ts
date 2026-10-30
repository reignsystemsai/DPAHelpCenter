import {createClient} from 'npm:@supabase/supabase-js@2.112.3';
import {createMonitorHandler} from './handler.mjs';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createMonitorHandler(db,{key:()=>Deno.env.get('HELUX_API_KEY')}));
