/* Public configuration only: the publishable key is designed for browsers.
   Never add database passwords, service-role keys or a Google client secret.
   See docs/SUPABASE.md for deployed schema, owner review and pending provider setup.
   The explicitly enabled demo keeps a separate database and never authenticates.
   Enable Google only after its credentials are configured inside Supabase. */
window.EMMA_AUTH_CONFIG = Object.freeze({
  provider: 'supabase',
  supabaseUrl: 'https://roexzfpbvbmvhwzsycsw.supabase.co',
  supabasePublishableKey: 'sb_publishable_RYEXZ-FLYcSklDSQnfcOpg_CHjkuO_j',
  redirectUrl: 'https://grenthoxha.github.io/emma-space/',
  apiBaseUrl: '',
  googleEnabled: false,
  passkeyEnabled: false,
  developmentDemo: true,
  publicDemoUrl: 'https://grenthoxha.github.io/emma-space/',
  timeoutMs: 15000
});
