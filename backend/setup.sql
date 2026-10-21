-- ACOULYS ONE-PASTE BACKEND SETUP
-- Run this entire file once in Supabase SQL Editor.
-- It installs the base schema AND the social publishing migration.
-- Safe to re-run for normal setup updates.

-- MUSICALI backend foundation for Supabase (Postgres + Auth + Storage).
-- Run this in Supabase SQL Editor after creating a project.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  display_name text not null default '',
  avatar_path text,
  bio text not null default '' check (char_length(bio) <= 160),
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  caption text not null default '' check (char_length(caption) <= 2200),
  media_path text not null,
  media_type text not null check (media_type in ('image','video','audio')),
  visibility text not null default 'public' check (visibility in ('public','followers','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Allow text-only community posts as well as media posts.
-- CREATE TABLE IF NOT EXISTS does not update constraints on an existing project.
alter table public.posts alter column media_path drop not null;
alter table public.posts drop constraint if exists posts_media_type_check;
alter table public.posts add constraint posts_media_type_check
  check (media_type in ('image','video','audio','text'));
create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists posts_user_created_idx on public.posts(user_id, created_at desc);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists follows_following_idx on public.follows(following_id);

create table if not exists public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1200),
  created_at timestamptz not null default now()
);
create index if not exists comments_post_created_idx on public.comments(post_id, created_at);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  media_path text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id),
  check (char_length(body) > 0 or media_path is not null)
);
create index if not exists messages_pair_created_idx on public.messages(sender_id, recipient_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('follow','like','comment','message')),
  post_id uuid references public.posts(id) on delete cascade,
  message text not null default '',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_recipient_created_idx on public.notifications(recipient_id, created_at desc);

-- Automatically create a profile row for each newly registered account.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  base_name text;
begin
  base_name := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'creator'), '[^a-zA-Z0-9_]', '', 'g'));
  base_name := left(base_name, 18);
  if length(base_name) < 3 then base_name := 'user' || left(replace(new.id::text, '-', ''), 8); end if;
  insert into public.profiles(id, username, display_name)
  values (new.id, base_name || '_' || left(replace(new.id::text, '-', ''), 4), coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.follows enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "profiles are viewable by authenticated users" on public.profiles;
create policy "profiles are viewable by authenticated users" on public.profiles for select to authenticated using (true);
drop policy if exists "users create own profile" on public.profiles;
create policy "users create own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "posts visible by visibility" on public.posts;
create policy "posts visible by visibility" on public.posts for select to authenticated using (
  user_id = auth.uid()
  or visibility = 'public'
  or (visibility = 'followers' and exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = posts.user_id))
);
drop policy if exists "users create own posts" on public.posts;
create policy "users create own posts" on public.posts for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users update own posts" on public.posts;
create policy "users update own posts" on public.posts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "users delete own posts" on public.posts;
create policy "users delete own posts" on public.posts for delete to authenticated using (user_id = auth.uid());

drop policy if exists "follows readable by authenticated users" on public.follows;
create policy "follows readable by authenticated users" on public.follows for select to authenticated using (true);
drop policy if exists "users follow as themselves" on public.follows;
create policy "users follow as themselves" on public.follows for insert to authenticated with check (follower_id = auth.uid());
drop policy if exists "users unfollow as themselves" on public.follows;
create policy "users unfollow as themselves" on public.follows for delete to authenticated using (follower_id = auth.uid());

drop policy if exists "likes readable by authenticated users" on public.likes;
create policy "likes readable by authenticated users" on public.likes for select to authenticated using (true);
drop policy if exists "users like as themselves" on public.likes;
create policy "users like as themselves" on public.likes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users unlike as themselves" on public.likes;
create policy "users unlike as themselves" on public.likes for delete to authenticated using (user_id = auth.uid());

drop policy if exists "comments readable when post is visible" on public.comments;
create policy "comments readable when post is visible" on public.comments for select to authenticated using (
  exists (select 1 from public.posts p where p.id = comments.post_id and (
    p.user_id = auth.uid() or p.visibility = 'public'
    or (p.visibility = 'followers' and exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.user_id))
  ))
);
drop policy if exists "users add own comments" on public.comments;
create policy "users add own comments" on public.comments for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users delete own comments" on public.comments;
create policy "users delete own comments" on public.comments for delete to authenticated using (user_id = auth.uid());

drop policy if exists "messages only visible to participants" on public.messages;
create policy "messages only visible to participants" on public.messages for select to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid());
drop policy if exists "users send as themselves" on public.messages;
create policy "users send as themselves" on public.messages for insert to authenticated with check (sender_id = auth.uid());
drop policy if exists "recipients mark messages read" on public.messages;
create policy "recipients mark messages read" on public.messages for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

drop policy if exists "notifications only visible to recipient" on public.notifications;
create policy "notifications only visible to recipient" on public.notifications for select to authenticated using (recipient_id = auth.uid());
drop policy if exists "recipients mark notifications read" on public.notifications;
create policy "recipients mark notifications read" on public.notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- Private media bucket. Store each user's files under <auth.uid()>/filename.
insert into storage.buckets (id, name, public) values ('musicali-media', 'musicali-media', false)
on conflict (id) do nothing;
drop policy if exists "users read media they own" on storage.objects;
create policy "users read media they own" on storage.objects for select to authenticated using (bucket_id = 'musicali-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "users upload media to own folder" on storage.objects;
create policy "users upload media to own folder" on storage.objects for insert to authenticated with check (bucket_id = 'musicali-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "users update media in own folder" on storage.objects;
create policy "users update media in own folder" on storage.objects for update to authenticated using (bucket_id = 'musicali-media' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'musicali-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "users delete media in own folder" on storage.objects;
create policy "users delete media in own folder" on storage.objects for delete to authenticated using (bucket_id = 'musicali-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- SOCIAL FEATURES MIGRATION
-- ============================================================

-- Acoulys social features migration. Run once in Supabase SQL Editor after the base schema.
-- Safe to re-run: constraints, columns, tables, functions and policies are guarded.
alter table public.posts alter column media_path drop not null;
alter table public.posts drop constraint if exists posts_media_type_check;
alter table public.posts add constraint posts_media_type_check check (media_type in ('image','video','audio','text'));
alter table public.posts add column if not exists view_count bigint not null default 0;
alter table public.posts drop constraint if exists posts_caption_check;
alter table public.posts add constraint posts_caption_check check (char_length(caption) <= 12000);

create table if not exists public.post_views (
  post_id uuid not null references public.posts(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (post_id, viewer_id)
);
alter table public.post_views enable row level security;
drop policy if exists "users record own post views" on public.post_views;
create policy "users record own post views" on public.post_views for insert to authenticated with check (viewer_id = auth.uid());
drop policy if exists "view counts are readable" on public.post_views;

create or replace function public.sync_post_view_count()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update public.posts set view_count = view_count + 1 where id = new.post_id;
  return new;
end;
$$;
drop trigger if exists post_view_count_trigger on public.post_views;
create trigger post_view_count_trigger after insert on public.post_views
for each row execute function public.sync_post_view_count();

create or replace function public.record_post_view(post_uuid uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  allowed boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to record a view'; end if;
  select exists (
    select 1 from public.posts p
    where p.id = post_uuid and (
      p.user_id = auth.uid() or p.visibility = 'public'
      or (p.visibility = 'followers' and exists (
        select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.user_id
      ))
    )
  ) into allowed;
  if not allowed then return false; end if;
  insert into public.post_views(post_id, viewer_id) values (post_uuid, auth.uid())
  on conflict (post_id, viewer_id) do nothing;
  return true;
end;
$$;
grant execute on function public.record_post_view(uuid) to authenticated;

-- Allow signed-in viewers to read objects attached to posts they can see.
drop policy if exists "public post media readable" on storage.objects;
create policy "public post media readable" on storage.objects for select to authenticated
using (
  bucket_id = 'musicali-media' and exists (
    select 1 from public.posts p where p.media_path = storage.objects.name and (
      p.user_id = auth.uid() or p.visibility = 'public'
      or (p.visibility = 'followers' and exists (
        select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.user_id
      ))
    )
  )
);

-- Group chats: one group, many members, shared message history.
create table if not exists public.group_chats (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 70),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.group_chat_members (
  group_id uuid not null references public.group_chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table if not exists public.group_chat_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.group_chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists group_chat_messages_group_created_idx on public.group_chat_messages(group_id, created_at);
alter table public.group_chats enable row level security;
alter table public.group_chat_members enable row level security;
alter table public.group_chat_messages enable row level security;
drop policy if exists "members can read their group chats" on public.group_chats;
create policy "members can read their group chats" on public.group_chats for select to authenticated using (
  exists (select 1 from public.group_chat_members m where m.group_id = id and m.user_id = auth.uid())
);
drop policy if exists "signed-in users create group chats" on public.group_chats;
create policy "signed-in users create group chats" on public.group_chats for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "members can read group membership" on public.group_chat_members;
create policy "members can read group membership" on public.group_chat_members for select to authenticated using (
  exists (select 1 from public.group_chat_members mine where mine.group_id = group_id and mine.user_id = auth.uid())
);
drop policy if exists "group creator adds members" on public.group_chat_members;
create policy "group creator adds members" on public.group_chat_members for insert to authenticated with check (
  user_id = auth.uid() or exists (select 1 from public.group_chats g where g.id = group_id and g.created_by = auth.uid())
);
drop policy if exists "members can read group messages" on public.group_chat_messages;
create policy "members can read group messages" on public.group_chat_messages for select to authenticated using (
  exists (select 1 from public.group_chat_members m where m.group_id = group_id and m.user_id = auth.uid())
);
drop policy if exists "members can send group messages" on public.group_chat_messages;
create policy "members can send group messages" on public.group_chat_messages for insert to authenticated with check (
  sender_id = auth.uid() and exists (select 1 from public.group_chat_members m where m.group_id = group_id and m.user_id = auth.uid())
);
