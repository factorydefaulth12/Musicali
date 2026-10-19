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
