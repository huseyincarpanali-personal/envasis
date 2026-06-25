# Envasis

Real-time inventory tracking for wholesalers who visit retailers in the field.
Built to run **free of charge** on the Firebase Spark plan.

- **3–5 tablets** sign in as role `user` → read everything + two write actions
  (sell/decrease stock, mark a destination visited).
- **1 PC** signs in as role `admin` → everything users can do, plus full
  management of products, destinations, units, and users.

Permissions are enforced **server-side** in [`firestore.rules`](firestore.rules),
so a tablet cannot delete a product or create a user even if tampered with — the
UI hiding is just convenience.

## Stack — and why it's free + real-time

| Concern | Choice |
|---|---|
| Database / realtime | **Cloud Firestore** — `onSnapshot` pushes changes to every device live |
| Auth + roles | **Firebase Auth** (email/password) + a `role` field per user |
| Hosting | **Firebase Hosting** (static) |
| Frontend | Plain HTML/CSS/JS (ES modules, Firebase SDK via CDN) — **no build step** |
| Offline | Firestore persistence on — tablets work with no signal, sync on reconnect |

Spark (free) limits are ~50K reads / 20K writes per day — vastly more than a
handful of devices need.

## Data model (Firestore)

- `users/{uid}` — `{ name, email, role: "admin"|"user", active, createdAt }`
- `products/{id}` — `{ name, sku, quantity, unit, createdAt, updatedAt }`
- `destinations/{id}` — `{ name, address, contact, lastVisitedAt, visitCount, createdAt }`
- `visits/{id}` — `{ destinationId, destName, userId, userName, items[], note, visitedAt }`
  (append-only history → "days since last visit", "sold last visit", "user history")

## Features mapped to your spec

**User (tablet):** see inventory levels · see destinations · decrease inventory
(`Sell`) · mark a destination visited · destination details incl. days since last
visit · own visit history.

**Admin (PC):** all of the above · add/remove products · add/remove destinations ·
set product units (kg, g, mg, litre, ml, piece, or custom) · add/remove users ·
enable/disable users · view any user's visit history.

## Setup (one time, ~10 min)

1. **Create a Firebase project** at <https://console.firebase.google.com> (Spark/free).
2. **Authentication** → Sign-in method → enable **Email/Password**.
3. **Firestore Database** → Create database → Production mode.
4. Install the CLI and log in:
   ```
   npm install -g firebase-tools
   firebase login
   ```
5. Put your project id in [`.firebaserc`](.firebaserc) (replace `YOUR_FIREBASE_PROJECT_ID`).
6. Paste your web config into [`public/js/config.js`](public/js/config.js)
   (Project settings → General → Your apps → Web app → Config).
7. Deploy rules, indexes, and the app:
   ```
   firebase deploy --only firestore:rules,firestore:indexes,hosting
   ```

### Create the first admin (bootstrap)

Security rules require an admin to create users, so seed the first one by hand:

1. **Authentication → Users → Add user** (email + password). Copy the **UID**.
2. **Firestore → Start collection** `users` → document ID = that **UID** → fields:
   - `name` (string), `email` (string), `role` = `admin`, `active` = `true`.
3. Open the app, sign in as that admin — now add the rest from the **Admin** tab.

## Local development

ES modules need HTTP (not `file://`):
```
firebase serve --only hosting     # or:  npx serve public
```
Then open the printed URL on your PC; open the same Hosting URL on the tablets.

## Known limitations / next steps

- **Mark-visited oversell:** the `Sell` button blocks going below zero, but
  recording sold items inside "Mark visited" uses an atomic decrement that can go
  negative if oversold. Add a guarded transaction if you need a hard stop.
- **Deleting a user** removes their Firestore profile (revokes app access) but not
  their Auth login — delete that in the console, or add a Cloud Function (needs
  the still-free-tier Blaze plan with a budget cap) to do it from the app.
- Nice-to-haves: PWA manifest + install-to-home-screen, CSV export, low-stock
  alerts, per-destination price lists.
