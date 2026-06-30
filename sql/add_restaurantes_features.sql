ALTER TABLE restaurantes
ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE restaurantes
SET features = jsonb_strip_nulls(
  jsonb_build_object(
    'musica', musica_habilitada,
    'comisiones', slug = 'donde-juanito'
  )
)
WHERE features = '{}'::jsonb
  AND (musica_habilitada = true OR slug = 'donde-juanito');
