# Converse360 mobile (Flutter)

Design: `mobile-app-prototype.html`. Spec: `mobile-app-feature-spec.pdf`.

## Run

    cd apps/mobile_flutter
    cp env.example.json env.json        # Supabase URL + anon key, API URL (LAN IP on a real phone)
    flutter pub get
    flutter run --dart-define-from-file=env.json
    flutter analyze && flutter test

## Architecture

- `lib/core` pure Dart: models, inbox rules (reply window, filters), API client.
- `lib/state/auth.dart` the auth state machine (loading, signedOut, noWorkspace,
  needsPick, ready, error). `lib/router.dart` redirects from it; screens never
  navigate on auth changes themselves.
- `lib/state/data.dart` workspace-scoped Riverpod providers. Every account-scoped
  query names the workspace (`.eq('account_id', ...)`), because RLS only scopes a
  browser query to the caller's memberships (see apps/web/src/lib/workspace/scope.ts).
  Providers watch `accountIdProvider`, so switching workspace disposes the
  realtime channels and refetches under the new one.
- Reads go straight to Supabase under RLS. Writes with side effects (send) go to
  `apps/api` with `Authorization: Bearer <token>` and `x-workspace-id`, which the
  API accepts since the mobile change in `apps/api/src/auth`.
- The session is stored in the platform keystore (flutter_secure_storage).

## Status

Done (all on tables/endpoints that already exist):
sign-in, workspace picker and lapsed/no-workspace states, Home (+ notification bell),
Inbox (filters, search, realtime), chat (realtime, 24h window, text send on all 3
channels, mark read, internal notes with @mentions, `/` quick replies, resolve /
reopen, assign), Contacts (search, detail with notes), Deals board (move stage),
Send tab (broadcast reports + template list, read-only), Notifications,
Quick replies management, role gating (viewers are read-only).

Needs NEW backend and/or native setup (not started):
push notifications (FCM/APNs + device_tokens), web login by QR (3.1a), opt-out
keywords + consent columns and then broadcast create/schedule/retry, CSAT,
auto-assignment, business-hours away message, short links/QR, payment links,
cart recovery, A/B broadcasts, voice notes and media send, biometric lock,
Google sign-in, offline send queue, CSV import, segments, AI agent studio,
flows/automations viewer.
