-- Buddyline skins: per-user appearance settings that follow the account across devices,
-- plus a fix so away auto-responses address the person who triggered them (%n).

-- ---------------------------------------------------------------- settings
create table if not exists chat.settings (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  skin jsonb not null default '{}'::jsonb
    check (jsonb_typeof(skin) = 'object' and pg_column_size(skin) <= 2048),
  updated_at timestamptz not null default now()
);
alter table chat.settings enable row level security;

drop policy if exists "settings: read own" on chat.settings;
create policy "settings: read own" on chat.settings for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "settings: insert own" on chat.settings;
create policy "settings: insert own" on chat.settings for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "settings: update own" on chat.settings;
create policy "settings: update own" on chat.settings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on chat.settings from public, anon;
grant select, insert (user_id, skin, updated_at), update (skin, updated_at) on chat.settings to authenticated;

-- Keep only known keys with safe values: colors are #rrggbb, choices are short slugs, numbers are bounded.
create or replace function chat.clean_skin(s jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(coalesce(s, '{}'::jsonb)) as e(k, v)
   where (k in ('accent', 'wall') and jsonb_typeof(v) = 'string' and v #>> '{}' ~ '^#[0-9a-fA-F]{6}$')
      or (k in ('preset', 'bg', 'chrome', 'font', 'size', 'density', 'bubble', 'icon') and jsonb_typeof(v) = 'string' and v #>> '{}' ~ '^[a-z0-9-]{1,20}$')
      or (k = 'radius' and jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between 0 and 2)
      or (k = 'v' and jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between 0 and 99)
$$;
revoke execute on function chat.clean_skin(jsonb) from public, anon;
grant execute on function chat.clean_skin(jsonb) to authenticated;

-- Invoker functions: RLS on chat.settings decides what each caller can touch.
create or replace function public.chat_my_skin()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select skin from chat.settings where user_id = (select auth.uid())
$$;

create or replace function public.chat_save_skin(p_skin jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  insert into chat.settings (user_id, skin, updated_at) values ((select auth.uid()), chat.clean_skin(p_skin), now())
  on conflict (user_id) do update set skin = excluded.skin, updated_at = excluded.updated_at
  returning skin
$$;
revoke execute on function public.chat_my_skin(), public.chat_save_skin(jsonb) from public, anon;
grant execute on function public.chat_my_skin(), public.chat_save_skin(jsonb) to authenticated;

-- ---------------------------------------------------------------- away auto-response: %n is the person who IMed
create or replace function chat.away_reply(m chat.messages)
returns void language plpgsql security definer set search_path = '' as $$
declare
  other chat.profiles;
  sender_name text;
begin
  if m.kind <> 'text' or m.deleted_at is not null then return; end if;
  if exists (select 1 from chat.profiles where id = m.user_id and is_bot) then return; end if;
  select p.* into other from chat.rooms r
    join chat.members x on x.room_id = r.id and x.user_id <> m.user_id
    join chat.profiles p on p.id = x.user_id
   where r.id = m.room_id and r.kind = 'dm'
   limit 1;
  if not found or other.status <> 'away' or coalesce(btrim(other.away_message), '') = '' or other.away_since is null then return; end if;
  insert into chat.away_replies (user_id, sender, away_since) values (other.id, m.user_id, other.away_since)
  on conflict do nothing;
  if not found then return; end if;
  select display_name into sender_name from chat.profiles where id = m.user_id;
  insert into chat.messages (room_id, user_id, body, kind, created_at)
  values (m.room_id, other.id, replace(other.away_message, '%n', coalesce(sender_name, 'there')), 'away', clock_timestamp() + interval '2 milliseconds');
end $$;
