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
-- Superadmin is treated as a superset of admin here, so the superadmin doesn't need a
-- separate admin grant just to assign/delete/edit tasks.
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('admin', 'superadmin')
  );
$$;

-- Role management (promoting/demoting admins) — superadmin also gets task admin powers
-- via is_admin() above, since role in ('admin','superadmin') satisfies that check too.
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

-- 8. Comments, @mentions, and a per-task activity log
create table if not exists task_comments (
  id uuid default gen_random_uuid() primary key,
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body text not null,
  created_at timestamptz default now()
);

-- One row per user tagged in a comment. read_at is what drives the sidebar's unread
-- mention badge — null means unread.
create table if not exists comment_mentions (
  id uuid default gen_random_uuid() primary key,
  comment_id uuid not null references task_comments(id) on delete cascade,
  mentioned_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz default now()
);

-- Backfills created_at if an earlier version of this table already exists.
alter table comment_mentions add column if not exists created_at timestamptz default now();

-- Populated only by the trigger below, never written directly by the app — that's what
-- makes it a trustworthy record of who actually did what.
create table if not exists task_activity (
  id uuid default gen_random_uuid() primary key,
  task_id uuid not null references tasks(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table task_comments enable row level security;
alter table comment_mentions enable row level security;
alter table task_activity enable row level security;

-- Comments are open to everyone, unlike task assignment — anyone can ask/tag anyone.
drop policy if exists "Authenticated users can read comments" on task_comments;
create policy "Authenticated users can read comments"
  on task_comments for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can post comments" on task_comments;
create policy "Authenticated users can post comments"
  on task_comments for insert
  with check (auth.role() = 'authenticated' and author_id = auth.uid());

-- No update policy — comments are immutable once posted, like a chat log. Author or an
-- admin can delete (basic moderation).
drop policy if exists "Author or admin can delete comments" on task_comments;
create policy "Author or admin can delete comments"
  on task_comments for delete using (author_id = auth.uid() or is_admin());

drop policy if exists "Users can read their own mentions" on comment_mentions;
create policy "Users can read their own mentions"
  on comment_mentions for select using (mentioned_id = auth.uid());

-- Restricted to the comment's own author — otherwise anyone could attach a mention to
-- someone else's comment and spoof a fake "you were mentioned" notification.
drop policy if exists "Authenticated users can create mentions" on comment_mentions;
drop policy if exists "Comment author can create mentions" on comment_mentions;
create policy "Comment author can create mentions"
  on comment_mentions for insert
  with check (
    auth.role() = 'authenticated'
    and exists (select 1 from task_comments c where c.id = comment_id and c.author_id = auth.uid())
  );

drop policy if exists "Users can mark their own mentions read" on comment_mentions;
create policy "Users can mark their own mentions read"
  on comment_mentions for update
  using (mentioned_id = auth.uid()) with check (mentioned_id = auth.uid());

drop policy if exists "Authenticated users can read task activity" on task_activity;
create policy "Authenticated users can read task activity"
  on task_activity for select using (auth.role() = 'authenticated');
-- Deliberately no insert/update/delete policy on task_activity for any role — the only
-- way rows get created is the security-definer trigger below, which bypasses RLS.

create or replace function log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if TG_OP = 'INSERT' then
    insert into task_activity (task_id, actor_id, action, detail)
    values (new.id, new.created_by, 'created', '{}'::jsonb);
    return new;
  end if;

  if TG_OP = 'UPDATE' then
    if new.assignee_id is distinct from old.assignee_id then
      insert into task_activity (task_id, actor_id, action, detail)
      values (
        new.id, auth.uid(),
        case when new.assignee_id is null then 'unassigned' else 'assigned' end,
        jsonb_build_object('from_id', old.assignee_id, 'to_id', new.assignee_id)
      );
    end if;
    if new.status is distinct from old.status then
      insert into task_activity (task_id, actor_id, action, detail)
      values (new.id, auth.uid(), 'status_changed', jsonb_build_object('from', old.status, 'to', new.status));
    end if;
    if new.priority is distinct from old.priority then
      insert into task_activity (task_id, actor_id, action, detail)
      values (new.id, auth.uid(), 'priority_changed', jsonb_build_object('from', old.priority, 'to', new.priority));
    end if;
    if new.title is distinct from old.title then
      insert into task_activity (task_id, actor_id, action, detail)
      values (new.id, auth.uid(), 'title_changed', jsonb_build_object('from', old.title, 'to', new.title));
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists log_task_activity_trigger on tasks;
create trigger log_task_activity_trigger
  after insert or update on tasks
  for each row execute procedure log_task_activity();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_comments'
  ) then
    alter publication supabase_realtime add table task_comments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_activity'
  ) then
    alter publication supabase_realtime add table task_activity;
  end if;
  -- Without this the sidebar's unread-mention badge never updates live, so it keeps
  -- showing a stale count after you've read the mentions.
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comment_mentions'
  ) then
    alter publication supabase_realtime add table comment_mentions;
  end if;
end $$;
