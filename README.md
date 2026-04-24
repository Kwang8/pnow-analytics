# PokerScope

Poker Now hand history analyzer with Firebase-backed game storage and a Tampermonkey sync flow.

## Local app

```bash
npm install
npm run dev
```

## PokerNow sync API

The Tampermonkey script in [pokernow-sync.user.js](/Users/vicky/Desktop/vzhang-git/pnow-analytics/pokernow-sync.user.js) posts the full `PokerNowExport` payload to `POST /api/pokernow/import`.

The server endpoint:

- validates the request and optional import key
- checks that the configured player name exists in the uploaded game
- de-dupes by PokerNow game id for the configured uploader
- stores the compressed raw game in Firestore
- auto-claims the matching player row for the configured user

### Required environment variables

Copy [.env.example](/Users/vicky/Desktop/vzhang-git/pnow-analytics/.env.example) and set:

- `POKERNOW_IMPORT_UID`: your Firebase Auth user id
- `POKERNOW_IMPORT_EMAIL`: email to store on imported games
- `POKERNOW_IMPORT_KEY`: shared secret used by the userscript

For Firebase Admin credentials, use one of:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_ADMIN_PROJECT_ID` + `FIREBASE_ADMIN_CLIENT_EMAIL` + `FIREBASE_ADMIN_PRIVATE_KEY`

### Vercel

Set the variables above in your Vercel project settings before deploying. The import endpoint lives at:

```text
/api/pokernow/import
```

## Tampermonkey setup

1. Install the script from [pokernow-sync.user.js](/Users/vicky/Desktop/vzhang-git/pnow-analytics/pokernow-sync.user.js).
2. In the Tampermonkey menu, set:
3. `Tracker app URL`
4. `PokerNow player name`
5. `Optional import key`

Then open a PokerNow game and click `Sync to Tracker`.

The script now tries to discover the in-page PokerNow export object and upload it directly, so you do not need to manually download the JSON first.
