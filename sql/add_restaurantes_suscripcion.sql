alter table public.restaurantes
  add column if not exists estado_suscripcion text
    check (estado_suscripcion is null or estado_suscripcion in ('trial', 'activo', 'vencido', 'cancelado')),
  add column if not exists fecha_inicio_trial date,
  add column if not exists proximo_cobro date,
  add column if not exists valor_mensual numeric(12, 2) default 150000;

create table if not exists public.pagos_suscripcion (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  fecha date not null default current_date,
  monto numeric(12, 2) not null check (monto >= 0),
  creado_en timestamptz not null default now()
);

create index if not exists pagos_suscripcion_restaurante_idx
  on public.pagos_suscripcion (restaurante_id, fecha desc);
