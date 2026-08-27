-- Admin-only permission fix for the exam authoring Edge Function.
-- This does not change the player app, exam attempt flow, or existing exam APIs.

grant select on table public."ExamAuthoringAdmin" to service_role;
grant select, insert, update, delete on table public."ExamAuthoringSession" to service_role;
