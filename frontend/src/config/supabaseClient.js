import { createClient } from '@supabase/supabase-js';

// Resolve environment variables using Vite's standard import.meta.env,
// with safe fallback to process.env if executed in a Node.js runtime (e.g. testing).
const supabaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && (process.env?.VITE_SUPABASE_URL || process.env?.SUPABASE_URL)) ||
  '';

const supabaseAnonKey =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && (process.env?.VITE_SUPABASE_ANON_KEY || process.env?.SUPABASE_ANON_KEY)) ||
  '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[EquipX Warning]: Supabase URL or Anon Key is missing. Ensure your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables are configured.'
  );
}

/**
 * Standard Supabase client bound to the anonymous public key.
 * All operations through this client respect Row Level Security (RLS).
 */
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Optional administrative client bound to the Service Role Key.
 * Strictly used for offline CLI tasks and seed automation; never exposed to React.
 */
export const createAdminClient = () => {
  const serviceRoleKey = typeof process !== 'undefined' ? process.env?.SUPABASE_SERVICE_ROLE_KEY : undefined;
  if (!serviceRoleKey) {
    throw new Error('Cannot instantiate admin client: SUPABASE_SERVICE_ROLE_KEY is not defined.');
  }
  return createClient(supabaseUrl || '', serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};
