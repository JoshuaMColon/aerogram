-- Aerogram: real-time chat in its own `chat` schema.
-- Everything is members-only through RLS. Rows cascade away with the auth user, so the project's
-- hourly guest cleanup (anonymous users older than a day) also removes /demo data.
create schema if not exists chat;
revoke all on schema chat from public, anon;
grant usage on schema chat to authenticated, service_role;

-- ---------------------------------------------------------------- tables
create table chat.profiles (
  id uuid primary key,
  -- Humans: auth_id = id. Seed bots have no auth user.
  auth_id uuid unique references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  stamp smallint not null default 0 check (stamp between 0 and 11),
  bio text not null default '' check (char_length(bio) <= 160),
  is_bot boolean not null default false,
  is_guest boolean not null default false,
  created_at timestamptz not null default now(),
  check (is_bot or auth_id = id)
);

create table chat.rooms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('public', 'dm')),
  slug text unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name text check (char_length(name) between 2 and 40),
  topic text not null default '' check (char_length(topic) <= 140),
  dm_key text unique,
  created_by uuid references chat.profiles (id) on delete cascade,
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check ((kind = 'public' and slug is not null and name is not null and dm_key is null)
      or (kind = 'dm' and dm_key is not null and slug is null))
);
create index rooms_created_by on chat.rooms (created_by);

-- A surrogate key so Realtime DELETE events (which carry only the primary key) reveal nothing.
create table chat.members (
  id bigint generated always as identity primary key,
  room_id uuid not null references chat.rooms (id) on delete cascade,
  user_id uuid not null references chat.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  unique (room_id, user_id)
);
create index members_user on chat.members (user_id);

create table chat.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references chat.rooms (id) on delete cascade,
  user_id uuid not null references chat.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  -- {path, name, mime, size, w?, h?}; the file itself lives in the private chat-files bucket.
  attachment jsonb check (attachment is null or (jsonb_typeof(attachment) = 'object' and pg_column_size(attachment) < 2000)),
  -- {"👍": ["<user uuid>", ...]}; written only by chat_toggle_reaction.
  reactions jsonb not null default '{}'::jsonb check (jsonb_typeof(reactions) = 'object' and pg_column_size(reactions) < 8000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index messages_room_time on chat.messages (room_id, created_at desc, id desc);
create index messages_user_time on chat.messages (user_id, created_at desc);
create index messages_attachment_path on chat.messages ((attachment ->> 'path')) where attachment is not null;

-- ---------------------------------------------------------------- helpers
create or replace function chat.is_member(r uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from chat.members m where m.room_id = r and m.user_id = (select auth.uid()))
$$;

create or replace function chat.is_guest()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
$$;

-- Realtime channel topics: 'chat:lobby' (presence for everyone signed in) and
-- 'chat:room:<uuid>' (typing broadcasts, members only).
create or replace function chat.can_use_topic(t text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when t = 'chat:lobby' then (select auth.uid()) is not null
    when t ~ '^chat:room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then chat.is_member(substr(t, 11)::uuid)
    else false
  end
$$;

-- Storage paths are <room_id>/<user_id>/<file>.
create or replace function chat.path_room(p text)
returns uuid language sql immutable set search_path = '' as $$
  select case when split_part(p, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p, '/', 1)::uuid end
$$;

create or replace function chat.can_upload(p text)
returns boolean language sql stable security definer set search_path = '' as $$
  select chat.is_member(chat.path_room(p))
     and split_part(p, '/', 2) = (select auth.uid())::text
     and split_part(p, '/', 3) <> ''
     and split_part(p, '/', 4) = ''
     -- guests: at most 12 files live at once
     and (not chat.is_guest() or (select count(*) from storage.objects o
            where o.bucket_id = 'chat-files' and o.owner_id = (select auth.uid())::text) < 12)
$$;

create or replace function chat.slugify(s text)
returns text language sql immutable set search_path = '' as $$
  select left(trim(both '-' from regexp_replace(lower(coalesce(s, '')), '[^a-z0-9]+', '-', 'g')), 36)
$$;

-- ---------------------------------------------------------------- guards (client writes)
create or replace function chat.guard_message()
returns trigger language plpgsql set search_path = '' as $$
declare
  trusted boolean := current_user not in ('authenticated', 'anon');
  recent integer;
begin
  if tg_op = 'INSERT' then
    new.body := btrim(coalesce(new.body, ''));
    if not trusted then
      new.created_at := now(); new.edited_at := null; new.deleted_at := null; new.reactions := '{}'::jsonb;
      if new.attachment is not null then
        if not (new.attachment ? 'path' and new.attachment ? 'name' and new.attachment ? 'mime' and new.attachment ? 'size')
           or (new.attachment ->> 'path') not like new.room_id::text || '/' || new.user_id::text || '/%' then
          raise exception 'Invalid attachment' using errcode = 'check_violation';
        end if;
      end if;
      select count(*) into recent from chat.messages
       where user_id = new.user_id and created_at > now() - interval '20 seconds';
      if recent >= 12 then
        raise exception 'Slow down a little: too many messages at once' using errcode = 'check_violation';
      end if;
      if chat.is_guest() and (select count(*) from chat.messages where user_id = new.user_id) >= 400 then
        raise exception 'Guest message limit reached' using errcode = 'check_violation';
      end if;
    end if;
    if new.body = '' and new.attachment is null then
      raise exception 'Message is empty' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- UPDATE
  new.id := old.id; new.room_id := old.room_id; new.user_id := old.user_id; new.created_at := old.created_at;
  if trusted then return new; end if;
  new.reactions := old.reactions;
  if old.deleted_at is not null then
    raise exception 'Message was deleted' using errcode = 'check_violation';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now(); new.body := ''; new.attachment := null; new.reactions := '{}'::jsonb;
    return new;
  end if;
  new.attachment := old.attachment;
  new.body := btrim(coalesce(new.body, ''));
  if new.body is distinct from old.body then
    if new.body = '' and new.attachment is null then
      raise exception 'Message is empty' using errcode = 'check_violation';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end $$;
create trigger guard_message before insert or update on chat.messages
  for each row execute function chat.guard_message();

create or replace function chat.after_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update chat.rooms set last_message_at = new.created_at where id = new.room_id and last_message_at < new.created_at;
  update chat.members set last_read_at = new.created_at
   where room_id = new.room_id and user_id = new.user_id and last_read_at < new.created_at;
  perform chat.pip_reply(new);
  return null;
end $$;

create or replace function chat.guard_member()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.joined_at := now(); new.last_read_at := now();
    return new;
  end if;
  new.room_id := old.room_id; new.user_id := old.user_id; new.joined_at := old.joined_at;
  new.last_read_at := least(greatest(new.last_read_at, old.last_read_at), now());
  return new;
end $$;
create trigger guard_member before insert or update on chat.members
  for each row execute function chat.guard_member();

-- A DM is meaningless once one side is gone (e.g. an expired guest): remove it entirely.
create or replace function chat.after_member_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from chat.rooms r where r.kind = 'dm' and r.id in (select room_id from gone);
  return null;
end $$;
create trigger after_member_delete after delete on chat.members
  referencing old table as gone for each statement execute function chat.after_member_delete();

create or replace function chat.guard_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.display_name := btrim(new.display_name);
  if current_user not in ('authenticated', 'anon') then return new; end if;
  new.id := old.id; new.auth_id := old.auth_id; new.is_bot := old.is_bot;
  new.is_guest := old.is_guest; new.created_at := old.created_at;
  new.bio := btrim(new.bio);
  return new;
end $$;
create trigger guard_profile before update on chat.profiles
  for each row execute function chat.guard_profile();

-- ---------------------------------------------------------------- Pip, the concierge bot
-- Canned, deterministic replies (no AI): DM Pip and it answers instantly.
create or replace function chat.pip_reply(m chat.messages)
returns void language plpgsql security definer set search_path = '' as $$
declare
  pip constant uuid := 'a0e70000-0000-4000-8000-000000000001';
  b text := lower(coalesce(m.body, ''));
  n integer;
  reply text;
  tips constant text[] := array[
    'Tip: hover (or long-press) any message to react, edit or delete it.',
    'Tip: open the same room in a second window and watch messages, typing and read receipts arrive live.',
    'Tip: the paperclip sends images and files (up to 5 MB). They live in private storage, visible only to room members.',
    'Tip: the stamp next to a name turns green when that person is online.',
    'Tip: press the moon/sun in the corner to switch between Airmail (light) and Night Mail (dark).',
    'Tip: scroll up in The Lobby to load older history. It pages in 40 messages at a time.'
  ];
begin
  if m.user_id = pip or m.deleted_at is not null then return; end if;
  if not exists (select 1 from chat.rooms r join chat.members x on x.room_id = r.id
                  where r.id = m.room_id and r.kind = 'dm' and x.user_id = pip) then
    return;
  end if;
  select count(*) into n from chat.messages where room_id = m.room_id and user_id = pip;
  if n >= 60 then return; end if;
  if b ~ '\m(hi|hello|hey|yo|howdy|morning)\M' then
    reply := 'Hello! I''m Pip, Aerogram''s concierge. Ask me about "features", "privacy" or "realtime", or just say anything for a tip.';
  elsif b ~ 'feature|what can|help' then
    reply := 'Aerogram has public rooms, 1:1 DMs, live delivery, typing indicators, read receipts, unread counts, reactions, edits, deletes and file sharing. Try any of them on me.';
  elsif b ~ 'privacy|secure|rls|safe' then
    reply := 'Every row is guarded by Postgres row-level security: you can only read rooms you belong to, and files sit in a private bucket scoped to room members.';
  elsif b ~ 'realtime|live|how does' then
    reply := 'Messages arrive through Supabase Realtime (Postgres changes), while typing and who''s online travel over private broadcast and presence channels.';
  elsif m.attachment is not null then
    reply := 'Got your file! Only the two of us can open it.';
  else
    reply := tips[1 + (n % array_length(tips, 1))];
  end if;
  insert into chat.messages (room_id, user_id, body, created_at)
  values (m.room_id, pip, reply, clock_timestamp() + interval '1 millisecond');
end $$;

create trigger after_message after insert on chat.messages
  for each row execute function chat.after_message();

-- ---------------------------------------------------------------- RLS
alter table chat.profiles enable row level security;
alter table chat.rooms enable row level security;
alter table chat.members enable row level security;
alter table chat.messages enable row level security;

create policy "profiles are visible to signed-in users" on chat.profiles for select to authenticated using (true);
create policy "edit own profile" on chat.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "public rooms or my rooms" on chat.rooms for select to authenticated
  using (kind = 'public' or chat.is_member(id));

create policy "see members of my rooms" on chat.members for select to authenticated
  using (user_id = (select auth.uid()) or chat.is_member(room_id));
create policy "join public rooms" on chat.members for insert to authenticated
  with check (user_id = (select auth.uid())
    and exists (select 1 from chat.rooms r where r.id = room_id and r.kind = 'public'));
create policy "update own membership" on chat.members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "leave public rooms" on chat.members for delete to authenticated
  using (user_id = (select auth.uid())
    and exists (select 1 from chat.rooms r where r.id = room_id and r.kind = 'public'));

create policy "members read messages" on chat.messages for select to authenticated
  using (chat.is_member(room_id));
create policy "members post as themselves" on chat.messages for insert to authenticated
  with check (user_id = (select auth.uid()) and chat.is_member(room_id));
create policy "authors edit or delete their messages" on chat.messages for update to authenticated
  using (user_id = (select auth.uid()) and chat.is_member(room_id))
  with check (user_id = (select auth.uid()));

grant select on chat.profiles, chat.rooms, chat.members, chat.messages to authenticated;
grant update (display_name, stamp, bio) on chat.profiles to authenticated;
grant insert (room_id, user_id), update (last_read_at), delete on chat.members to authenticated;
grant insert (id, room_id, user_id, body, attachment), update (body, deleted_at) on chat.messages to authenticated;
grant all on all tables in schema chat to service_role;
revoke execute on all functions in schema chat from public, anon;
grant execute on function chat.is_member(uuid), chat.is_guest(), chat.can_use_topic(text),
  chat.path_room(text), chat.can_upload(text) to authenticated;

-- ---------------------------------------------------------------- API (public views + RPC)
-- `chat` is not in the Data API's exposed schemas (a dashboard setting), so, like XPlan, Recall Lab
-- and the weather app, the client reaches it through security_invoker views: RLS on chat.* applies.
create view public.chat_profiles with (security_invoker = true) as
  select id, display_name, stamp, bio, is_bot, is_guest, created_at from chat.profiles;
create view public.chat_rooms with (security_invoker = true) as
  select id, kind, slug, name, topic, created_by, is_seed, created_at, last_message_at from chat.rooms;
create view public.chat_members with (security_invoker = true) as
  select id, room_id, user_id, joined_at, last_read_at from chat.members;
create view public.chat_messages with (security_invoker = true) as
  select id, room_id, user_id, body, attachment, reactions, created_at, edited_at, deleted_at from chat.messages;
revoke all on public.chat_profiles, public.chat_rooms, public.chat_members, public.chat_messages from public, anon;
grant select on public.chat_profiles, public.chat_rooms, public.chat_members, public.chat_messages to authenticated;
grant update (display_name, stamp, bio) on public.chat_profiles to authenticated;
grant insert (room_id, user_id), update (last_read_at), delete on public.chat_members to authenticated;
grant insert (id, room_id, user_id, body, attachment), update (body, deleted_at) on public.chat_messages to authenticated;
grant all on public.chat_profiles, public.chat_rooms, public.chat_members, public.chat_messages to service_role;

-- First visit: create my profile, join the seed rooms and get a welcome DM from Pip.
create or replace function public.chat_ensure_profile(p_name text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  guest boolean := chat.is_guest();
  pip constant uuid := 'a0e70000-0000-4000-8000-000000000001';
  birds constant text[] := array['Kestrel','Heron','Swift','Finch','Plover','Wren','Tern','Lark','Merlin','Robin','Avocet','Puffin'];
  nm text;
  em text;
  dm uuid;
  prof chat.profiles;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into prof from chat.profiles where id = uid;
  if found then return to_jsonb(prof); end if;

  nm := nullif(btrim(coalesce(p_name, '')), '');
  if nm is null and not guest then
    select split_part(email, '@', 1) into em from auth.users where id = uid;
    nm := initcap(regexp_replace(coalesce(em, ''), '[^A-Za-z0-9]+', ' ', 'g'));
  end if;
  if nm is null or btrim(nm) = '' then
    nm := 'Guest ' || birds[1 + floor(random() * array_length(birds, 1))::int];
  end if;
  insert into chat.profiles (id, auth_id, display_name, stamp, is_guest)
  values (uid, uid, left(btrim(nm), 32), floor(random() * 12)::smallint, guest)
  returning * into prof;

  insert into chat.members (room_id, user_id)
  select id, uid from chat.rooms where is_seed and kind = 'public'
  on conflict do nothing;

  if exists (select 1 from chat.profiles where id = pip) then
    insert into chat.rooms (kind, dm_key, created_by)
    values ('dm', least(uid::text, pip::text) || ':' || greatest(uid::text, pip::text), uid)
    returning id into dm;
    insert into chat.members (room_id, user_id, last_read_at) values (dm, uid, now() - interval '1 minute'), (dm, pip, now());
    insert into chat.messages (room_id, user_id, body) values (dm, pip,
      'Welcome to Aerogram, ' || prof.display_name || '! I''m Pip. This is a private 1:1 thread: only you and I can read it. Say hi, or ask me about "features".');
  end if;
  return to_jsonb(prof);
end $$;

create or replace function public.chat_create_room(p_name text, p_topic text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  nm text := btrim(coalesce(p_name, ''));
  base text := chat.slugify(p_name);
  s text;
  i integer := 1;
  rid uuid;
begin
  if uid is null or not exists (select 1 from chat.profiles where id = uid) then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if char_length(nm) not between 2 and 40 or char_length(base) < 2 then
    raise exception 'Room names need 2 to 40 characters, including letters or numbers' using errcode = 'check_violation';
  end if;
  if (select count(*) from chat.rooms where created_by = uid and kind = 'public') >= (case when chat.is_guest() then 3 else 20 end) then
    raise exception 'You have reached the room limit' using errcode = 'check_violation';
  end if;
  s := base;
  while exists (select 1 from chat.rooms where slug = s) loop
    i := i + 1; s := left(base, 33) || '-' || i;
  end loop;
  insert into chat.rooms (kind, slug, name, topic, created_by)
  values ('public', s, nm, left(btrim(coalesce(p_topic, '')), 140), uid) returning id into rid;
  insert into chat.members (room_id, user_id) values (rid, uid);
  return rid;
end $$;

create or replace function public.chat_open_dm(p_other uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  k text;
  rid uuid;
begin
  if uid is null or not exists (select 1 from chat.profiles where id = uid) then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_other is null or p_other = uid or not exists (select 1 from chat.profiles where id = p_other) then
    raise exception 'Unknown person' using errcode = 'check_violation';
  end if;
  k := least(uid::text, p_other::text) || ':' || greatest(uid::text, p_other::text);
  select id into rid from chat.rooms where dm_key = k;
  if rid is not null then return rid; end if;
  if (select count(*) from chat.rooms where created_by = uid and kind = 'dm') >= (case when chat.is_guest() then 10 else 200 end) then
    raise exception 'You have reached the conversation limit' using errcode = 'check_violation';
  end if;
  insert into chat.rooms (kind, dm_key, created_by) values ('dm', k, uid) returning id into rid;
  insert into chat.members (room_id, user_id) values (rid, uid), (rid, p_other);
  return rid;
end $$;

create or replace function public.chat_toggle_reaction(p_message uuid, p_emoji text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m chat.messages;
  cur jsonb;
  arr jsonb;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_emoji is null or char_length(p_emoji) not between 1 and 12 or p_emoji ~ '[[:alnum:][:space:]<>"''&]' then
    raise exception 'Not an emoji' using errcode = 'check_violation';
  end if;
  select * into m from chat.messages where id = p_message for update;
  if not found or not chat.is_member(m.room_id) or m.deleted_at is not null then
    raise exception 'Message not found' using errcode = 'check_violation';
  end if;
  cur := m.reactions;
  arr := coalesce(cur -> p_emoji, '[]'::jsonb);
  if arr ? uid::text then
    arr := arr - uid::text;
  else
    if not cur ? p_emoji and (select count(*) from jsonb_object_keys(cur)) >= 12 then
      raise exception 'Too many different reactions' using errcode = 'check_violation';
    end if;
    arr := arr || to_jsonb(uid::text);
  end if;
  cur := case when jsonb_array_length(arr) = 0 then cur - p_emoji else jsonb_set(cur, array[p_emoji], arr) end;
  update chat.messages set reactions = cur where id = p_message;
  return cur;
end $$;

-- My rooms with a last-message preview and an unread count (capped at 99).
create or replace function public.chat_my_rooms()
returns table (id uuid, kind text, slug text, name text, topic text, is_seed boolean, last_message_at timestamptz,
  last_read_at timestamptz, unread integer, last_body text, last_user uuid, last_has_file boolean, last_deleted boolean, dm_user uuid)
language sql stable security invoker set search_path = '' as $$
  select r.id, r.kind, r.slug, r.name, r.topic, r.is_seed, r.last_message_at, m.last_read_at,
    (select count(*)::int from (select 1 from chat.messages x
       where x.room_id = r.id and x.created_at > m.last_read_at and x.user_id <> m.user_id and x.deleted_at is null
       limit 99) u),
    left(lm.body, 140), lm.user_id, lm.attachment is not null, lm.deleted_at is not null,
    case when r.kind = 'dm' then (select o.user_id from chat.members o where o.room_id = r.id and o.user_id <> m.user_id limit 1) end
  from chat.members m
  join chat.rooms r on r.id = m.room_id
  left join lateral (select x.body, x.user_id, x.attachment, x.deleted_at from chat.messages x
                      where x.room_id = r.id order by x.created_at desc, x.id desc limit 1) lm on true
  where m.user_id = (select auth.uid())
  order by r.last_message_at desc
$$;

-- Browse public rooms (with member counts) without being a member.
create or replace function public.chat_public_rooms()
returns table (id uuid, slug text, name text, topic text, is_seed boolean, members integer, last_message_at timestamptz, joined boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.slug, r.name, r.topic, r.is_seed,
    (select count(*)::int from chat.members m where m.room_id = r.id), r.last_message_at,
    exists (select 1 from chat.members m where m.room_id = r.id and m.user_id = (select auth.uid()))
  from chat.rooms r
  where r.kind = 'public' and (select auth.uid()) is not null
  order by r.is_seed desc, r.last_message_at desc
  limit 200
$$;

revoke execute on function public.chat_ensure_profile(text), public.chat_create_room(text, text), public.chat_open_dm(uuid),
  public.chat_toggle_reaction(uuid, text), public.chat_my_rooms(), public.chat_public_rooms() from public, anon;
grant execute on function public.chat_ensure_profile(text), public.chat_create_room(text, text), public.chat_open_dm(uuid),
  public.chat_toggle_reaction(uuid, text), public.chat_my_rooms(), public.chat_public_rooms() to authenticated;

-- ---------------------------------------------------------------- Realtime
alter publication supabase_realtime add table chat.messages, chat.members, chat.rooms;

create policy "Aerogram lobby and room channels: receive" on realtime.messages for select to authenticated
  using (realtime.messages.extension in ('broadcast', 'presence') and chat.can_use_topic((select realtime.topic())));
create policy "Aerogram lobby and room channels: send" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension in ('broadcast', 'presence') and chat.can_use_topic((select realtime.topic())));

-- ---------------------------------------------------------------- Storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-files', 'chat-files', false, 5242880, array[
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain', 'text/csv', 'text/markdown', 'application/zip', 'application/json'])
on conflict (id) do nothing;

create policy "Aerogram: members read room files" on storage.objects for select to authenticated
  using (bucket_id = 'chat-files' and chat.is_member(chat.path_room(name)));
create policy "Aerogram: members upload to their room folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files' and chat.can_upload(name));
create policy "Aerogram: authors delete their files" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-files' and owner_id = (select auth.uid())::text);

-- The existing hourly sweep (cleanup-demo-files Edge Function) removes files through this list.
-- Add chat files from expired guests / deleted users, and orphans whose message is gone.
create or replace function public.demo_files_to_purge(max_rows integer default 500)
returns table (bucket_id text, name text)
language sql stable security definer set search_path = '' as $$
  (select o.bucket_id, o.name
     from storage.objects o
     left join auth.users u on u.id::text = o.owner_id
    where o.bucket_id in ('covers', 'post-images')
      and o.owner_id is not null
      and (u.id is null or (u.is_anonymous and u.created_at < now() - interval '23 hours'))
    limit max_rows)
  union all
  (select o.bucket_id, o.name
     from storage.objects o
     left join auth.users u on u.id::text = o.owner_id
    where o.bucket_id = 'chat-files'
      and (u.id is null
           or (u.is_anonymous and u.created_at < now() - interval '23 hours')
           or (o.created_at < now() - interval '2 hours'
               and not exists (select 1 from chat.messages m where m.attachment ->> 'path' = o.name)))
    limit max_rows)
$$;

-- ---------------------------------------------------------------- Seeds
-- Seed correspondents (bots: no auth user, no login) and a few public rooms with friendly history.
insert into chat.profiles (id, display_name, stamp, bio, is_bot) values
  ('a0e70000-0000-4000-8000-000000000001', 'Pip', 3, 'Aerogram concierge. DM me for tips; I answer instantly (no AI, just good manners).', true),
  ('a0e70000-0000-4000-8000-000000000002', 'Marguerite', 0, 'Type nerd. Collects airmail envelopes and kerning crimes.', true),
  ('a0e70000-0000-4000-8000-000000000003', 'Teodor', 7, 'Ships things on Fridays (responsibly).', true),
  ('a0e70000-0000-4000-8000-000000000004', 'Hana', 9, 'Photographer, mostly of mailboxes.', true)
on conflict (id) do nothing;

insert into chat.rooms (id, kind, slug, name, topic, created_by, is_seed) values
  ('a0e70000-0000-4000-8000-0000000000a1', 'public', 'the-lobby', 'The Lobby', 'Say hello. Everyone lands here first.', 'a0e70000-0000-4000-8000-000000000001', true),
  ('a0e70000-0000-4000-8000-0000000000a2', 'public', 'design-desk', 'Design Desk', 'Typography, color and the pixels in between.', 'a0e70000-0000-4000-8000-000000000002', true),
  ('a0e70000-0000-4000-8000-0000000000a3', 'public', 'ship-it', 'Ship It', 'Releases, wins and small victories.', 'a0e70000-0000-4000-8000-000000000003', true)
on conflict (id) do nothing;

insert into chat.members (room_id, user_id)
select r.id, p.id from chat.rooms r cross join chat.profiles p
 where r.is_seed and p.is_bot and p.id <> 'a0e70000-0000-4000-8000-000000000001'
union
select r.id, 'a0e70000-0000-4000-8000-000000000001'::uuid from chat.rooms r where r.is_seed
on conflict do nothing;

with seed (room, who, mins, body) as (values
  ('a1', '1', 300, 'Welcome to The Lobby! This room is public, so anyone signed in can join. Messages show up live for everyone here.'),
  ('a1', '2', 296, 'Morning, all. The new paper texture finally looks like an actual aerogramme.'),
  ('a1', '4', 290, 'It does! Those red-and-blue chevrons take me straight back to my grandmother''s letters.'),
  ('a1', '3', 281, 'Pushed a fix for the unread counter. It now ignores your own messages, as it should.'),
  ('a1', '2', 275, 'Tiny thing: try reacting to a message. Hover it (or long-press on a phone).'),
  ('a1', '1', 260, 'Housekeeping: guest accounts from /demo tidy themselves away after a day, files included.'),
  ('a1', '4', 120, 'Anyone else open two browser windows just to watch the typing indicator? Asking for a friend.'),
  ('a1', '3', 118, 'Guilty. The "is writing…" line is oddly satisfying.'),
  ('a1', '2', 60, 'If you''re new: say hi! We don''t bite, and Pip answers DMs instantly.'),
  ('a2', '2', 400, 'Design Desk is open. Today''s question: serif headings with a sans body, or all sans?'),
  ('a2', '4', 395, 'Serif headings, every time. Fraunces has just the right amount of wobble.'),
  ('a2', '3', 390, 'All sans for product UI, serif for anything that should feel like a letter.'),
  ('a2', '2', 384, 'Agreed. Postmarks get a monospace, obviously.'),
  ('a2', '4', 200, 'Night Mail palette check: midnight navy, cream ink, brass for highlights. Thoughts?'),
  ('a2', '2', 198, 'Brass on navy passes contrast if you keep it above 4.5:1. Looks lovely.'),
  ('a3', '3', 500, 'Ship It: post your wins here, big or small.'),
  ('a3', '3', 470, 'Read receipts are live: the little "Read" postmark appears once the other person has seen your message.'),
  ('a3', '2', 455, 'Image sharing works too. Files are private to the room and links expire.'),
  ('a3', '4', 240, 'Infinite scroll on history: older messages page in as you scroll up.')
)
insert into chat.messages (room_id, user_id, body, created_at)
select ('a0e70000-0000-4000-8000-0000000000' || room)::uuid, ('a0e70000-0000-4000-8000-00000000000' || who)::uuid, body,
       now() - make_interval(mins => mins)
from seed
where not exists (select 1 from chat.messages m where m.room_id = 'a0e70000-0000-4000-8000-0000000000a1'::uuid);

update chat.messages set reactions = '{"👋":["a0e70000-0000-4000-8000-000000000002","a0e70000-0000-4000-8000-000000000004"]}'
 where room_id = 'a0e70000-0000-4000-8000-0000000000a1' and body like 'Welcome to The Lobby%';
update chat.messages set reactions = '{"😂":["a0e70000-0000-4000-8000-000000000002","a0e70000-0000-4000-8000-000000000003"]}'
 where room_id = 'a0e70000-0000-4000-8000-0000000000a1' and body like 'Anyone else open two%';
update chat.rooms r set last_message_at = (select max(created_at) from chat.messages m where m.room_id = r.id) where r.is_seed;
