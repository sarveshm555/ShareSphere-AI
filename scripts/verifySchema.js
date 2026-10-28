import { supabase } from '../src/config/supabaseClient.js';

async function verifySchema() {
  console.log('--- EquipX Backend: Verifying Core Tables & RLS ---');

  const tablesToCheck = ['profiles', 'resources', 'resource_requirements'];
  let allHealthy = true;

  for (const table of tablesToCheck) {
    // Attempt a zero-record query to check table existence and API visibility
    const { data, error } = await supabase.from(table).select('*').limit(0);

    if (error) {
      console.error(`FAIL: Table [${table}] check failed: ${error.message} (Code: ${error.code})`);
      allHealthy = false;
    } else {
      console.log(`PASS: Table [${table}] exists and is queryable.`);
    }
  }

  if (allHealthy) {
    console.log('\nSUCCESS: Core tables exist and are connected to Supabase PostgREST API.');
  } else {
    console.error('\nERROR: Some tables are missing. Verify you applied the SQL script in Supabase.');
    process.exit(1);
  }
}

verifySchema();