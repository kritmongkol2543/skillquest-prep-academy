# SkillQuest Prep Academy

Static exam-practice dashboard for GitHub Pages with Supabase persistence, anonymous sessions, secure server-side grading, attempt history, and leaderboard insights.

## Local development

```bash
npm ci
npm run dev
```

The checked-in Supabase URL and publishable key are public client identifiers, not secrets. You can override them with the values shown in `.env.example`.

## Deployment

Push `main` to a GitHub repository and select **GitHub Actions** as the Pages source. The workflow type-checks, builds a static export, and deploys `out/`.

The backend schema is versioned in `supabase/migrations/` and the authenticated Edge API is in `supabase/functions/skillquest-api/`.

