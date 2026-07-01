alter table public.restaurantes
  add column if not exists numero_nequi text,
  add column if not exists numero_cuenta_bancolombia text;
