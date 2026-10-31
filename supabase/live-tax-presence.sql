alter table public.prephub_page_presence add column if not exists tax_draft jsonb;
do $$ begin
 if not exists (select 1 from pg_constraint where conname='prephub_presence_tax_draft_size' and conrelid='public.prephub_page_presence'::regclass) then
 alter table public.prephub_page_presence add constraint prephub_presence_tax_draft_size check (tax_draft is null or (jsonb_typeof(tax_draft)='object' and octet_length(tax_draft::text)<=3000));
 end if;
end $$;
