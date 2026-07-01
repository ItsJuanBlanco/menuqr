alter table public.locales
  add column if not exists link_google text,
  add column if not exists anotaciones text;
