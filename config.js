const SUPABASE_URL = 'https://fnkustudjcbczmmwhypq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gg5uweCqT8f6GbutQF_ePA_lhkC3GZJ';

/** Número de mesa por defecto (QR futuro: ?mesa=N) */
const DEFAULT_MESA_NUMERO = 1;

/** Cliente de Supabase (única instancia; el CDN ya expone el global `supabase` como librería) */
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
