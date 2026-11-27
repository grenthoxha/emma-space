/* Public configuration only. Never put database passwords or service/admin keys here.
   After implementing docs/AUTH-BACKEND.md, set apiBaseUrl to '/api/auth'.
   Leave empty until that server exists. The optional development demo is a
   separate local workspace; it never approves or authenticates a real account.
   Enable Google only after server-side OAuth setup. Never put its secret here.
   Enable passkeys only after server verification + protected enrollment/recovery. */
window.EMMA_AUTH_CONFIG = Object.freeze({apiBaseUrl: '', googleEnabled: false, passkeyEnabled: false, developmentDemo: true, timeoutMs: 15000});
