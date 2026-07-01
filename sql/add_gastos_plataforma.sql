create table if not exists public.gastos_plataforma (
  id uuid primary key default gen_random_uuid(),
  concepto text not null,
  monto numeric(12, 2) not null check (monto >= 0),
  categoria text not null check (categoria in ('Herramientas', 'Marketing', 'Transporte', 'Otros')),
  fecha date not null default current_date,
  notas text,
  creado_en timestamptz not null default now()
);

create index if not exists gastos_plataforma_fecha_idx
  on public.gastos_plataforma (fecha desc);
