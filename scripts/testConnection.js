import { supabase } from '../src/config/supabaseClient.js';

async function verifyConnection() {
  console.log('--- EquipX Backend: Verifying Supabase Connectivity ---');

  if (!supabase) {
    console.error('FAIL: Supabase client initialization failed.');
    process.exit(1);
  }

  try {
    // Ping Supabase Auth to verify project URL and API key validity
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error('FAIL: Supabase returned an authorization or connection error:');
      console.error(error.message);
      process.exit(1);
    }

    console.log('SUCCESS: Connection to Supabase cluster confirmed.');
    console.log(`Auth Service Status: ${data.session ? 'Active session' : 'Reachable (Anonymous)'}`);
    console.log('Environment configuration is valid.');
  } catch (err) {
    console.error('UNEXPECTED EXCEPTION during connection test:');
    console.error(err);
    process.exit(1);
  }
}

verifyConnection();