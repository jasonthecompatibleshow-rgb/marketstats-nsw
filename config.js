/* MarketStats runtime config. Public values only: the publishable key is designed to be exposed in browsers
   (Row Level Security protects the data). Never put a secret / service_role key here.
   Set DEMO_MODE: true to test the accounts UI locally without Supabase (accounts stored in this browser only). */
window.MS_CONFIG = {
  SUPABASE_URL: 'https://tmmngtdjwouezdpfcskt.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_iB2kiEwhgsRLyARcjm9y2w_K1Pfj1lD',
  DEMO_MODE: false,
};
