// Same Supabase project as the other tools. Manifest's drafting happens
// server side, in the manifest-draft edge function, which needs
// ANTHROPIC_API_KEY set as a Supabase secret (already set at project level).
// Deploy: supabase functions deploy manifest-draft
export const SUPABASE_URL = "https://oxmoenclvifxhgwsxfop.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94bW9lbmNsdmlmeGhnd3N4Zm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxODM2NDcsImV4cCI6MjEwNTc1OTY0N30.6gCGL67utfa0ApERu6an_wDw3I_KNnQLINO9FAQEoQA";

export const FREE_REPORT_LIMIT = 3;
export const PRICE_LABEL = "£19/month for 5 reports, £29/month unlimited";
export const CONTACT_EMAIL = "hello@antara-innovations.com";
