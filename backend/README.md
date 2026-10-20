# Acoulys backend setup

Acoulys is a static GitHub Pages frontend connected to Supabase for authentication, storage, and social data.

## Database files

- `supabase-schema.sql`: base tables for profiles, posts, follows, likes, comments, messages, notifications, row-level security, and private `musicali-media` storage.
- `social-migration.sql`: enables public text posts, post view counts, and safe reads of media attached to visible posts. Run this after the base schema if the base schema was already installed.

## Required one-time setup

1. Open the [Acoulys Supabase SQL Editor](https://supabase.com/dashboard/project/iiwcpshtdjanyiixosle/sql/new).
2. Paste the entire `backend/social-migration.sql` file from this repository and click **Run**.
3. Confirm that the query completes without errors. This migration adds a `view_count` to posts, allows text-only posts, creates the unique-account view counter, and lets signed-in users view media attached to posts they are allowed to see.
4. Open [Acoulys](https://factorydefaulth12.github.io/Musicali/) and hard-refresh with **Ctrl+Shift+R**.
5. Sign in, import a photo/video/audio file or write a post, then choose **Publish to my feed**. It should appear in the shared feed after upload succeeds.
6. Test with two separate accounts and browsers: account B should see account A's public post, like it, follow its creator, and produce a unique-account view when the post enters the feed.

## Current social behavior

- **Publishing:** uploads media to the private `musicali-media` bucket and inserts a public post row. Text posts do not need a media file.
- **Likes:** stored per account and post, with duplicate likes prevented by the database primary key.
- **Follows:** stored per follower/creator pair, with real follower/following counts.
- **Views:** unique signed-in accounts per post, not raw video plays. The view counter increments at most once per account per post.
- **Comments:** stored in the comments table and displayed as a count; adding a comment requires sign-in.
- **Drafts:** remain in browser-local storage until the user publishes them. They do not sync across devices yet.
- **Recommendation:** the feed currently uses a lightweight heuristic for freshness, creator follows, likes, views, and media diversity. It is not a trained neural ranking model and does not claim to reproduce TikTok's proprietary system.

## Security and limitations

- Never place a Supabase service-role key in frontend code. The app uses only its public publishable key.
- Private media uses short-lived signed URLs. Public posts are visible to signed-in Acoulys users.
- Public account discovery, profile editing in the cloud, notifications, and cross-device draft sync need further work.
- GitHub Actions deployment success only confirms the site was published, not that Supabase settings are correct. The migration must be run in Supabase and tested with two accounts before all features can be considered verified.
