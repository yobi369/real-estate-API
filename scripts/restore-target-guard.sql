SELECT count(*) FROM (
  SELECT c.oid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    AND n.nspname NOT LIKE 'pg_temp_%'
    AND n.nspname NOT LIKE 'pg_toast_temp_%'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  UNION ALL
  SELECT p.oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    AND n.nspname NOT LIKE 'pg_temp_%'
    AND n.nspname NOT LIKE 'pg_toast_temp_%'
  UNION ALL
  SELECT t.oid
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    AND n.nspname NOT LIKE 'pg_temp_%'
    AND n.nspname NOT LIKE 'pg_toast_temp_%'
  UNION ALL
  SELECT n.oid
  FROM pg_namespace n
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'public')
    AND n.nspname NOT LIKE 'pg_temp_%'
    AND n.nspname NOT LIKE 'pg_toast_temp_%'
  UNION ALL
  SELECT oid FROM pg_largeobject_metadata
  UNION ALL
  SELECT oid FROM pg_event_trigger
  UNION ALL
  SELECT oid FROM pg_publication
  UNION ALL
  SELECT oid FROM pg_subscription
  UNION ALL
  SELECT oid FROM pg_foreign_data_wrapper
  UNION ALL
  SELECT oid FROM pg_foreign_server
  UNION ALL
  SELECT oid FROM pg_user_mapping
) AS user_objects;
