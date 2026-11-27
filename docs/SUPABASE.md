# Emma's Space — Supabase authentication

Project: `roexzfpbvbmvhwzsycsw`, West EU (Ireland), Free plan.
App and exact redirect URL: `https://grenthoxha.github.io/emma-space/`.

## Deployed

`docs/supabase-setup.sql` was executed in the project SQL Editor. It creates an RLS-protected `emma_access_requests` table and private `emma-registration` JPEG bucket (1 MB maximum). No secret key was read or added to the repository. Client SDK `@supabase/supabase-js` 2.119.2 is vendored, pinned and integrity-checked; see `vendor/supabase.lock.json`.

Registration: email/password → confirm the email → log in → live camera/photo consent → upload → pending review. Google follows the same photo/review requirement after a verified provider login. No email is automatically approved and no public signup can become an administrator.

The applicant can read only their request/photo, submit a photo after verified authentication and replace it while pending. Status is not a client-writable column. A private trigger verifies the actual Auth user and stored photo before accepting a request or approval. A partial unique index permits only one approved account. Revocation/rejection closes the gate on the next online status check.

## Required external configuration — still pending

- **Google**: create a Web OAuth client in the owner's Google Cloud project, configure the consent screen/audience, use `https://roexzfpbvbmvhwzsycsw.supabase.co/auth/v1/callback` as the exact redirect URI, then enter the client ID/secret in Supabase → Authentication → Sign In / Providers → Google. Do not place the secret in frontend code. Keep nonce/email checks enabled. Only after provider verification set `googleEnabled:true` in root and dist configuration.
- **Email delivery**: configure a real SMTP sender in Authentication → Emails → SMTP Settings. Supabase's built-in sender only delivers to organization team addresses and is rate-limited; do not invite Emma to the Supabase organization as a workaround. Email confirmation remains enabled. The app cannot promise delivery to Emma until SMTP is set and tested.
- **Real-device verification**: register the actual account, verify email/provider, capture a live photo on iPhone, review/approve it as owner, then test login, logout, reopening and revocation. Automated tests do not replace this step. A new-tab email callback may ask the user to sign in with their password after confirmation because PKCE storage is scoped to the originating tab.

## Owner review

The owner now has a dedicated [administration panel](ADMIN.md) with **Prano / Refuzo / Hiq qasjen**. Its backend is deployed and the owner's chosen verified account has been privately assigned after explicit confirmation. It allows one administrator and one approved app user; the regular app cannot grant this role. No owner email or credentials are stored in the public configuration.

Use the Supabase dashboard account that owns this project. Authentication → Users lists the verified email and user UUID. Storage → Files → `emma-registration` contains that UUID's private `capture.jpg`. Table Editor → `emma_access_requests` shows submitted requests. Match the UUID/email/photo yourself; change only the intended request's `status` from `pending` to `approved`, or to `rejected`. The database blocks a second approved account even for concurrent approvals. Use `revoked` to withdraw access. No approval has been performed automatically.

The panel's account form creates an ordinary verified Auth account only. Administrator assignment is owner-only in the Supabase dashboard; no signup grants privileged access and there is no default password. The public introduction still reads “Lejohet vetëm llogaria e Emmës.”

## Sessions, offline and data

The static GitHub Pages app uses Supabase's maintained PKCE client. Tokens and PKCE verifier are scoped to `sessionStorage` in the current tab, under `emma-space-supabase-session`, with automatic token refresh while open. They are not HttpOnly and are not included in app backups. Closing the browsing session may require signing in again. Callback codes are exchanged once and removed from the address immediately. Auth/Storage/API requests use `cache:no-store`; the service worker ignores cross-origin requests and auth callback URLs. Logout attempts server revocation of this session and always clears this tab's stored session, including on network failure. Previously issued access JWTs may remain valid until expiry; database policies and fresh status reads remain authoritative.

The normal app gate requires an online verified account and approved database record. A frontend gate is not encryption of IndexedDB and cannot protect device-local files from someone controlling the device. Diary, study tasks, timetable, routines, profile photos and backups remain local; only the explicitly consented registration photo and account/request metadata are stored by Supabase. The live photo is for manual review, not automatic facial recognition or proof of liveness.

The isolated public demo stays available during setup, uses separate local storage and does not call authentication or open the real workspace. Disable `developmentDemo` when the owner decides to retire it.

## Verification performed

- Hosted SQL transaction tested own-only request/photo visibility, blocked another user's insert, blocked self-approval, blocked an unverified email, blocked anonymous reads and blocked a second approved account. All synthetic test records were rolled back; a follow-up count confirmed zero test users.
- Supabase Security Advisor rerun after revoking public execution of its default `public.rls_auto_enable()` function: **0 errors, 0 warnings**.
- `node tools/test-supabase-auth.cjs` covers callback cleanup, email verification, pending/photo flow, consent, approved/revoked states, spoofed metadata, logout, stale replies and no-store fetch.

References: [Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
