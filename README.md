# Free Fire Tournament app — GitHub deploy

```
public/                    the website (index.html = users, admin.html = admin panel)
netlify/functions/         watchearn.js (Watch & Earn backend), bugfix.mjs (admin Bug Finder)
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
| FIREBASE_DB_URL | Realtime Database URL from Firebase Console (required for backend functions) |
| FIREBASE_CLIENT_EMAIL | `client_email` from the service-account JSON |
| FIREBASE_PRIVATE_KEY | `private_key` from the JSON (whole text incl. the `\n` parts, no quotes) |
| ANTHROPIC_MODEL | optional Bug Finder model override; defaults to `claude-sonnet-5-5` |

Then Deploys -> Trigger deploy -> Clear cache and deploy site.

## 4. Firebase rules
Firebase Console -> Realtime Database -> Rules: paste `firebase-rules/database.rules.json`, Publish.

## Secrets scanning and credential recovery
The Firebase database URL in the browser's Firebase configuration is public connection information, not an authorization credential. `netlify.toml` excludes only `FIREBASE_DB_URL` from value matching so this required browser configuration does not block deployment. All other secret scanning stays enabled. Backend functions read the database URL from `process.env.FIREBASE_DB_URL` without a hardcoded fallback.

Set the Firebase variables in Netlify with Functions scope for each deployment context that needs them. Keep `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` server-side; never put them in HTML or build output. Existing `.gitignore` rules exclude environment files and common service-account key filenames.

If a service-account private key was previously published, create a replacement in Firebase Console → Project settings → Service accounts, update the Netlify environment variables, and revoke the exposed key in Google Cloud IAM → Service Accounts → Keys. Redeploy after updating the values. Removing a key from the current files does not revoke it or remove it from repository history. Coordinate any history cleanup with repository collaborators after rotation.

The Netlify Bug Finder used the modern function runtime and the official Anthropic SDK. Netlify AI Gateway supplies its credentials and provider base URL automatically; no custom provider key is required. The `/api/bugfix` route remains available.
