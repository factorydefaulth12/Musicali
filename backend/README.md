# MUSICALI backend setup

This repository currently deploys a static GitHub Pages frontend. GitHub Pages cannot run a private database or user-authentication server. To make real accounts, shared posts, follows, likes, comments, DMs, and cross-device media work, MUSICALI needs a hosted backend.

## Backend foundation included

- `supabase-schema.sql`: PostgreSQL tables for profiles, posts, follows, likes, comments, messages, notifications, row-level security policies, and a private media bucket.
- The current frontend's personal feed and library are browser-local only. They are not public posts and will not appear on another device.

## Connect a real backend

1. Create a Supabase project at https://supabase.com/dashboard.
2. Open the project's SQL Editor and run the entire `backend/supabase-schema.sql` file.
3. In Project Settings -> API, copy the Project URL and the publishable/anon key. Never expose a service-role key in browser code.
4. The frontend must then be wired to those two public project values for Auth, posts, media uploads, feed queries, follows, likes, comments, messaging, and notifications.
5. Test with two separate accounts and two browsers before calling social features live.

## Important

The schema is a backend foundation, not a claim that the live site is already connected. Do not present Messages, public posting, accounts, or push notifications as functional until the client integration and two-account tests are complete.
