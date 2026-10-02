# google-calendar Edge Function

Stores Google OAuth refresh tokens and fetches Calendar events server-side.

## Deploy

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push   # or run 002_google_oauth.sql in SQL Editor
supabase secrets set \
  GOOGLE_CLIENT_ID=your_web_oauth_client_id \
  GOOGLE_CLIENT_SECRET=your_web_oauth_client_secret
supabase functions deploy google-calendar
```

Use the **same** Google OAuth Client ID/Secret as Supabase Auth → Google provider.

## Actions (POST JSON + Authorization: Bearer &lt;user jwt&gt;)

| action | body |
|--------|------|
| `status` | `{}` → `{ "connected": true/false }` |
| `events` | `{ "timeMin": ISO, "timeMax": ISO }` |
| `disconnect` | `{}` |
