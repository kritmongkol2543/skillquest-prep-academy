# SkillQuest Security Model

## Runtime boundaries

- GitHub Pages serves static files only. It stores no service credentials and runs no trusted grading logic.
- The browser receives only the Supabase publishable key. This key is intentionally public and relies on Auth, RLS, and the Edge API for authorization.
- Supabase Anonymous Auth creates a private per-browser identity without a visible login flow.
- Correct answers live in the unexposed `private` schema.
- Grading and leaderboard reads pass through `skillquest-api`, which requires a valid user JWT.
- The service-role key exists only in the managed Supabase Edge Function environment.

## Database protections

- RLS is enabled on every table.
- Profiles and attempt history are restricted to `auth.uid()` ownership.
- Direct browser writes to attempts and leaderboard data are denied.
- Attempt submission is idempotent by `(user_id, client_nonce)`.
- A transaction-scoped advisory lock prevents concurrent ranked submissions.
- Submissions are limited to 20 per user per hour and one ranked attempt per set per UTC day.
- Input size, answer shape, timer bounds, and display-name length are constrained.

## Required production settings

1. Enable **Anonymous Sign-Ins** in Supabase Auth Providers.
2. Enable **Cloudflare Turnstile** for Auth before opening the site to broad public traffic.
3. Keep Supabase Auth's anonymous sign-in rate limit at or below 30 requests per IP per hour.
4. Never add a service-role or secret key to GitHub, client code, Actions variables, or Pages output.
5. Review Supabase Security and Performance Advisors after every schema migration.

## Recovery behavior

The current attempt is continuously stored in browser storage. Network failures do not erase answers or active time. Submission uses a stable nonce, so retrying after an uncertain response cannot create a duplicate attempt.

