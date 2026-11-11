-- HOME INVENTORY: run this complete script in a NEW Supabase project:
-- Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Do not run this over existing tables with these names that contain other data.
-- It creates private, per-account data tables with row-level security.

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now(),
  unique(user_id,id)
);
create unique index if not exists rooms_user_name_ci on public.rooms(user_id,lower(name));
create index if not exists rooms_user_idx on public.rooms(user_id);

create table if not exists public.boxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  room_id uuid not null,
  code text not null check (length(btrim(code)) between 1 and 60),
  name text not null check (length(btrim(name)) between 1 and 120),
  location text not null default '' check (length(location) <= 180),
  created_at timestamptz not null default now(),
  unique(user_id,id),
  constraint boxes_owner_room_fkey foreign key(user_id,room_id)
    references public.rooms(user_id,id) on delete restrict
);
create unique index if not exists boxes_user_code_ci on public.boxes(user_id,lower(code));
create index if not exists boxes_user_room_idx on public.boxes(user_id,room_id);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  box_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 160),
  qty integer not null default 1 check (qty between 1 and 999999),
  notes text not null default '' check (length(notes) <= 500),
  created_at timestamptz not null default now(),
  constraint items_owner_box_fkey foreign key(user_id,box_id)
    references public.boxes(user_id,id) on delete restrict
);
create index if not exists items_user_box_idx on public.items(user_id,box_id);

-- Guard all data even though the site itself is publicly hosted.
alter table public.rooms enable row level security;
alter table public.boxes enable row level security;
alter table public.items enable row level security;

revoke all on public.rooms, public.boxes, public.items from public, anon, authenticated;
grant select, insert, update, delete on public.rooms, public.boxes, public.items to authenticated;

-- Each operation is explicitly scoped to the logged-in user.
create policy "rooms_select_own" on public.rooms for select to authenticated using (user_id = (select auth.uid()));
create policy "rooms_insert_own" on public.rooms for insert to authenticated with check (user_id = (select auth.uid()));
create policy "rooms_update_own" on public.rooms for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "rooms_delete_own" on public.rooms for delete to authenticated using (user_id = (select auth.uid()));

create policy "boxes_select_own" on public.boxes for select to authenticated using (user_id = (select auth.uid()));
create policy "boxes_insert_own" on public.boxes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "boxes_update_own" on public.boxes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "boxes_delete_own" on public.boxes for delete to authenticated using (user_id = (select auth.uid()));

create policy "items_select_own" on public.items for select to authenticated using (user_id = (select auth.uid()));
create policy "items_insert_own" on public.items for insert to authenticated with check (user_id = (select auth.uid()));
create policy "items_update_own" on public.items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "items_delete_own" on public.items for delete to authenticated using (user_id = (select auth.uid()));

-- One atomic transaction for restoring a JSON backup. If any INSERT fails,
-- all DELETEs and INSERTs performed by this function are rolled back.
-- SECURITY INVOKER: database RLS remains in force for every statement.
create or replace function public.replace_inventory(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  rec jsonb;
begin
  if v_uid is null then
    raise exception 'You must sign in before restoring data.';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Invalid backup object.';
  end if;
  if jsonb_typeof(payload->'rooms') is distinct from 'array'
     or jsonb_typeof(payload->'boxes') is distinct from 'array'
     or jsonb_typeof(payload->'items') is distinct from 'array' then
    raise exception 'Backup requires rooms, boxes, and items arrays.';
  end if;
  if jsonb_array_length(payload->'rooms') > 200
     or jsonb_array_length(payload->'boxes') > 5000
     or jsonb_array_length(payload->'items') > 30000 then
    raise exception 'Backup exceeds the configured size limits.';
  end if;

  delete from public.items where user_id = v_uid;
  delete from public.boxes where user_id = v_uid;
  delete from public.rooms where user_id = v_uid;

  for rec in select value from jsonb_array_elements(payload->'rooms') loop
    insert into public.rooms(id,user_id,name)
      values ((rec->>'id')::uuid, v_uid, btrim(rec->>'name'));
  end loop;
  for rec in select value from jsonb_array_elements(payload->'boxes') loop
    insert into public.boxes(id,user_id,room_id,code,name,location)
      values ((rec->>'id')::uuid, v_uid, (rec->>'roomId')::uuid,
              btrim(rec->>'code'), btrim(rec->>'name'), coalesce(btrim(rec->>'location'),''));
  end loop;
  for rec in select value from jsonb_array_elements(payload->'items') loop
    insert into public.items(id,user_id,box_id,name,qty,notes)
      values ((rec->>'id')::uuid, v_uid, (rec->>'boxId')::uuid,
              btrim(rec->>'name'), (rec->>'qty')::integer, coalesce(btrim(rec->>'notes'),''));
  end loop;
end;
$$;

revoke all on function public.replace_inventory(jsonb) from public, anon, authenticated;
grant execute on function public.replace_inventory(jsonb) to authenticated;

-- Done! Now continue the README steps for GitHub Pages and app sign-in.
