begin;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('prephub-documents','prephub-documents',false,52428800,array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.prephub_document_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 lead_id uuid not null references public.prephub_leads(id),
 content jsonb not null default '{"version":2,"people":[]}'::jsonb check (jsonb_typeof(content)='object' and octet_length(content::text)<=65536),
 revision integer not null default 0,
 updated_at timestamptz not null default now()
);
create table if not exists public.prephub_documents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 lead_id uuid not null references public.prephub_leads(id),
 person_id uuid not null,
 category text not null check(category in ('identity','pay','w2','tax','bank','contract','business','benefit','other')),
 slot_id text not null check(length(slot_id) between 1 and 64),
 period_label text not null default '' check(length(period_label)<=100),
 filename text not null check(length(filename) between 1 and 200),
 storage_path text not null unique check(split_part(storage_path,'/',1)=user_id::text and position('..' in storage_path)=0),
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png')),
 size_bytes bigint not null check(size_bytes between 1 and 52428800),
 checksum text not null check(checksum ~ '^[a-f0-9]{64}$'),
 state text not null default 'pending' check(state in ('pending','saved','removed')),
 created_at timestamptz not null default now(),
 saved_at timestamptz,
 removed_at timestamptz
);
create index if not exists prephub_documents_owner_state_idx on public.prephub_documents(user_id,state,created_at);
create index if not exists prephub_documents_lead_idx on public.prephub_documents(lead_id);
create unique index if not exists prephub_documents_no_duplicates_idx on public.prephub_documents(user_id,person_id,category,slot_id,checksum) where state <> 'removed';
create table if not exists public.prephub_document_packets (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 lead_id uuid not null references public.prephub_leads(id),
 recipient text not null check(length(recipient) between 3 and 254),
 document_ids uuid[] not null check(cardinality(document_ids) between 1 and 200),
 state text not null default 'sending' check(state in ('sending','sent','failed')),
 payload jsonb not null,
 email_id text,
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
create index if not exists prephub_document_packets_owner_time_idx on public.prephub_document_packets(user_id,created_at);
create index if not exists prephub_document_packets_lead_idx on public.prephub_document_packets(lead_id);
alter table public.prephub_document_workspaces enable row level security;
alter table public.prephub_documents enable row level security;
alter table public.prephub_document_packets enable row level security;
revoke all on public.prephub_document_workspaces,public.prephub_documents,public.prephub_document_packets from anon,authenticated;
grant select on public.prephub_document_workspaces,public.prephub_documents,public.prephub_document_packets to authenticated;
grant all on public.prephub_document_workspaces,public.prephub_documents,public.prephub_document_packets to service_role;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='prephub_document_workspaces' and policyname='Read own document workspace') then
  create policy "Read own document workspace" on public.prephub_document_workspaces for select to authenticated using((select auth.uid())=user_id);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='prephub_documents' and policyname='Read own document records') then
  create policy "Read own document records" on public.prephub_documents for select to authenticated using((select auth.uid())=user_id);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='prephub_document_packets' and policyname='Read own lender packet history') then
  create policy "Read own lender packet history" on public.prephub_document_packets for select to authenticated using((select auth.uid())=user_id);
 end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Read own PrepHub documents') then
  create policy "Read own PrepHub documents" on storage.objects for select to authenticated using(bucket_id='prephub-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
 end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Upload reserved PrepHub documents') then
  create policy "Upload reserved PrepHub documents" on storage.objects for insert to authenticated with check(bucket_id='prephub-documents' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.prephub_documents d where d.user_id=(select auth.uid()) and d.storage_path=name and d.state='pending'));
 end if;
end $$;
commit;
