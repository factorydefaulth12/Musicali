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
