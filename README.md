# Free Fire Tournament app — GitHub deploy

```
public/                    the website (index.html = users, admin.html = admin panel)
netlify/functions/         watchearn.js (Watch & Earn backend), bugfix.js (admin Bug Finder)
api/                       same functions for Vercel hosting (optional)
firebase-rules/            database.rules.json + storage.rules (paste into Firebase Console)
netlify.toml, vercel.json  host settings
```

## 1. Put it on GitHub
Create a repository, upload everything in this folder (keep the folder structure), commit.
NEVER upload the Firebase service-account `.json` key. `.gitignore` already blocks it.

## 2. Connect to Netlify
Add new site -> Import from Git -> pick the repo. No build command, publish directory `public` (read from netlify.toml).

## 3. Environment variables (Netlify -> Site configuration -> Environment variables)
| Key | Value |
|---|---|
| FIREBASE_CLIENT_EMAIL | `client_email` from the service-account JSON |
| FIREBASE_PRIVATE_KEY | `private_key` from the JSON (whole text incl. the `\n` parts, no quotes) |
| ANTHROPIC_API_KEY | optional, only for the admin Bug Finder AI |

Then Deploys -> Trigger deploy -> Clear cache and deploy site.

## 4. Firebase rules
Firebase Console -> Realtime Database -> Rules: paste `firebase-rules/database.rules.json`, Publish.
