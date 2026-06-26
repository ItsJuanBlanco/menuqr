/**
 * Sube Listo_.png al bucket público `assets` en Supabase Storage.
 *
 * Uso:
 *   1. Creá el bucket `assets` (público) en Supabase → Storage.
 *   2. Colocá el archivo en assets/Listo_.png
 *   3. node scripts/upload-listo-logo.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = 'https://fnkustudjcbczmmwhypq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gg5uweCqT8f6GbutQF_ePA_lhkC3GZJ';
const BUCKET = 'assets';
const OBJECT_PATH = 'Listo_.png';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const filePath = join(root, 'assets', OBJECT_PATH);

if (!existsSync(filePath)) {
  console.error(`No se encontró ${filePath}`);
  console.error('Colocá Listo_.png en la carpeta assets/ y volvé a ejecutar.');
  process.exit(1);
}

const body = readFileSync(filePath);
const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${OBJECT_PATH}`;

const response = await fetch(uploadUrl, {
  method: 'POST',
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'image/png',
    'x-upsert': 'true',
  },
  body,
});

const text = await response.text();

if (!response.ok) {
  console.error('Error al subir:', response.status, text);
  process.exit(1);
}

console.log('Logo subido correctamente.');
console.log(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${OBJECT_PATH}`);
