alter table public.restaurantes
  add column if not exists carta_con_fotos boolean default true;
