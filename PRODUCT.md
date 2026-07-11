# Product

## Register

product

## Platform

web

## Users

Primary users are students preparing for entrance exams to Thai Armed Forces Academies Preparatory School. They open the site to practice exam sets, track progress, and understand where they are improving or slipping before the real exam.

Parents are a secondary audience. They may review attempt history, scores, active time, and progress insights, but the product should not require an account system. The experience should be immediately usable after opening the site, with a simple editable display name used wherever scores and rankings are shown.

## Product Purpose

SkillQuest helps exam-prep students practice test questions, continue interrupted attempts, and see their development through a dashboard with meaningful insights. Success means a student can start practicing quickly, understand their accuracy and speed, and feel clear about what to train next.

## Data Model Direction

Supabase is the database backend. The product should not introduce a full user account or login system unless explicitly requested later; persistence should support immediate-use flows such as editable display names, attempt history, scores, active time, rankings, and dashboard insights. Any browser-facing database access must avoid exposing service-role keys and should be designed with Supabase security and RLS implications in mind.

## Positioning

A clean, academy-grade exam practice dashboard that makes military preparatory school training feel focused, trackable, and motivating without adding login friction.

## Brand Personality

The brand should feel polished, disciplined, and encouraging. It should borrow the quiet confidence of a premium training institute and the clarity of an Apple-like product interface: clean surfaces, readable hierarchy, precise interactions, and restrained visual energy.

## Anti-references

Do not make the interface look over-generated, overly decorative, or visibly AI-made. Avoid fantasy game styling, excessive glow, generic SaaS decoration, cluttered dashboards, childish learning-game visuals, and visual effects that distract from practice and progress.

## Design Principles

1. Practice starts immediately: no account wall, no onboarding maze, and no unnecessary setup before a student can train.
2. Insight beats raw data: every score, timer, ranking, and history item should help students or parents understand progress.
3. Training feels disciplined: the interface should feel like a serious academy preparation tool, not a toy.
4. Motivation stays grounded: rankings and game mechanics should encourage consistency without overwhelming the learning task.
5. Clarity travels across devices: mobile, tablet, and desktop layouts should preserve readable Thai text, obvious actions, and stable exam workflows.

## Accessibility & Inclusion

Design for all common device sizes with readable Thai typography and iOS-informed interaction principles. Prioritize high contrast, clear focus states, comfortable touch targets, reduced-motion-friendly feedback, and layouts that remain usable on mobile during timed exam practice.
