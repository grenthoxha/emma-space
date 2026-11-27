# Emma's Space: authentication integration

## What is implemented now

Registration is the default first screen; existing users can select "Hyr". The forms include an optional "Vazhdo me Google" route, front-camera capture (not a file picker), explicit photo-upload consent, pending/rejected views, session checking, logout and a fail-closed app gate. Existing diary/study data is still device-local and is not included in any auth request.

**There is no authentication server/database deployed or bundled here.** `auth-config.js` deliberately has an empty `apiBaseUrl`. Login and camera submission are disabled until a real backend is connected. There is no demo password, default administrator credential, local-storage approval flag, or PIN-only bypass. Existing personal device data is retained but not opened by the UI without a server-verified approved session.

### Isolated development and published demo

The user-requested **Hap demon** button opens a separate development workspace. It requires `developmentDemo:true` and an empty `apiBaseUrl`. It is available from local `file:` URLs and exact loopback hosts (`localhost`, `127.0.0.1`, `[::1]`), and the owner-authorized preview at `publicDemoUrl: 'https://grenthoxha.github.io/emma-space/'`. The published option matches the exact HTTPS origin and app path (including explicit `index.html`); other domains/paths do not gain access from `?demo=1`. Configuring a backend disables both local and published demo. Disable `developmentDemo` and clear `publicDemoUrl` when retiring the preview.

Demo requires an explicit button click or the approved `?demo=1` URL, shows a persistent **Demo · Të dhëna prove** header with **Dil nga demo**, uses an app icon in place of the personal avatar, and never authenticates/approves an account or calls auth endpoints. The database name, legacy/fallback storage, diary drafts, signed-out marker and task-reminder keys all use an `emma-space-demo:` prefix. It cannot automatically read/import the real workspace or its drafts/recovery snapshot. Demo edits survive reload in their separate device-local database and are not synchronized/uploaded. Exiting saves the demo and navigates back to the ordinary registration/login URL without changing the real signed-out marker or session.

Google is separately disabled by `googleEnabled: false` until a real server-side OAuth client has been configured. A Google identity alone never satisfies Emma's photo/approval requirements.

The iPhone entry uses a two-step email registration (account, then live photo). Credentials remain in memory only between the steps; going back keeps the form, switching methods clears it. Inputs use 16px text, native password AutoFill, 44–52px controls, safe-area insets and normal document scrolling for the keyboard. Desktop and existing dark themes share the same flow.

### Optional passkey sign-in on iPhone

`passkeyEnabled: false` keeps this feature disabled until the backend and secure enrollment exist. The login view offers **Hyr me passkey** alongside Google and email. This uses WebAuthn, not a fake Face ID screen or camera-based face recognition. iOS selects the available verification method (Face ID, Touch ID or device code); the app cannot insist on a particular biometric. Existing registration, email verification and manual approval still apply. There is no new public passkey-only registration route.

Server contract, relative to `/api/auth`:

| Endpoint | Contract |
| --- | --- |
| `POST /passkeys/login/options` | CSRF-protected JSON `{}`; returns `{publicKey:{challenge:"base64url-random-challenge",rpId:"exact-app-hostname",allowCredentials:[]}}`. Use discoverable credentials to avoid asking for an email first. |
| `POST /passkeys/login/verify` | CSRF-protected JSON WebAuthn assertion: `id`, base64url `rawId`, `type:"public-key"`, and `response` with base64url `clientDataJSON`, `authenticatorData`, `signature`, nullable `userHandle`. Return the normal server-verified session. |

Generate a short-lived, unpredictable, single-use challenge on the server and bind it to the anonymous browser session. Use a maintained WebAuthn server library to verify signature against the saved public key, expected challenge, exact HTTPS origin and RP ID, credential ownership, user presence and **required user verification**; handle counters/backup flags according to the library's passkey guidance. Never accept a successful browser prompt as proof without server verification. Re-check the account's current role/approval/revocation before rotating the session and issuing the normal cookie. The client also requires exact-host RP ID and always requests `userVerification:"required"`.

Before enabling this flag, implement explicit passkey enrollment and removal in a protected account-settings interface after a recent approved-account authentication, including server creation/verification endpoints, a discoverable credential with required user verification, private credential-to-account mapping, and an independent recovery method. Enrollment/credential management and its production UI are **not included here**; the entry client implements only sign-in. Do not silently create/link a credential from the public registration screen, local PIN or supplied email. No biometric templates/private keys should be stored by this app/server. No real passkey is created in development tests.

The WebAuthn request is started only by tapping the button. It cancels on view destruction, page hiding or logout; canceled prompts and late replies do not open the app. Unsupported browsers retain email and Google. Test on a physical iPhone in both Safari and the installed Home Screen app under the final HTTPS hostname before production; responsive desktop emulation does not verify Face ID or iOS AutoFill.

Primary references: [Apple passkeys](https://developer.apple.com/passkeys/), [WebAuthn credential request](https://developer.mozilla.org/en-US/docs/Web/API/CredentialsContainer/get#retrieving_a_public_key_credential).

This gate is not encryption of IndexedDB. Someone controlling the device/browser can inspect local files/storage. Do not present this as protection from a compromised/shared device. Server data must be authorized independently of this frontend.

## Connect a backend later

1. Deploy the app and authentication API on one HTTPS origin. Proxy `/api/auth/*` to the backend; localhost HTTP is supported only for development.
2. Implement the contract below and server-side authorization. Keep DB credentials, signing keys and service keys **only on the server**.
3. Provision the owner/administrator privately, not through the public registration form. Do not expose an admin password in JavaScript or SQL committed to source control.
4. Set `window.EMMA_AUTH_CONFIG.apiBaseUrl` to `/api/auth` in `auth-config.js`, then copy the release to `dist/` and update the service-worker cache version.
5. Run the automated tests and real HTTPS integration tests for email verification, photo upload, administrator approval, rejected requests, duplicate approval, expiry/revocation and logout before enabling production use.

No email address needs to be pre-allowed. Applicants can submit requests, but none gain access automatically. The owner must identify and approve **Emma**, and the database must prevent a second active Emma account even under simultaneous approvals.

## API contract

All responses are JSON, carry `Cache-Control: no-store`, and never return password hashes or photo contents. Auth cookies use `HttpOnly; Secure; SameSite=Strict; Path=/` (use a host-only cookie, e.g. `__Host-emma_session`). Do not return bearer tokens to this client. The transport uses same-origin cookies, rejects redirects, and does not store session identifiers in web storage.

For unauthenticated clients, `GET /session` returns HTTP 200 with a CSRF token bound to an anonymous/session cookie:

```json
{"user":null,"csrfToken":"server-generated-unpredictable-token"}
```

For an authenticated approved account:

```json
{"user":{"id":"server-account-id","email":"actual-account-address","role":"emma","status":"approved","emailVerified":true},"csrfToken":"rotated-server-token"}
```

`email` must be a valid actual email address, not the illustrative string above. The client opens the app only when **all** approval fields match. A pending account gets a restricted session with `status: "pending"`, `role: "applicant"`, its own `id`/`email` and `emailVerified`. That cookie may access only status/verification/logout, never protected application APIs. `status: "rejected"` shows the rejection screen. Admin-role sessions do not open the private Emma app.

| Endpoint relative to `/api/auth` | Request | Success |
| --- | --- | --- |
| `GET /session` | No body; cookies only | Session response above; anonymous is also 200 |
| `POST /login` | JSON `{email,password}` | Session response; rotate the session ID and CSRF token |
| `POST /register` | Multipart `email`, `password`, `photo` (JPEG), `capturedAt` (client ISO), `photoConsent=true` | 202 `{status:"pending",emailVerified:false,csrfToken:"..."}` plus restricted pending-session cookie |
| `POST /logout` | JSON `{}` | 200 `{ok:true}`; revoke session server-side and expire cookie |

### Optional Google / Gmail account flow

Use a server-managed OpenID Connect authorization-code flow, not a Gmail-password field. No Gmail inbox/read/send scopes are requested. A Google account is optional; ordinary email/password registration remains available.

After configuring Google Cloud's consent screen, a web OAuth client and its **exact authorized redirect URI**, keep client secrets and token exchange on the server. Set `googleEnabled: true` only after these endpoints are implemented:

| Endpoint | Contract |
| --- | --- |
| `POST /google/start` | JSON `{intent:"register"}` or `{intent:"login"}` with CSRF; returns `{authorizationUrl:"https://accounts.google.com/o/oauth2/v2/auth?..."}` |
| `GET /google/callback` | Google redirects here with code/state; server validates/exchanges the code, creates the appropriate session, then redirects to the app's static `index.html`. Never forward codes or tokens to the frontend URL. |
| `POST /google/complete` | Multipart `photo`, `capturedAt`, `photoConsent`; identify the applicant from the restricted session, **not** from a supplied email. Return 202 `{status:"pending"}` after saving the photo/consent. |

The start URL must have `response_type=code`, a real `client_id`, server-generated unpredictable `state` and `nonce`, PKCE S256 (`code_challenge`), `redirect_uri=<apiBaseUrl>/google/callback`, and only `scope=openid email profile` (profile is optional). The frontend validates the destination/parameters and clears the local logout marker only after an explicit valid Google-start response. It does not trust URL parameters as proof of login.

Bind a short-lived, single-use OAuth flow to the browser. Google returns by cross-site GET: use a dedicated `HttpOnly; Secure; SameSite=Lax` flow cookie for that callback, while retaining Strict app-session cookies. Keep the PKCE verifier private on the server; validate state, browser binding and expiry before exchange. Verify the Google ID token with a maintained provider library (issuer, audience, signature, expiry, nonce and email-ownership checks); use the stable verified `sub` as the provider identity. Consume the flow once, expire the flow cookie and rotate the app session. Redact callback query strings from logs and apply `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

Do not auto-link a Google identity to a password account solely by email. Linking/recovery requires an authenticated, explicit flow. Enforce one identity mapping per provider subject in the database and create the account/identity transactionally. Google-only accounts have no local password hash; do not generate a dummy/shared password for them.

For a new, verified Google applicant without a live photo, `/session` returns:

```json
{"user":{"id":"pending-account-id","email":"actual-verified-address","role":"applicant","status":"pending","emailVerified":true,"provider":"google","registrationComplete":false},"csrfToken":"server-generated-token"}
```

This opens **only** the photo-completion form. It does not open the diary. After `/google/complete`, return the restricted pending session with `registrationComplete:true`; the normal pending screen remains until manual approval. Google's avatar is **not** a substitute for the live photograph. Already-approved Emma accounts may sign in with their previously linked Google identity; their session must include `provider:"google"` and `registrationComplete:true` alongside the usual approval fields. Every protected API still checks approval/role server-side. For non-Gmail/non-hosted-domain Google addresses, follow Google's email-ownership guidance and perform additional email verification when necessary before offering photo completion.

Use a supported normal browser/PWA for the real OAuth flow; embedded WebViews may be rejected by Google. Tests use mocked transports/synthetic video and do not log into a real Google account.

Primary integration references: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Google button branding](https://developers.google.com/identity/branding-guidelines).

Every POST carries `X-CSRF-Token`, obtained from `/session`. Validate it server-side, verify `Origin`/same-origin and reject missing/invalid tokens. Use generic login errors (`401 {code:"INVALID_CREDENTIALS"}`), throttling (`429 {code:"RATE_LIMITED"}`), and structured non-sensitive errors. Do not expose raw exceptions or log request bodies, credentials or photos.

The registration password policy is 12–128 characters; the server must enforce it too and hash passwords using an appropriate password-hashing implementation (not plain SHA-256). Normalize email addresses consistently on the server and require email verification. This frontend does not implement mail delivery/reset-token redemption; the backend/provider must supply verification and password recovery through secure, expiring single-use links.

The client does not automatically retry registration or credential POSTs. Enforce normalized-email uniqueness and do not replace an existing password/photo through an unauthenticated duplicate registration.

## Live photograph and privacy

The camera starts only after an explicit button click and browser permission. No microphone is requested. Capture is JPEG, max 720 pixels on the long side and 1 MiB. Tracks are stopped after capture, on tab hiding and on view destruction. Photo blobs stay only in memory until submission; they are not in localStorage, IndexedDB, app backups or the diary. Email/password/photo are sent only to the configured same-origin auth API after explicit photo consent.

A browser camera capture **does not prove liveness or identity**: virtual cameras and modified clients exist. `capturedAt` is untrusted client metadata. The server must record its own submission time; the owner manually reviews and confirms identity. For stronger liveness guarantees, separately choose and consent to a suitable verified service; none is silently integrated here.

On the server: size-limit requests, validate/decode/re-encode images (do not trust MIME/extensions), strip metadata, reject active content, store images in private object storage and authorize every review read. Never expose public image URLs. Define a clear retention/deletion policy before launch; no facial-recognition/AI processing or automatic reuse as an avatar is authorized by this implementation.

## Private approval workflow (backend responsibility)

Provide an owner-only review interface/API separate from the public login. The public entry screen must not mention an administrator or display a public admin-registration link.

The approval endpoint must authenticate an owner/admin, enforce CSRF, check email verification and photo consent, verify the request is pending, and after manual photo review in a transaction set `role='emma'`, `status='approved'`, `photo_reviewed_at`, `approved_by`, and `approved_at`. The unique approved-Emma constraint must be checked by the database, not just by counting records in UI code. Rejecting/revoking must invalidate relevant sessions. Record approvals/rejections in an audit log. Private owner provisioning and the approval interface are **not implemented by this frontend**.

See `auth-schema.sql` for a PostgreSQL reference, not a deployed migration or a database connection. An equivalent schema/transaction is required if a different database is selected.

## Offline and migration

Static forms/assets still open offline. Fresh authenticated access requires a verified server session; a cached boolean/PIN cannot stand in for server approval. An existing server session is rechecked after returning to the foreground. An unavailable/revoked session hides private UI instead of silently trusting local state. This intentionally changes the old offline-only entry behavior.

The old local signed-out marker only suppresses automatic session restoration after an explicit logout. It never authenticates anyone. The optional old PIN is a **second local screen lock after login**, not a replacement for email/password or approval. Logout preserves drafts and local content and also attempts server-side session revocation; a network failure is clearly reported rather than claiming that the server session was revoked.

Authentication does not migrate diary data to a database. Plan owner binding and explicit consent/backup before any future device-data synchronization.

## Tests and security references

Run `node tools/test-auth-service.cjs`, `node tools/test-local-session.cjs`, `node tools/test-responsive.cjs`, `node tools/test-journal-routines.cjs`, and `node tools/test-space-improvements.cjs`. Mock auth transports are confined to test files. Local-demo tests verify scope restrictions and that demo drafts/saves/logout leave real storage unchanged; the real auth transport remains fail-closed.

Primary references used: [MDN camera permissions and secure contexts](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP browser-storage security](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html).
