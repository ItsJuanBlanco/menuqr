ALTER TABLE canciones_pedidas
ADD COLUMN IF NOT EXISTS created timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS canciones_pedidas_restaurante_created_idx
  ON canciones_pedidas (restaurante_id, created);
