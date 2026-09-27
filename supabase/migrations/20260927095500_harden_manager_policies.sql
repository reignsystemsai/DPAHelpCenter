create or replace function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.manager_members
    where user_id = auth.uid() and active
  );
$$;

revoke all on function public.is_manager() from authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_manager() to authenticated;

drop policy if exists "Managers can read team members" on public.manager_members;
drop policy if exists "Owners can manage team members" on public.manager_members;
create policy "Managers can read team members" on public.manager_members for select to authenticated using (private.is_manager());
create policy "Owners can add team members" on public.manager_members for insert to authenticated
with check (private.is_manager() and exists (select 1 from public.manager_members m where m.user_id = (select auth.uid()) and m.active and m.role = 'owner'));
create policy "Owners can update team members" on public.manager_members for update to authenticated
using (private.is_manager() and exists (select 1 from public.manager_members m where m.user_id = (select auth.uid()) and m.active and m.role = 'owner'))
with check (private.is_manager() and exists (select 1 from public.manager_members m where m.user_id = (select auth.uid()) and m.active and m.role = 'owner'));
create policy "Owners can delete team members" on public.manager_members for delete to authenticated
using (private.is_manager() and exists (select 1 from public.manager_members m where m.user_id = (select auth.uid()) and m.active and m.role = 'owner'));

drop policy if exists "Managers can manage lead operations" on public.lead_operations;
drop policy if exists "Managers can manage lead notes" on public.lead_notes;
drop policy if exists "Managers can manage communications" on public.lead_communications;
drop policy if exists "Managers can manage Helux cases" on public.helux_cases;
drop policy if exists "Managers can manage webinars" on public.webinars;
drop policy if exists "Managers can manage webinar registrations" on public.webinar_registrations;
drop policy if exists "Managers can read integration events" on public.integration_events;
drop policy if exists "Managers can retry integration events" on public.integration_events;
drop policy if exists "Managers can read all PrepHub leads" on public.prephub_leads;
drop policy if exists "Managers can update PrepHub leads" on public.prephub_leads;
drop policy if exists "Managers can read all preparation tasks" on public.preparation_tasks;
drop policy if exists "Managers can update all preparation tasks" on public.preparation_tasks;

create policy "Managers can manage lead operations" on public.lead_operations for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "Managers can manage lead notes" on public.lead_notes for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "Managers can manage communications" on public.lead_communications for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "Managers can manage Helux cases" on public.helux_cases for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "Managers can manage webinars" on public.webinars for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "Managers can manage webinar registrations" on public.webinar_registrations for all to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "Managers can read integration events" on public.integration_events for select to authenticated using (private.is_manager());
create policy "Managers can retry integration events" on public.integration_events for update to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "Managers can read all PrepHub leads" on public.prephub_leads for select to authenticated using (private.is_manager());
create policy "Managers can update PrepHub leads" on public.prephub_leads for update to authenticated using (private.is_manager()) with check (private.is_manager());
create policy "Managers can read all preparation tasks" on public.preparation_tasks for select to authenticated using (private.is_manager());
create policy "Managers can update all preparation tasks" on public.preparation_tasks for update to authenticated using (private.is_manager()) with check (private.is_manager());

drop policy if exists "Managers can read manager files" on storage.objects;
drop policy if exists "Managers can upload manager files" on storage.objects;
drop policy if exists "Managers can update manager files" on storage.objects;
drop policy if exists "Managers can delete manager files" on storage.objects;
create policy "Managers can read manager files" on storage.objects for select to authenticated using (bucket_id in ('webinar-videos','manager-avatars') and private.is_manager());
create policy "Managers can upload manager files" on storage.objects for insert to authenticated with check (bucket_id in ('webinar-videos','manager-avatars') and private.is_manager());
create policy "Managers can update manager files" on storage.objects for update to authenticated using (bucket_id in ('webinar-videos','manager-avatars') and private.is_manager()) with check (bucket_id in ('webinar-videos','manager-avatars') and private.is_manager());
create policy "Managers can delete manager files" on storage.objects for delete to authenticated using (bucket_id in ('webinar-videos','manager-avatars') and private.is_manager());

create index if not exists lead_operations_owner_user_id_idx on public.lead_operations(owner_user_id);
create index if not exists lead_notes_author_user_id_idx on public.lead_notes(author_user_id);
create index if not exists webinars_created_by_idx on public.webinars(created_by);
