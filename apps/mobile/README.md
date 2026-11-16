# Converse360 mobile (Expo / React Native)

Design: `mobile-app-prototype.html`, spec: `mobile-app-feature-spec.pdf`.

## Run

```bash
cd apps/mobile
cp .env.example .env      # Supabase URL + anon key, API URL (LAN IP on a real phone)
npm install               # NOT part of the root npm workspaces (see below)
npm start                 # scan the QR with Expo Go, or `npm run android` / `ios`
npm run typecheck && npm test
```

## Why it is outside the workspaces

Root `package.json` excludes `!apps/mobile`. React Native pins its own React
(19.1) while `apps/web` pins 19.2.4, and hoisting both into one `node_modules`
breaks one of them. It has its own lockfile.

## How it talks to the backend

- **Reads** (conversations, messages, contacts) go straight to Supabase under RLS,
  exactly like the web app, and **every account-scoped query names the workspace**
  (`src/lib/queries.ts`; rule in `apps/web/src/lib/workspace/scope.ts`).
- **Writes with side effects** (send) go to `apps/api` with
  `Authorization: Bearer <supabase access token>` and `x-workspace-id`.
  The API guard accepts both since this app was added
  (`verify-supabase-session.ts`, `requestedWorkspaceId` in `active-workspace.ts`).
  The header is matched against `account_members`, never trusted.
- Switching workspace clears the query cache and remounts the tabs (the mobile
  equivalent of the web's forced full reload).

## Status

Done: sign-in, workspace picker (standing as colour + text, grace never looks like
lapsed, "no workspace" state, lapsed screen), Home, Inbox (filters, search,
realtime), chat thread (realtime, 24h window, text send on all 3 channels,
mark-read), Contacts (search).

Not yet (spec P1): internal notes, canned replies, push notifications, voice
notes/media, deals kanban, broadcasts (ship with opt-out), Google sign-in, QR
web-login (3.1a), offline queue.
