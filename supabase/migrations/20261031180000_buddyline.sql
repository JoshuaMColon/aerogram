-- Buddyline: an early-2000s-style instant messenger on top of the existing chat schema.
-- Adds screen names, persisted presence (status, away message, idle, last seen), buddy lists with groups,
-- per-message formatting, Buzz, and server-side away auto-replies. All $0 Postgres; RLS on every new table.

-- ---------------------------------------------------------------- profiles: screen names + presence
alter table chat.profiles
  add column status text not null default 'online' check (status in ('online', 'away')),
  add column away_message text check (char_length(away_message) <= 240),
  add column away_since timestamptz,
  add column idle_since timestamptz,
  add column last_seen_at timestamptz,
  add column away_presets text[] not null default '{}'
    check (cardinality(away_presets) <= 10 and char_length(array_to_string(away_presets, '')) <= 2400);

-- Bots get screen names in the spirit of the era (unique, case-insensitive, like the classics).
update chat.profiles set display_name = 'PipTheBot', bio = 'Buddyline''s resident bot. IM me for tips; I answer instantly (no AI, just good manners).' where id = 'a0e70000-0000-4000-8000-000000000001';
update chat.profiles set display_name = 'MargueriteKerns', bio = 'Type nerd. Collector of kerning crimes and glossy buttons.' where id = 'a0e70000-0000-4000-8000-000000000002';
update chat.profiles set display_name = 'TeoShipsFriday', bio = 'Ships things on Fridays (responsibly).', status = 'away', away_since = now(),
  away_message = 'Out getting pizza :) back in 20. Leave a msg!' where id = 'a0e70000-0000-4000-8000-000000000003';
update chat.profiles set display_name = 'HanaClicks', bio = 'Photographer, mostly of mailboxes and sunsets.', idle_since = now() - interval '17 minutes' where id = 'a0e70000-0000-4000-8000-000000000004';
create unique index profiles_screen_name_key on chat.profiles (lower(display_name));

create or replace function chat.guard_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.display_name := btrim(new.display_name);
  if current_user not in ('authenticated', 'anon') then return new; end if;
  new.id := old.id; new.auth_id := old.auth_id; new.is_bot := old.is_bot;
  new.is_guest := old.is_guest; new.created_at := old.created_at;
  new.status := old.status; new.away_message := old.away_message; new.away_since := old.away_since;
  new.idle_since := old.idle_since; new.last_seen_at := old.last_seen_at; new.away_presets := old.away_presets;
  new.bio := btrim(new.bio);
  if new.display_name is distinct from old.display_name and new.display_name !~ '^[A-Za-z0-9][A-Za-z0-9 _.-]{2,19}$' then
    raise exception 'Screen names are 3 to 20 letters, numbers, spaces, dots, dashes or underscores' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- buddy lists
create table chat.buddy_groups (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references chat.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index buddy_groups_owner_name on chat.buddy_groups (owner, lower(name));

create table chat.buddies (
  owner uuid not null references chat.profiles (id) on delete cascade,
  buddy uuid not null references chat.profiles (id) on delete cascade,
  group_id uuid not null references chat.buddy_groups (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (owner, buddy),
  check (owner <> buddy)
);
create index buddies_group on chat.buddies (group_id);
create index buddies_buddy on chat.buddies (buddy);

alter table chat.buddy_groups enable row level security;
alter table chat.buddies enable row level security;
create policy buddy_groups_own on chat.buddy_groups for select to authenticated using (owner = (select auth.uid()));
create policy buddies_own on chat.buddies for select to authenticated using (owner = (select auth.uid()));
grant select on chat.buddy_groups, chat.buddies to authenticated;

-- One auto-reply per (away person, sender, away session).
create table chat.away_replies (
  user_id uuid not null references chat.profiles (id) on delete cascade,
  sender uuid not null references chat.profiles (id) on delete cascade,
  away_since timestamptz not null,
  primary key (user_id, sender, away_since)
);
alter table chat.away_replies enable row level security; -- no policies: definer functions only

-- ---------------------------------------------------------------- messages: formatting, buzz, auto-replies
alter table chat.messages
  add column style jsonb,
  add column kind text not null default 'text' check (kind in ('text', 'buzz', 'away'));

-- Whole-message formatting from the toolbar: bold/italic/underline, a named color, a size.
create or replace function chat.clean_style(s jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select nullif(jsonb_strip_nulls(jsonb_build_object(
    'b', case when s->'b' = 'true'::jsonb then true end,
    'i', case when s->'i' = 'true'::jsonb then true end,
    'u', case when s->'u' = 'true'::jsonb then true end,
    'color', case when s->>'color' in ('red', 'orange', 'green', 'teal', 'blue', 'purple', 'pink') then s->>'color' end,
    'size', case when s->>'size' in ('s', 'l') then s->>'size' end
  )), '{}'::jsonb)
$$;

create or replace function chat.guard_message()
returns trigger language plpgsql set search_path = '' as $$
declare
  trusted boolean := current_user not in ('authenticated', 'anon');
  recent integer;
begin
  if tg_op = 'INSERT' then
    new.body := btrim(coalesce(new.body, ''));
    new.style := chat.clean_style(new.style);
    if not trusted then
      new.created_at := now(); new.edited_at := null; new.deleted_at := null; new.reactions := '{}'::jsonb;
      if new.kind = 'away' then
        raise exception 'Auto-replies come from the server' using errcode = 'check_violation';
      end if;
      if new.kind = 'buzz' then
        if not exists (select 1 from chat.rooms where id = new.room_id and kind = 'dm') then
          raise exception 'Buzz only works in IMs' using errcode = 'check_violation';
        end if;
        if exists (select 1 from chat.messages where room_id = new.room_id and user_id = new.user_id
                    and kind = 'buzz' and created_at > now() - interval '10 seconds') then
          raise exception 'Easy there! You can buzz again in a few seconds' using errcode = 'check_violation';
        end if;
        new.body := 'BUZZ!'; new.attachment := null; new.style := null;
      end if;
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
  new.kind := old.kind;
  if trusted then return new; end if;
  new.reactions := old.reactions; new.style := old.style;
  if old.deleted_at is not null then
    raise exception 'Message was deleted' using errcode = 'check_violation';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now(); new.body := ''; new.attachment := null; new.reactions := '{}'::jsonb;
    return new;
  end if;
  if old.kind <> 'text' then
    raise exception 'Only regular messages can be edited' using errcode = 'check_violation';
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

-- Away auto-reply: when someone IMs a person who is away, send their away message back once per away session.
create or replace function chat.away_reply(m chat.messages)
returns void language plpgsql security definer set search_path = '' as $$
declare
  other chat.profiles;
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
  insert into chat.messages (room_id, user_id, body, kind, created_at)
  values (m.room_id, other.id, other.away_message, 'away', clock_timestamp() + interval '2 milliseconds');
end $$;

create or replace function chat.pip_reply(m chat.messages)
returns void language plpgsql security definer set search_path = '' as $$
declare
  pip constant uuid := 'a0e70000-0000-4000-8000-000000000001';
  b text := lower(coalesce(m.body, ''));
  n integer;
  reply text;
  tips constant text[] := array[
    'Tip: hit the lightning bolt in an IM window to Buzz someone. Their window shakes (unless they prefer reduced motion).',
    'Tip: set an away message from the status menu at the top of your Buddy List. People who IM you get it back once, automatically.',
    'Tip: drag a buddy onto another group (or use the ... menu) to move them. You can add your own groups too.',
    'Tip: B, I, U, color and size in the IM toolbar style your whole message. Try :) ;) :P <3 for smileys.',
    'Tip: buddies signing on and off get a toast and a little door sound. The speaker button mutes it.',
    'Tip: on desktop you can open several IM windows at once, drag them around and minimize them to the taskbar.'
  ];
begin
  if m.user_id = pip or m.deleted_at is not null or m.kind <> 'text' then return; end if;
  if not exists (select 1 from chat.rooms r join chat.members x on x.room_id = r.id
                  where r.id = m.room_id and r.kind = 'dm' and x.user_id = pip) then
    return;
  end if;
  select count(*) into n from chat.messages where room_id = m.room_id and user_id = pip;
  if n >= 60 then return; end if;
  if b ~ '\m(hi|hello|hey|yo|sup|wassup|howdy|morning)\M' then
    reply := 'heyyy! I''m PipTheBot :) Ask me about "features", "privacy" or "realtime", or say anything for a tip.';
  elsif b ~ 'feature|what can|help' then
    reply := 'Buddyline has a Buddy List with groups, away messages with auto-replies, idle times, IM windows, chat rooms, Buzz, typing indicators, read receipts, reactions, formatting and file sharing. Try any of them on me.';
  elsif b ~ 'privacy|secure|rls|safe' then
    reply := 'Every row is guarded by Postgres row-level security: your buddy list is yours alone, you only read rooms you belong to, and files sit in a private bucket.';
  elsif b ~ 'realtime|live|how does' then
    reply := 'Messages arrive through Supabase Realtime (Postgres changes); who''s online, idle and typing travel over private presence and broadcast channels.';
  elsif m.attachment is not null then
    reply := 'Got your file! Only the two of us can open it.';
  else
    reply := tips[1 + (n % array_length(tips, 1))];
  end if;
  insert into chat.messages (room_id, user_id, body, created_at)
  values (m.room_id, pip, reply, clock_timestamp() + interval '1 millisecond');
end $$;

create or replace function chat.after_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update chat.rooms set last_message_at = greatest(last_message_at, new.created_at) where id = new.room_id;
  update chat.members set last_read_at = greatest(last_read_at, new.created_at)
   where room_id = new.room_id and user_id = new.user_id;
  perform chat.pip_reply(new);
  perform chat.away_reply(new);
  return null;
end $$;

-- ---------------------------------------------------------------- profile bootstrap: screen names + default buddy list
create or replace function chat.unique_screen_name(base text)
returns text language plpgsql stable set search_path = '' as $$
declare
  s text := left(btrim(regexp_replace(coalesce(base, ''), '[^A-Za-z0-9 _.-]+', '', 'g')), 20);
  cand text;
  i integer := 1;
begin
  s := regexp_replace(s, '^[^A-Za-z0-9]+', '');
  if char_length(s) < 3 then return null; end if;
  cand := s;
  while exists (select 1 from chat.profiles where lower(display_name) = lower(cand)) loop
    i := i + 1;
    cand := left(s, 20 - char_length(i::text)) || i;
  end loop;
  return cand;
end $$;

create or replace function chat.guest_screen_name()
returns text language plpgsql volatile set search_path = '' as $$
declare
  a constant text[] := array['Skater','Glitter','Pixel','Sk8r','Neon','Rad','Cosmic','Disco','Frosted','Mall','Dial','Bubble','Lava','Chrome','Sparkle','Retro'];
  b constant text[] := array['Heron','Finch','Wren','Lark','Robin','Puffin','Swift','Tern','Kestrel','Plover','Avocet','Merlin'];
  x text := a[1 + floor(random() * array_length(a, 1))::int];
  y text := b[1 + floor(random() * array_length(b, 1))::int];
  yr text := (1998 + floor(random() * 8))::text;
  pick integer := floor(random() * 4)::int;
  s text;
begin
  s := case pick
    when 0 then 'xX' || x || y || 'Xx'
    when 1 then x || y || yr
    when 2 then lower(x) || '_' || lower(y) || right(yr, 2)
    else x || 'n' || y || floor(10 + random() * 89)::int
  end;
  return chat.unique_screen_name(s);
end $$;

create or replace function chat.seed_buddy_list(uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g_buddies uuid; g_family uuid; g_work uuid;
begin
  if exists (select 1 from chat.buddy_groups where owner = uid) then return; end if;
  insert into chat.buddy_groups (owner, name, sort) values (uid, 'Buddies', 0) returning id into g_buddies;
  insert into chat.buddy_groups (owner, name, sort) values (uid, 'Family', 1) returning id into g_family;
  insert into chat.buddy_groups (owner, name, sort) values (uid, 'Co-Workers', 2) returning id into g_work;
  insert into chat.buddies (owner, buddy, group_id)
  select uid, p.id, case p.id
      when 'a0e70000-0000-4000-8000-000000000001' then g_buddies
      when 'a0e70000-0000-4000-8000-000000000002' then g_buddies
      when 'a0e70000-0000-4000-8000-000000000004' then g_family
      else g_work end
    from chat.profiles p where p.is_bot
  on conflict do nothing;
end $$;

create or replace function public.chat_ensure_profile(p_name text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  guest boolean := chat.is_guest();
  pip constant uuid := 'a0e70000-0000-4000-8000-000000000001';
  nm text;
  em text;
  dm uuid;
  prof chat.profiles;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into prof from chat.profiles where id = uid;
  if found then return to_jsonb(prof); end if;

  nm := chat.unique_screen_name(p_name);
  if nm is null and not guest then
    select split_part(email, '@', 1) into em from auth.users where id = uid;
    nm := chat.unique_screen_name(regexp_replace(coalesce(em, ''), '[^A-Za-z0-9]+', '', 'g'));
  end if;
  if nm is null then nm := chat.guest_screen_name(); end if;
  insert into chat.profiles (id, auth_id, display_name, stamp, is_guest, last_seen_at)
  values (uid, uid, nm, floor(random() * 12)::smallint, guest, now())
  returning * into prof;

  insert into chat.members (room_id, user_id)
  select id, uid from chat.rooms where is_seed and kind = 'public'
  on conflict do nothing;
  perform chat.seed_buddy_list(uid);

  if exists (select 1 from chat.profiles where id = pip) then
    insert into chat.rooms (kind, dm_key, created_by)
    values ('dm', least(uid::text, pip::text) || ':' || greatest(uid::text, pip::text), uid)
    returning id into dm;
    insert into chat.members (room_id, user_id, last_read_at) values (dm, uid, now() - interval '1 minute'), (dm, pip, now());
    insert into chat.messages (room_id, user_id, body) values (dm, pip,
      'Welcome to Buddyline, ' || prof.display_name || '! I''m PipTheBot. This IM is private: only you and I can read it. Say hi, or ask me about "features".');
  end if;
  return to_jsonb(prof);
end $$;

-- ---------------------------------------------------------------- RPCs: presence, away presets, buddy list
create or replace function public.chat_set_presence(p_status text, p_away_message text default null, p_idle boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  prof chat.profiles;
  msg text := nullif(left(btrim(coalesce(p_away_message, '')), 240), '');
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_status not in ('online', 'away') then raise exception 'Unknown status' using errcode = 'check_violation'; end if;
  update chat.profiles set
    status = p_status,
    away_message = case when p_status = 'away' then coalesce(msg, 'I''m away from my computer right now.') else away_message end,
    away_since = case when p_status = 'away' then
                   case when status = 'away' and away_message is not distinct from coalesce(msg, 'I''m away from my computer right now.') then away_since else now() end
                 end,
    idle_since = case when p_idle then coalesce(idle_since, now()) end,
    last_seen_at = now()
   where id = uid returning * into prof;
  return to_jsonb(prof);
end $$;

create or replace function public.chat_away_presets()
returns text[] language sql stable security definer set search_path = '' as $$
  select away_presets from chat.profiles where id = (select auth.uid())
$$;

create or replace function public.chat_save_away_presets(p_presets text[])
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  clean text[];
begin
  select coalesce(array_agg(t order by o), '{}') into clean from (
    select distinct on (lower(btrim(x))) left(btrim(x), 240) as t, o
      from unnest(coalesce(p_presets, '{}')) with ordinality as u(x, o)
     where btrim(x) <> '' order by lower(btrim(x)), o) s;
  if cardinality(clean) > 10 then raise exception 'Keep it to 10 saved away messages' using errcode = 'check_violation'; end if;
  update chat.profiles set away_presets = clean where id = (select auth.uid());
  return clean;
end $$;

create or replace function public.chat_buddy_list()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  perform chat.seed_buddy_list(uid);
  return jsonb_build_object(
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'sort', sort) order by sort, created_at), '[]')
                 from chat.buddy_groups where owner = uid),
    'buddies', (select coalesce(jsonb_agg(jsonb_build_object('buddy', buddy, 'group_id', group_id) order by added_at), '[]')
                  from chat.buddies where owner = uid));
end $$;

create or replace function chat.own_group(uid uuid, gid uuid)
returns uuid language sql stable set search_path = '' as $$
  select coalesce(
    (select id from chat.buddy_groups where id = gid and owner = uid),
    (select id from chat.buddy_groups where owner = uid order by sort, created_at limit 1))
$$;

create or replace function public.chat_add_buddy(p_screen_name text, p_group uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  who uuid;
  gid uuid;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  perform chat.seed_buddy_list(uid);
  select id into who from chat.profiles where lower(display_name) = lower(btrim(coalesce(p_screen_name, '')));
  if who is null then raise exception 'No one has that screen name' using errcode = 'check_violation'; end if;
  if who = uid then raise exception 'You can''t add yourself (nice try)' using errcode = 'check_violation'; end if;
  if (select count(*) from chat.buddies where owner = uid) >= 200 then
    raise exception 'Your Buddy List is full (200 max)' using errcode = 'check_violation';
  end if;
  gid := chat.own_group(uid, p_group);
  insert into chat.buddies (owner, buddy, group_id) values (uid, who, gid)
  on conflict (owner, buddy) do update set group_id = excluded.group_id;
  return who;
end $$;

create or replace function public.chat_remove_buddy(p_buddy uuid)
returns void language sql security definer set search_path = '' as $$
  delete from chat.buddies where owner = (select auth.uid()) and buddy = p_buddy
$$;

create or replace function public.chat_move_buddy(p_buddy uuid, p_group uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from chat.buddy_groups where id = p_group and owner = auth.uid()) then
    raise exception 'That group isn''t yours' using errcode = 'check_violation';
  end if;
  update chat.buddies set group_id = p_group where owner = auth.uid() and buddy = p_buddy;
end $$;

create or replace function public.chat_save_group(p_name text, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  nm text := btrim(coalesce(p_name, ''));
  gid uuid;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if char_length(nm) not between 1 and 24 then raise exception 'Group names need 1 to 24 characters' using errcode = 'check_violation'; end if;
  if exists (select 1 from chat.buddy_groups where owner = uid and lower(name) = lower(nm) and id is distinct from p_id) then
    raise exception 'You already have a group with that name' using errcode = 'check_violation';
  end if;
  if p_id is null then
    if (select count(*) from chat.buddy_groups where owner = uid) >= 20 then
      raise exception 'That''s plenty of groups (20 max)' using errcode = 'check_violation';
    end if;
    insert into chat.buddy_groups (owner, name, sort)
    values (uid, nm, coalesce((select max(sort) + 1 from chat.buddy_groups where owner = uid), 0)) returning id into gid;
  else
    update chat.buddy_groups set name = nm where id = p_id and owner = uid returning id into gid;
    if gid is null then raise exception 'That group isn''t yours' using errcode = 'check_violation'; end if;
  end if;
  return gid;
end $$;

create or replace function public.chat_delete_group(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  fallback uuid;
begin
  select id into fallback from chat.buddy_groups where owner = uid and id <> p_id order by sort, created_at limit 1;
  if fallback is null then raise exception 'Keep at least one group' using errcode = 'check_violation'; end if;
  update chat.buddies set group_id = fallback where owner = uid and group_id = p_id;
  delete from chat.buddy_groups where id = p_id and owner = uid;
end $$;

revoke execute on function chat.away_reply(chat.messages), chat.unique_screen_name(text),
  chat.guest_screen_name(), chat.seed_buddy_list(uuid), chat.own_group(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.chat_set_presence(text, text, boolean), public.chat_away_presets(), public.chat_save_away_presets(text[]),
  public.chat_buddy_list(), public.chat_add_buddy(text, uuid), public.chat_remove_buddy(uuid), public.chat_move_buddy(uuid, uuid),
  public.chat_save_group(text, uuid), public.chat_delete_group(uuid) from public, anon;
grant execute on function public.chat_set_presence(text, text, boolean), public.chat_away_presets(), public.chat_save_away_presets(text[]),
  public.chat_buddy_list(), public.chat_add_buddy(text, uuid), public.chat_remove_buddy(uuid), public.chat_move_buddy(uuid, uuid),
  public.chat_save_group(text, uuid), public.chat_delete_group(uuid) to authenticated;

-- ---------------------------------------------------------------- views + column grants
create or replace view public.chat_profiles with (security_invoker = true) as
  select id, display_name, stamp, bio, is_bot, is_guest, created_at, status, away_message, away_since, idle_since, last_seen_at
    from chat.profiles;
create or replace view public.chat_messages with (security_invoker = true) as
  select id, room_id, user_id, body, attachment, reactions, created_at, edited_at, deleted_at, style, kind from chat.messages;
grant insert (style, kind) on chat.messages to authenticated;
grant insert (style, kind) on public.chat_messages to authenticated;

-- ---------------------------------------------------------------- seed copy refresh (the old airmail jokes)
update chat.messages set body = 'Morning, all. The new glossy title bars look like 2003 in the best way.'
 where body = 'Morning, all. The new paper texture finally looks like an actual aerogramme.';
update chat.messages set body = 'They do! Hearing the door-open sound when someone signs on takes me right back.'
 where body = 'It does! Those red-and-blue chevrons take me straight back to my grandmother''s letters.';
update chat.messages set body = 'Guilty. The "has entered text" line is oddly satisfying.'
 where body = 'Guilty. The "is writing…" line is oddly satisfying.';
update chat.messages set body = 'If you''re new: say hi! We don''t bite, and PipTheBot answers IMs instantly.'
 where body = 'If you''re new: say hi! We don''t bite, and Pip answers DMs instantly.';
update chat.messages set body = 'Rounded sans for UI, a pixel font for the little labels. Very Y2K.'
 where body = 'Serif headings, every time. Fraunces has just the right amount of wobble.';
update chat.messages set body = 'Agreed. And every button needs a little gloss highlight, obviously.'
 where body = 'Agreed. Postmarks get a monospace, obviously.';
update chat.messages set body = 'Midnight theme check: deep indigo, aqua accents, pink for highlights. Thoughts?'
 where body = 'Night Mail palette check: midnight navy, cream ink, brass for highlights. Thoughts?';
update chat.messages set body = 'Pink on indigo passes contrast if you keep it above 4.5:1. Looks lovely.'
 where body = 'Brass on navy passes contrast if you keep it above 4.5:1. Looks lovely.';
update chat.messages set body = 'Read receipts are live: a little "Read" tag appears once the other person has seen your message.'
 where body = 'Read receipts are live: the little "Read" postmark appears once the other person has seen your message.';

-- clean_style is a pure sanitizer called from the (invoker) message guard trigger, so writers need it.
revoke execute on function chat.clean_style(jsonb) from public, anon;
grant execute on function chat.clean_style(jsonb) to authenticated;
