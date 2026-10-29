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
| FIREBASE_DB_URL | Realtime Database URL from Firebase Console (required by the backend) |
| FIREBASE_CLIENT_EMAIL | `client_email` from the service-account JSON |
| FIREBASE_PRIVATE_KEY | `private_key` from the JSON (whole text incl. the `\n` parts, no quotes) |


Keep the service-account email and private key in Netlify environment variables with Functions scope, never in source files or browser configuration. The database URL is public Firebase client configuration; `netlify.toml` excludes only `FIREBASE_DB_URL` from value matching while keeping secrets scanning enabled for credentials. `.env` and `.env.*` files are already ignored.

If a service-account key was previously committed or exposed, revoke it in Google Cloud IAM and create a replacement for the Firebase service account, then update the Netlify variables. Removing a file does not revoke a key or erase Git history; coordinate any history cleanup with repository collaborators.

Then Deploys -> Trigger deploy -> Clear cache and deploy site.

The Netlify Bug Finder uses AI Gateway through the modern function runtime and the Anthropic SDK. Netlify supplies its AI credentials automatically; no provider key is needed in the repository or site setup. The optional Vercel deployment requires its own server-side provider configuration.

## 4. Firebase rules
Firebase Console -> Realtime Database -> Rules: paste `firebase-rules/database.rules.json`, Publish.
