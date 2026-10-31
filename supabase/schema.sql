-- =============================================================
--  Design | BNZ · Gestión personal — base de datos
--  Supabase → SQL Editor → New query → pegar todo → Run
-- =============================================================

-- 1) Un documento por sección (perfil, tareas, eventos, eco, pres, ia, avisos)
create table if not exists public.bnz_docs (
  user_id     uuid not null references auth.users (id) on delete cascade,
  doc         text not null,
  datos       jsonb not null,
  actualizado timestamptz not null default now(),
  primary key (user_id, doc)
);

-- 2) Copias de seguridad diarias (la app guarda las últimas 14)
create table if not exists public.bnz_respaldos (
  user_id uuid not null references auth.users (id) on delete cascade,
  fecha   text not null,
  datos   jsonb not null,
  creado  timestamptz not null default now(),
  primary key (user_id, fecha)
);

-- 3) Seguridad por fila: cada usuario solo ve y toca lo suyo.
--    Sin sesión (rol anon) no hay ningún permiso.
alter table public.bnz_docs      enable row level security;
alter table public.bnz_respaldos enable row level security;

drop policy if exists "docs propios"      on public.bnz_docs;
drop policy if exists "respaldos propios" on public.bnz_respaldos;

create policy "docs propios" on public.bnz_docs
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "respaldos propios" on public.bnz_respaldos
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4) Tiempo real: los cambios del celular aparecen en la PC al instante
do $$
begin
  alter publication supabase_realtime add table public.bnz_docs;
exception when duplicate_object then null;
end $$;
