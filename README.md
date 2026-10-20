# Acoulys 🎧

**Make it. Loop it. Share it.**

Acoulys is a gender-neutral, short-video and music-discovery social experience inspired by the playful creator culture of early short-form video apps. The visual direction uses bold coral, violet, and teal, quick discovery, sounds, and creator-led expression without copying another platform's name or branding.

## Public website

- GitHub Pages: https://factorydefaulth12.github.io/Musicali/
- Repository: https://github.com/factorydefaulth12/Musicali

The site is published from this repository through GitHub Pages. It is an early-stage web app, not yet a listing in Google Play or Apple's App Store.

## Install on a device

The site includes a web-app manifest and service worker for supported browsers. Open the public website over HTTPS and use the browser's **Install app** or **Add to Home Screen** option when available. Install prompts vary by browser and device.

## Sign-in

The entry screen uses a Gmail address and a one-time email verification code through Supabase Auth. The Supabase project's email provider and delivery settings must be enabled and correctly configured for codes to arrive. A successful GitHub Pages deployment alone does not prove email delivery is configured.

## Current functionality and limits

- The front end includes a responsive discovery feed, creator-style cards, a camera/media studio, and local media/profile features.
- Browser-local posts, profiles, and saved media are stored on that device. They are **not automatically public posts and do not sync across devices**.
- Full shared profiles, a public cross-device feed, direct messages, and a licensed music catalogue/playback service are not yet complete.
- Do not treat placeholder or local-only interactions as live social features.

## Run locally

Open `index.html` in a modern browser or serve the folder through a local static web server. Camera and microphone features require HTTPS or localhost and browser permission.

## Deployment

The included GitHub Actions Pages workflow deploys the repository root. Review the Actions tab for the latest build/deployment status.

## Backend notes

See `backend/README.md` and `backend/supabase-schema.sql` for the backend foundation. Never put a Supabase service-role key or any other secret in client-side code.
