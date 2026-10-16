insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('daisy-call-recordings','daisy-call-recordings',false,40000000,array['audio/mpeg']) on conflict(id) do nothing;
