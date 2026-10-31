create table public.daisy_owner_call_requests (
 owner_id uuid not null references auth.users(id) on delete cascade,
 conversation_id text not null check(conversation_id='legacy' or conversation_id ~ '^[0-9a-fA-F-]{36}$'),
 request_id uuid not null,
 request jsonb not null check(jsonb_typeof(request)='object'),
 status text not null check(status in ('awaiting_details','dispatching','submitted','failed','cancelled')),
 version bigint not null default 1,
 expires_at timestamptz not null,
 updated_at timestamptz not null default now(),
 primary key(owner_id,conversation_id)
);
alter table public.daisy_owner_call_requests enable row level security;
revoke all on public.daisy_owner_call_requests from anon,authenticated;
grant select,insert,update,delete on public.daisy_owner_call_requests to service_role;
comment on table public.daisy_owner_call_requests is 'Server-only pending owner call requests; context is isolated by owner and conversation, expires after 30 minutes, and is claimed before dispatch.';
create table public.daisy_owner_call_turns (
 owner_id uuid not null references auth.users(id) on delete cascade,
 turn_id uuid not null,
 conversation_id text not null,
 request_id uuid not null,
 status text not null default 'processing' check(status in ('processing','done')),
 answer text,
 created_at timestamptz not null default now(),
 primary key(owner_id,turn_id)
);
alter table public.daisy_owner_call_turns enable row level security;
revoke all on public.daisy_owner_call_turns from anon,authenticated;
grant select,insert,update,delete on public.daisy_owner_call_turns to service_role;
