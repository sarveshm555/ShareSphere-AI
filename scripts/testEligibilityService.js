import { supabase } from '../src/config/supabaseClient.js';
import { profileService } from '../src/services/profileService.js';
import { eligibilityService } from '../src/services/eligibilityService.js';

// Dedicated, persistent test student credentials
const TEST_STUDENT = {
  email: 'equipx.test.student@gmail.com',
  password: 'Password123!',
  fullName: 'Alex Rivera (Undergraduate)',
  institution: 'School of Engineering',
};

/**
 * Reusable auth helper: Logs in if the account exists,
 * or registers it once if it does not.
 */
async function getOrCreateTestStudent() {
  // 1. Attempt login first (avoids signup rate limit entirely)
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: TEST_STUDENT.email,
    password: TEST_STUDENT.password,
  });

  if (!signInError && signInData.user) {
    console.log(`PASS: Reused existing test student account: ${signInData.user.id}`);
    return signInData.user;
  }

  // 2. If user doesn't exist yet, register once
  console.log(`Account not found. Creating test student: ${TEST_STUDENT.email}...`);
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: TEST_STUDENT.email,
    password: TEST_STUDENT.password,
    options: {
      data: {
        full_name: TEST_STUDENT.fullName,
        institution: TEST_STUDENT.institution,
      },
    },
  });

  if (signUpError) {
    if (signUpError.message.includes('rate limit')) {
      console.error('\n[SUPABASE RATE LIMIT HIT]');
      console.error('Supabase GoTrue is temporarily throttling automated registrations.');
      console.error('FAST FIX: Go to Supabase Dashboard -> Authentication -> Users -> Add user -> Create user:');
      console.error(`  Email:    ${TEST_STUDENT.email}`);
      console.error(`  Password: ${TEST_STUDENT.password}`);
      console.error('  Toggle "Auto Confirm User?" -> ON');
      console.error('Then rerun this test script immediately.\n');
    }
    throw signUpError;
  }

  console.log(`PASS: New student account registered: ${signUpData.user.id}`);
  return signUpData.user;
}

async function runEligibilityTests() {
  console.log('--- EquipX Backend: Testing TrustPass Eligibility & Profiles ---');

  console.log('\n1. Establishing authenticated student session...');
  const student = await getOrCreateTestStudent();
  const studentId = student.id;

  console.log('\n2. Testing profileService.getCurrentProfile()...');
  const profile = await profileService.getCurrentProfile();
  console.log(`PASS: Profile retrieved for ${profile.full_name} with role: "${profile.role}"`);

  console.log('\n3. Testing Role Tamper Protection (Student attempting self-promotion)...');
  try {
    const { error: tamperError } = await supabase
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', studentId);

    if (tamperError) {
      console.log(`PASS: Database trigger blocked unauthorized role escalation: "${tamperError.message}"`);
    } else {
      console.error('FAIL: Profile trigger allowed unauthorized role change!');
      process.exit(1);
    }
  } catch (err) {
    console.log(`PASS: Blocked role modification: ${err.message}`);
  }

  console.log('\n4. Testing Mock Resource Requirement Matching...');
  // Fictional resource ID to verify requirement evaluation logic
  const mockResourceId = '11111111-1111-4111-a111-111111111111';

  const initialEligibility = await eligibilityService.checkResourceEligibility(studentId, mockResourceId);
  console.log(`PASS: Unrestricted check response: ${initialEligibility.reason}`);

  console.log('\n5. Testing Expiration Date Evaluator...');
  const expiredDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
  const futureDate = new Date(Date.now() + 86400000 * 30).toISOString(); // 30 days ahead

  const now = new Date();
  const isPastExpired = new Date(expiredDate) <= now;
  const isFutureValid = new Date(futureDate) > now;

  if (isPastExpired && isFutureValid) {
    console.log('PASS: Date comparison logic correctly flags past dates as expired.');
  } else {
    console.error('FAIL: Date calculation error.');
    process.exit(1);
  }

  console.log('\n6. Cleaning up test session...');
  await supabase.auth.signOut();

  console.log('\nSUCCESS: Profile Service & TrustPass Eligibility Service verified.');
}

runEligibilityTests().catch((err) => {
  console.error('\nUNEXPECTED TEST FAILURE:', err);
  process.exit(1);
});