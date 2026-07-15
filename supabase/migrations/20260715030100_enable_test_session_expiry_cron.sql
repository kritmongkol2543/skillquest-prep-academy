create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'skillquest-expire-stale-tests',
  '* * * * *',
  'select public.expire_stale_test_sessions()'
);
