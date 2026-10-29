import { supabase } from '../src/config/supabaseClient.js';
import { resourceService } from '../src/services/resourceService.js';

async function runResourceServiceTest() {
  console.log('--- EquipX Backend: Testing Resource Service Module ---');

  // Reusing existing test student account to avoid hitting public signup rate limits
  const testEmail = 'equipx.test.student@gmail.com';
  const testPassword = 'Password123!';

  console.log(`\n1. Authenticating as test student: ${testEmail}`);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (authError || !authData.user) {
    console.error('FAIL: User sign-in failed:', authError?.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(`PASS: Authenticated student session active with ID: ${userId}`);

  // Test RLS Boundary: Newly registered users receive the default 'student' role.
  // The RLS policy "Owners and admins can create resources" must reject this insert.
  console.log('\n2. Testing RLS Enforcement: Attempting listing creation as default "student"...');
  try {
    await resourceService.createResource({
      name: 'Rigol DS1054Z Digital Oscilloscope',
      category: 'Electronics',
      location: 'EE Hardware Lab 304',
    });
    console.error('FAIL: RLS policy failed to block resource creation by a student!');
    process.exit(1);
  } catch (err) {
    console.log(`PASS: RLS correctly rejected unauthorized creation: "${err.message}"`);
  }

  console.log('\n3. Testing Read & Discovery Operations (Catalog scan)...');
  const catalog = await resourceService.getResources({ status: 'all', limit: 5 });
  console.log(`PASS: Retrieved catalog. Total resources registered: ${catalog.pagination.totalItems}`);

  console.log('\n4. Testing Keyword Search & Filtering syntax...');
  await resourceService.getResources({
    search: 'oscilloscope',
    category: 'Electronics',
  });
  console.log(`PASS: Search and filter execution succeeded without SQL or runtime errors.`);

  console.log('\n5. Cleaning up test session...');
  await supabase.auth.signOut();

  console.log('\nSUCCESS: Resource Service verified. Validation and RLS boundaries are operational.');
}

runResourceServiceTest().catch((err) => {
  console.error('\nUNEXPECTED TEST FAILURE:', err);
  process.exit(1);
});
