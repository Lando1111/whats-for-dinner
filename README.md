# What's for dinner?

A household meal planner for Android (installable web app). Plan the week's dinners, keep the family's recipes, and share one live shopping list between phones.

- **App:** https://lando1111.github.io/whats-for-dinner/
- **Stack:** Preact + Vite, installable PWA, Supabase (database, email sign-in, live sync, photo storage), hosted on GitHub Pages.
- **Look:** the Hearth design system (warm kitchen pastels, Fredoka + Nunito, light and dark).
- **No AI services:** recipe import uses on-device text recognition and plain rules.

## Install on Android
1. Open the app link in Chrome.
2. Tap the menu (⋮) → **Install app** (or **Add to Home screen**).

## Develop
```
npm install
npm run dev
```
Pushing to `main` builds and deploys automatically (GitHub Actions → Pages).

Database changes live in `supabase/migrations/` and are applied to the Supabase project `whats-for-dinner`.
