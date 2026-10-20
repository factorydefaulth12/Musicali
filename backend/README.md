# Acoulys backend setup

Acoulys is a GitHub Pages frontend backed by Supabase Auth, Postgres, and Storage. The social features are real database operations, not simulated counters, but they work only after the database setup below has been run.

## One-time setup (required before publishing works)

1. Open the [Acoulys Supabase SQL Editor](https://supabase.com/dashboard/project/iiwcpshtdjanyiixosle/sql/new).
2. Open `backend/setup.sql` in this repository, copy the **entire file**, paste it into SQL Editor, and click **Run**. This combined file installs both the base schema and the social migration. Running only `social-migration.sql` on an empty project will fail because the base tables do not exist yet.
3. Wait for Supabase to report success. If it reports an error, publishing is not ready yet. Do not paste a service-role key into the website.
4. Open [Acoulys](https://factorydefaulth12.github.io/Musicali/) and hard-refresh with **Ctrl+Shift+R**.
5. Sign in, import a photo/video/audio file or write a post, then choose **Publish to my feed**.
6. Test with two separate accounts (or separate browsers): account B should see account A's public post, like it, follow its creator, comment, and count a unique-account view when the post enters the feed.

## What is implemented

- **Publishing:** uploads media to the private `musicali-media` bucket and inserts a public post row. Text-only posts need no media file.
- **Likes:** stored per account and post, with duplicate likes prevented by a database primary key.
- **Follows:** stored per follower/creator pair, with real follower/following counts.
- **Views:** unique signed-in accounts per post, incremented by a database function. Repeated refreshes from the same account do not inflate the view count.
- **Comments:** saved in the comments table and displayed as a count; adding a comment requires sign-in.
- **Drafts:** remain in browser-local storage until the user publishes them. They do not sync across devices yet.
- **Recommendations:** a lightweight heuristic uses freshness, follows, likes, views, and media-type diversity. It is a working baseline, not a trained neural ranking model or a reproduction of TikTok's proprietary system.

## If publishing still fails

Acoulys now displays a setup-oriented error when the database or storage is missing. Open the browser console for the technical error, then verify that `backend/setup.sql` ran successfully in the Supabase project above. The GitHub Pages deployment cannot execute SQL against Supabase on your behalf, so that one-time database action must be performed in the Supabase dashboard.

## Security and limits

- The frontend uses only the public Supabase publishable key. Never put a service-role key in frontend code.
- Media files live in a private bucket. The app creates short-lived signed URLs for media on posts viewers are allowed to see.
- The frontend does not publish a user's date of birth or private profile metadata.
- Deployment success confirms that GitHub Pages published the frontend, not that Supabase policies or credentials are correctly configured.
