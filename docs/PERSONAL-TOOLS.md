# Personal tools and reminders

The app now separates IndexedDB, draft, focus and fallback keys by the server-verified approved account UUID. A transaction in the original database assigns the legacy import to the first approved account on that device; originals remain recoverable. Administrator sessions route to the review panel before any personal workspace is loaded. Demo data remains isolated.

New local features: weekly backup reminder and date, storage measurements/persistence request, connection status, global search, ten-second undo for entity deletion and date-specific school timetable exceptions. Backups use schema 8, retain compatibility data and restore notifications disabled. Import first validates the candidate and keeps a recovery snapshot.

## Deployed reminder backend

`supabase-reminders.sql` and `supabase-reminders-cron.sql` were applied. `supabase/functions/emma-reminders/index.ts` is deployed as `emma-reminders`, with pinned Supabase and web-push packages. Cron is active each minute and invokes the dispatcher only when jobs are due. The function performs its own verified JWT/approval check for test notifications and timing-safe scheduler-secret check for dispatch; the legacy gateway JWT toggle is disabled for this mixed-auth endpoint. An unauthenticated POST was verified to return 401.

Only an approved verified account can register its own devices and metadata-only jobs. Private text stays local. Server signing keys and scheduler secret are generated server-side, denied to browser roles and excluded from backups. Jobs are leased atomically, retried at most three times, expire after one hour, and completed receipts prevent ordinary duplicate scheduling. Network retries can still duplicate a notification; this is not an exactly-once delivery guarantee.

Reminders are opt-in in Profile. On iPhone, open the installed Home Screen app and explicitly allow notifications. Local schedules queue the next seven days when the app opens or changes. Quiet hours default to 22:00–08:00; events during quiet hours are skipped. Browser/device availability controls final delivery. No real iPhone subscription/delivery has been tested yet, because the approved personal account and its device permission must be supplied by the owner/user.

Hosted `supabase-reminders-test.sql` passed approved-only access, cross-account isolation, private key denial, dispatcher authorization and non-overlapping job claims. All fixtures were rolled back.

## Email configuration still requiring private credential entry

The owner chose Gmail SMTP. In Supabase Authentication → Emails → SMTP Settings, use `smtp.gmail.com`, port `465`, sender name `Emma’s Space`. Sender email and SMTP username must be the owner's chosen Gmail address. The owner creates and enters the Gmail **App Password**, with Google 2-Step Verification enabled, directly in Supabase and saves it. Never commit it or send it in chat. No credential has been read or stored by the operator.

After enabling custom SMTP, apply `email-confirmation.html` to Confirm signup (subject: `Konfirmo emailin · Emma’s Space`) and `email-recovery.html` to Reset password (subject: `Rikthe hyrjen · Emma’s Space`). Keep Site URL exactly `https://grenthoxha.github.io/emma-space/`. Templates send TokenHash links so a verified callback can work across tabs/devices without the originating tab's PKCE verifier. Callback hashes are consumed once, immediately removed from the address, and never cached.

Email delivery and changing a real password have not been tested until the owner enters the SMTP credential. Google OAuth remains deferred.

## Verification

Run `node tools/install-test-runtime.cjs` once for the integrity-pinned IndexedDB test runtime, then each `tools/test-*.cjs`. Coverage includes legacy migration, account isolation, auth roles/recovery callbacks, backup validation, journal photos/PDF, routines, responsive calculations, date exceptions, local search, reminder metadata privacy, undo, subscription loss/account-switch races and safe service-worker notification links.

References: [Gmail SMTP](https://developers.google.com/workspace/gmail/imap/imap-smtp), [App Passwords](https://support.google.com/accounts/answer/185833), [Supabase templates](https://supabase.com/docs/guides/auth/auth-email-templates), [iOS Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
