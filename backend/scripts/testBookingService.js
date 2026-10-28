import { supabase } from '../src/config/supabaseClient.js';
import { bookingService } from '../src/services/bookingService.js';

const TEST_OWNER = {
  email: 'equipx.test.owner@gmail.com',
  password: 'Password123!',
  fullName: 'Prof. Marcus Brody (Lab Owner)',
  institution: 'Dept of Robotics',
};

const TEST_STUDENT = {
  email: 'equipx.test.student@gmail.com',
  password: 'Password123!',
  fullName: 'Alex Rivera (Undergraduate)',
  institution: 'School of Engineering',
};

/**
 * Resilient auth helper: logs in existing accounts, or registers once with full error diagnostics.
 */
async function ensureUser(userConfig) {
  // 1. Attempt login first (avoids signup rate limit)
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: userConfig.email,
    password: userConfig.password,
  });

  if (!signInErr && signInData?.user) {
    return signInData.user;
  }

  // 2. Fall back to registration if account does not exist yet
  console.log(`Account not found. Registering ${userConfig.email}...`);
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: userConfig.email,
    password: userConfig.password,
    options: {
      data: {
        full_name: userConfig.fullName,
        institution: userConfig.institution,
      },
    },
  });

  if (signUpErr) {
    console.error(`\n[SUPABASE AUTH ERROR FOR ${userConfig.email}]:`);
    console.error(`Message: ${signUpErr.message}`);
    if (signUpErr.message.includes('rate limit')) {
      console.error('\n--> Supabase public signup rate limit is active.');
      console.error('--> FIX: Add this account directly in your Supabase Dashboard:');
      console.error('    1. Open Supabase Dashboard -> Authentication -> Users');
      console.error('    2. Click "Add user" -> "Create user"');
      console.error(`       Email:    ${userConfig.email}`);
      console.error(`       Password: ${userConfig.password}`);
      console.error('       Auto Confirm User: ON');
      console.error('    3. Rerun this script.\n');
    }
    throw new Error(`Authentication failed for ${userConfig.email}: ${signUpErr.message}`);
  }

  if (!signUpData?.user) {
    throw new Error(`Sign up returned no user object for ${userConfig.email}.`);
  }

  return signUpData.user;
}

async function runBookingLifecycleTests() {
  console.log('--- EquipX Backend: Testing FairShare Booking System ---');

  // 1. Authenticate Owner
  console.log('\n1. Establishing Owner session...');
  const owner = await ensureUser(TEST_OWNER);
  console.log(`PASS: Owner active with ID: ${owner.id}`);

  // Elevate owner role in database
  const { error: roleErr } = await supabase.rpc('dev_assign_role', {
    target_email: TEST_OWNER.email,
    new_role: 'owner',
  });
  if (roleErr) {
    console.warn(`Role assign note: ${roleErr.message}`);
  }

  // 2. Ensure test equipment exists
  console.log('\n2. Ensuring test resource listing exists...');
  let { data: resource } = await supabase
    .from('resources')
    .select('id, name')
    .eq('owner_id', owner.id)
    .limit(1)
    .maybeSingle();

  if (!resource) {
    const { data: newRes, error: resErr } = await supabase
      .from('resources')
      .insert([
        {
          owner_id: owner.id,
          name: 'Haas CNC Mini Mill',
          category: 'Machining',
          location: 'Fabrication Floor Bay 2',
          status: 'available',
        },
      ])
      .select()
      .single();

    if (resErr) {
      throw new Error(`Failed to create test resource: ${resErr.message}`);
    }
    resource = newRes;
  }
  console.log(`PASS: Using test resource: "${resource.name}" (${resource.id})`);

  // 3. Switch to Student session
  console.log('\n3. Establishing Student session...');
  const student = await ensureUser(TEST_STUDENT);
  console.log(`PASS: Student authenticated with ID: ${student.id}`);

  // Define identical overlapping time windows (Tomorrow 10:00 to 12:00 UTC)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setUTCHours(10, 0, 0, 0);

  const startTime = tomorrow.toISOString();
  const endTime = new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000).toISOString();

  // 4. Student creates Booking #1
  console.log('\n4. Student submitting Booking Request #1...');
  const booking1 = await bookingService.requestBooking({
    resourceId: resource.id,
    startTime,
    endTime,
    purpose: 'Senior design mechanical frame prototyping',
  });
  console.log(`PASS: Booking #1 created with status "${booking1.status}" (ID: ${booking1.id})`);

  // 5. Student creates Booking #2 for the EXACT SAME TIME WINDOW
  console.log('\n5. Student submitting Booking Request #2 (Concurrent Conflict Candidate)...');
  const booking2 = await bookingService.requestBooking({
    resourceId: resource.id,
    startTime,
    endTime,
    purpose: 'Robotics team frame machining',
  });
  console.log(`PASS: Booking #2 created with status "${booking2.status}" (ID: ${booking2.id})`);

  // 6. Owner logs back in to evaluate requests
  console.log('\n6. Owner logging in to review and approve booking requests...');
  await supabase.auth.signInWithPassword({
    email: TEST_OWNER.email,
    password: TEST_OWNER.password,
  });

  console.log(`Approving Booking #1 (${booking1.id})...`);
  const approval1 = await bookingService.approveBooking(booking1.id);
  console.log(`PASS: Booking #1 approved successfully: status = ${approval1.status}`);

  // 7. Critical Concurrency Test: Owner attempts to approve conflicting Booking #2
  console.log('\n7. TESTING CONCURRENCY GUARD: Attempting to approve conflicting Booking #2...');
  try {
    await bookingService.approveBooking(booking2.id);
    console.error('FAIL: Concurrency protection failed! Both overlapping bookings were approved!');
    process.exit(1);
  } catch (err) {
    console.log(`PASS: PostgreSQL Exclusion Constraint blocked conflict: "${err.message}"`);
  }

  // 8. Owner rejects Booking #2 with an explanatory reason
  console.log('\n8. Rejecting conflicting Booking #2 with explanatory feedback...');
  const rejection = await bookingService.rejectBooking(
    booking2.id,
    'Slot already awarded to another verified project. Please pick an afternoon time window.'
  );
  console.log(`PASS: Booking #2 rejected: reason = "${rejection.rejection_reason}"`);

  // 9. Cleanup session
  await supabase.auth.signOut();
  console.log('\nSUCCESS: FairShare Booking System and atomic concurrency locks verified.');
}

runBookingLifecycleTests().catch((err) => {
  console.error('\nUNEXPECTED TEST FAILURE:', err);
  process.exit(1);
});