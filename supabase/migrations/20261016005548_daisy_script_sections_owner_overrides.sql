begin;
alter table public.daisy_call_scripts add column direction text not null default 'outbound' check(direction in ('inbound','outbound'));
alter table public.daisy_call_scripts add column script_number bigint generated always as identity unique;
alter table public.daisy_call_scripts add column deleted_at timestamptz;
create index daisy_call_scripts_direction_idx on public.daisy_call_scripts(direction,script_number);
commit;
