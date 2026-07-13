create index if not exists "Attempt_TestID_idx"
  on public."Attempt" ("TestID");

create index if not exists "Test_QuestionID_idx"
  on public."Test" ("QuestionID");
