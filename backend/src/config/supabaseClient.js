import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load local environment variables when executed in a Node.js runtime (scripts, tests)
if (typeof process !== 'undefined' && process.env) {
  dotenv.config();
}

// Support both standard Node.js process.env and Vite frontend import.meta.env
const supabaseUrl =
  (typeof process !== 'undefined' && process.env?.SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL);

const supabaseAnonKey =
  (typeof process !== 'undefined' && process.env?.SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY);

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[EquipX Warning]: Supabase URL or Anon Key is missing. Ensure your .env file is populated.'
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
  const serviceRoleKey = process.env?.SUPABASE_SERVICE_ROLE_KEY;
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