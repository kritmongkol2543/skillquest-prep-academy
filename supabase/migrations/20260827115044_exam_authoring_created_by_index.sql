create index if not exists "Category_CreatedBy_idx"
  on public."Category" ("CreatedBy")
  where "CreatedBy" is not null;
