/* Public configuration only. Never put database passwords or service/admin keys here.
   After implementing docs/AUTH-BACKEND.md, set apiBaseUrl to '/api/auth'.
   Leave empty until that server exists. The optional development demo is a
   separate workspace; it never approves or authenticates a real account.
   publicDemoUrl enables that same isolated preview on one explicit HTTPS app URL.
   Enable Google only after server-side OAuth setup. Never put its secret here.
   Enable passkeys only after server verification + protected enrollment/recovery. */
window.EMMA_AUTH_CONFIG = Object.freeze({apiBaseUrl: '', googleEnabled: false, passkeyEnabled: false, developmentDemo: true, publicDemoUrl: 'https://grenthoxha.github.io/emma-space/', timeoutMs: 15000});
