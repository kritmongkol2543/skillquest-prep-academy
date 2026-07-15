create index if not exists "Test_Active_Status_UpdatedAt_idx"
  on public."Test" ("UpdatedAt" desc)
  where "Status" in ('in_progress', 'paused');
