-- Run this entire file in your Supabase SQL Editor.
-- Safe to re-run any time — every statement is idempotent.

-- 1. Profiles table (auto-populated on signup)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  created_at timestamptz default now()
);

alter table profiles add column if not exists role text not null default 'member';

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('member','admin','superadmin'));

-- At most one superadmin can ever exist.
create unique index if not exists profiles_one_superadmin on profiles (role) where role = 'superadmin';

-- 2. Tasks table
create table if not exists tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','inprogress','done')),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  assignee_id uuid references profiles(id) on delete set null,
  assignee_email text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Auto-create profile on signup
-- security definer functions resolve unqualified table/function names using the
-- *caller's* search_path, not the definer's — Supabase's Auth service connects as its
-- own internal role, whose search_path doesn't include `public`. `set search_path`
-- pins it explicitly so this always resolves `profiles` correctly regardless of caller.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- 4. Roles & authorization helper — must exist before any policy below can reference it
-- (CREATE POLICY resolves function calls immediately, unlike plpgsql trigger bodies).
-- security definer means it bypasses RLS, so it's safe to call from any policy without
-- recursive-policy issues.
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Scoped strictly to role management (promoting/demoting admins) — deliberately does
-- NOT get task admin powers (assign/delete/edit); see is_admin() above for that.
create or replace function is_superadmin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'superadmin'
  );
$$;

-- 5. RLS
alter table tasks enable row level security;
alter table profiles enable row level security;

drop policy if exists "Authenticated users can read tasks" on tasks;
create policy "Authenticated users can read tasks"
  on tasks for select using (auth.role() = 'authenticated');

-- Members can only create unassigned tasks (and can't spoof who created it);
-- admins can create tasks pre-assigned to anyone.
drop policy if exists "Authenticated users can insert tasks" on tasks;
drop policy if exists "Members create unassigned tasks, admins create any" on tasks;
create policy "Members create unassigned tasks, admins create any"
  on tasks for insert
  with check (
    auth.role() = 'authenticated'
    and created_by = auth.uid()
    and (assignee_id is null or is_admin())
  );

-- A member can only update rows already assigned to them; admins can update any row.
-- (Which *columns* they're allowed to touch is enforced by the trigger below.)
drop policy if exists "Authenticated users can update tasks" on tasks;
drop policy if exists "Admins update any task, members update their own" on tasks;
create policy "Admins update any task, members update their own"
  on tasks for update
  using (is_admin() or assignee_id = auth.uid())
  with check (is_admin() or assignee_id = auth.uid());

drop policy if exists "Authenticated users can delete tasks" on tasks;
drop policy if exists "Only admins can delete tasks" on tasks;
create policy "Only admins can delete tasks"
  on tasks for delete using (is_admin());

drop policy if exists "Authenticated users can read profiles" on profiles;
create policy "Authenticated users can read profiles"
  on profiles for select using (auth.role() = 'authenticated');

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Admins can update any profile" on profiles;
drop policy if exists "Superadmin can update any profile" on profiles;
create policy "Superadmin can update any profile"
  on profiles for update using (is_superadmin()) with check (is_superadmin());

-- 6. Enable realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table tasks;
  end if;
end $$;

-- 7. Enforcement triggers
-- The update policy above only restricts *which rows* a member can update (their own).
-- This trigger restricts *which columns* they're allowed to change on that row: members
-- may only change `status`; everything else (assignment, title, description, priority,
-- created_by) is admin-only.
create or replace function enforce_task_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_admin() then
    if new.assignee_id is distinct from old.assignee_id
       or new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.priority is distinct from old.priority
       or new.created_by is distinct from old.created_by then
      raise exception 'Only admins can edit task details or reassign tasks';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_task_update_rules_trigger on tasks;
create trigger enforce_task_update_rules_trigger
  before update on tasks
  for each row execute procedure enforce_task_update_rules();

-- The "users can update own profile" policy above lets everyone edit their own row
-- (e.g. full_name) — without this trigger a member could use that same policy to set
-- their own role to 'admin'. Only the superadmin may change member/admin roles, and
-- the superadmin role itself can never be granted or revoked through the app at all
-- (not even by the superadmin) — that keeps it to exactly one, set only via direct SQL.
create or replace function enforce_profile_role_lock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role then
    -- auth.uid() is null for direct SQL Editor / service-role access, already gated by
    -- Supabase project ownership — always allowed (this is how the superadmin is bootstrapped).
    if auth.uid() is not null then
      if new.role = 'superadmin' or old.role = 'superadmin' then
        raise exception 'The superadmin role can only be changed directly in the database';
      end if;
      if not is_superadmin() then
        raise exception 'Only the superadmin can change roles';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_profile_role_lock_trigger on profiles;
create trigger enforce_profile_role_lock_trigger
  before update on profiles
  for each row execute procedure enforce_profile_role_lock();
