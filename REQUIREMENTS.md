# SkillQuest Requirements

## Product Context

SkillQuest is a web-based exam practice and progress dashboard for students preparing for entrance exams to Thai Armed Forces Academies Preparatory School.

The site should open and be usable immediately without a user account or login system. Users should be able to change the displayed name, and the app should use that name when showing scores, rankings, and profile information.

## Primary Users

- Students preparing for entrance exams to Thai Armed Forces Academies Preparatory School.
- Parents who want to view practice history, scores, active time, and progress insights.

## Core Goals

- Let students practice exam questions quickly.
- Track learning progress and attempt history.
- Show dashboards with useful insights, not just raw scores.
- Support active test attempt state, pause/resume behavior, active timer, ranking, and profile dashboard.
- Keep the experience lightweight and immediately accessible.

## Data And Backend

- Use Supabase as the database backend.
- Do not add a full user account or login system unless explicitly requested later.
- Any persisted score, ranking, attempt history, profile name, or dashboard insight data should be designed around Supabase.
- Supabase security rules must be handled carefully if any public browser writes are added later. Avoid exposing service-role keys in frontend code.

## Product Direction

- The product should feel like a polished training institute platform.
- The visual direction should be clean, premium, and Apple-like.
- Use iOS design principles: readable typography, clear hierarchy, soft restraint, comfortable spacing, strong touch usability, and device-friendly layouts.
- The interface should feel serious enough for exam preparation, but still motivating.

## What To Avoid

- No login or full user account system.
- Avoid designs that look obviously AI-generated.
- Avoid over-decoration, excessive glow, fantasy game styling, childish learning-game visuals, and generic dashboard clutter.
- Avoid interactions or visuals that distract from exam practice and progress tracking.

## Accessibility And Device Requirements

- Must work well on all common devices: mobile, tablet, and desktop.
- Thai text must be readable and comfortable.
- Use clear contrast, clear focus states, and touch-friendly controls.
- Support reduced-motion-friendly behavior where animation exists.
- Timed exam workflows must remain stable and usable on small screens.
