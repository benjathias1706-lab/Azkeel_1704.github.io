-- =============================================================
--  Recordatorios por WhatsApp cada 15 minutos (opcional, README paso 4)
--  Antes de correrlo, reemplazá:
--    TU-PROYECTO  → el id de tu proyecto (lo ves en la URL de Supabase)
--    TU_SECRETO   → el mismo valor que pusiste en CRON_SECRET
-- =============================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('bnz-recordatorios')
where exists (select 1 from cron.job where jobname = 'bnz-recordatorios');

select cron.schedule(
  'bnz-recordatorios',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://TU-PROYECTO.supabase.co/functions/v1/recordatorios',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "TU_SECRETO"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
