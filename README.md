# MUSICALI 🎶

MUSICALI is a violet-toned social creation space for short videos, photos, audio, and creative expression.

## Current status

- The web app is at the repository root (index.html) and is designed for static hosting.
- Media capture/import and the personal library run in the browser. The current feed/library are local to that browser only.
- **Shared accounts and public cross-device posts are not connected yet.** The Supabase schema is a foundation, not a live backend. Do not treat local publishing as public posting.

## Run locally

Open index.html in a modern browser, or serve this directory with a static web server.

## Publish with GitHub Pages

In this repository, open **Settings → Pages** and select **Deploy from a branch**, branch main, folder root, then Save. The site should publish at https://factorydefaulth12.github.io/Musicali/ . A workflow is also included for Actions-based Pages deployment if you select GitHub Actions as the Pages source.

## Real social features

See backend/README.md and backend/supabase-schema.sql. The schema must be run in your own Supabase project, and the frontend still needs to be connected to the project URL and public publishable/anon key before real multi-user features work. Never put a service-role or secret key in client-side code.
