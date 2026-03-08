# MoneyFlow Pro (Supabase Realtime)

## Setup

1. Copy env template and set values:
   - `cp .env.example .env`
   - Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
2. Install dependencies:
   - `npm install`
3. Apply DB schema in Supabase SQL editor:
   - `supabase/schema.sql`
4. Run locally:
   - `npm run dev`

## Realtime + Multi-user

- Email/password auth via Supabase Auth.
- Per-user isolation with RLS (`auth.uid() = user_id`).
- Live updates through Supabase realtime on `finance_records`.

## Vercel Deploy

1. Import repo in Vercel.
2. Add env vars in project settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy (build command is already `npm run build`).
