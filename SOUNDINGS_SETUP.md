# Soundings v1: setting it up

What's here
- `soundings/` the page on the site (static, works on GitHub Pages)
- `soundings/engine.js` the rules. The AI never decides a classification, this file does
- `supabase/migrations/001_soundings.sql` database, with row-level security
- `supabase/functions/soundings-interview/` the AI interviewer (holds your Anthropic key, never the browser)
- `supabase/functions/_shared/engine.js` a copy of the rules for the server. If you change the rules, copy the file across again

## 1. Supabase (free plan)
1. Create a project at supabase.com. Pick a European region (London or Frankfurt).
2. SQL Editor > New query > paste `supabase/migrations/001_soundings.sql` > Run.
3. Authentication > Sign In / Providers: turn on **Anonymous sign-ins**. Leave Email on.
4. Authentication > URL Configuration: Site URL `https://www.antara-innovations.com`, add redirect `https://www.antara-innovations.com/soundings/`.
5. Project Settings > API: copy the Project URL and the anon public key into `soundings/config.js`.

## 2. The interviewer function
Install the Supabase CLI, then from the repo folder:
```
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... ALLOWED_ORIGIN=https://www.antara-innovations.com
supabase functions deploy soundings-interview
```
Model defaults to Claude Haiku 4.5 (cheap, fast). To try a stronger one: `supabase secrets set SOUNDINGS_MODEL=claude-sonnet-5`.
Set a monthly spend limit in the Anthropic console before you share the link.

For testing from your laptop, temporarily set `ALLOWED_ORIGIN=http://localhost:8000` and run `python3 -m http.server 8000` in the repo.

## 3. Publish
Commit and push. GitHub Pages serves `/soundings/`. The nav link "Free AI assessment" is already added on every page, and the sitemap has the new URL.

## 4. Seeing your leads
Supabase > SQL Editor: `select * from admin_leads;`
Requests for the detailed report or a full Soundings sit in `report_requests`.

## Before you share it widely
- Custom email sender (Authentication > Emails > SMTP). The built-in one only sends a handful of emails an hour.
- CAPTCHA on sign-up (Authentication > Attack Protection, Cloudflare Turnstile is free). Anonymous sign-ins invite bots, and bots cost you model calls.
- A short privacy notice page: you're collecting names and work emails, and answers go to an AI provider.
- Free Supabase projects pause after a week with no activity. Fine while testing, upgrade once leads matter.

## Free tier limits (change at the top of the function)
- 3 uses of AI per assessment
- 24 answers per assessment
