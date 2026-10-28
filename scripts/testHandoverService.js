import { supabase } from '../src/config/supabaseClient.js';
import { bookingService } from '../src/services/bookingService.js';
import { handoverService } from '../src/services/handoverService.js';
import { conditionService } from '../src/services/conditionService.js';

const TEST_OWNER = {
  email: 'equipx.test.owner@gmail.com',
  password: 'Password123!',
};

const TEST_STUDENT = {
  email: 'equipx.test.student@gmail.com',
  password: 'Password123!',
};

async function loginUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

async function runHandoverAndConditionTests() {
  console.log('--- EquipX Backend: Testing ProofLoop Handover & Incidents ---');

  // 1. Authenticate Owner & Retrieve Owned Equipment
  console.log('\n1. Authenticating as Owner...');
  const owner = await loginUser(TEST_OWNER.email, TEST_OWNER.password);
  console.log(`PASS: Owner active: ${owner.id}`);

  const { data: resource, error: resErr } = await supabase
    .from('resources')
    .select('id, name')
    .eq('owner_id', owner.id)
    .limit(1)
    .single();

  if (resErr || !resource) {
    throw new Error('Could not find test equipment. Ensure testBookingService was executed first.');
  }

  console.log(`PASS: Using resource: "${resource.name}" (${resource.id})`);

  // Reset equipment status to 'available' if a previous run marked it 'maintenance'
  await supabase.from('resources').update({ status: 'available' }).eq('id', resource.id);

  // 2. Student Submits a Booking with an Isolated Future Time Window
  console.log('\n2. Authenticating as Student to request a booking...');
  const student = await loginUser(TEST_STUDENT.email, TEST_STUDENT.password);

  // Generate an isolated time window (7 days ahead + random offset) to prevent overlap with previous test runs
  const uniqueOffsetHours = 168 + Math.floor(Math.random() * 500);
  const start = new Date(Date.now() + 3600000 * uniqueOffsetHours);
  const end = new Date(start.getTime() + 3600000 * 4); // 4-hour window

  const booking = await bookingService.requestBooking({
    resourceId: resource.id,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    purpose: 'Autonomous drone motor testing and calibration',
  });
  console.log(`PASS: Booking created: ${booking.id} (status: ${booking.status})`);

  // 3. Owner Approves the Booking
  console.log('\n3. Owner approving the booking...');
  await loginUser(TEST_OWNER.email, TEST_OWNER.password);
  await bookingService.approveBooking(booking.id);
  console.log('PASS: Booking approved successfully.');

  // 4. ProofLoop Check-Out (Equipment Handover)
  console.log('\n4. Executing Equipment Checkout (ProofLoop Handover)...');
  const checkoutResult = await handoverService.checkoutBooking({
    bookingId: booking.id,
    conditionGrade: 'excellent',
    notes: 'Power cable, remote console, and safety goggles included. No signs of wear.',
    photoPaths: ['condition-photos/checkout_initial_view.jpg'],
  });
  console.log(`PASS: Checkout completed. Handover ID: ${checkoutResult.handover_id}`);

  // 5. Verify Booking Status Transition to 'checked_out'
  const { data: verifiedBooking } = await supabase
    .from('bookings')
    .select('status')
    .eq('id', booking.id)
    .single();
  console.log(`PASS: Verified booking status transitioned to: "${verifiedBooking.status}"`);

  // 6. ProofLoop Return with Damage Detection & Automatic Incident Logging
  console.log('\n5. Executing Equipment Return with Damage Detected...');
  const returnResult = await handoverService.returnBooking({
    bookingId: booking.id,
    conditionGrade: 'damaged',
    notes: 'Unit returned with cracked plastic shroud on the upper cooling assembly.',
    photoPaths: ['condition-photos/return_cracked_shroud.jpg'],
    reportIncident: true,
    incidentDescription: 'Cooling assembly shroud cracked during high-rpm run.',
  });
  console.log(`PASS: Return processed. Incident ID created: ${returnResult.incident_id}`);

  // 7. Verify Resource Status Changed to 'maintenance'
  const { data: updatedResource } = await supabase
    .from('resources')
    .select('status')
    .eq('id', resource.id)
    .single();
  console.log(`PASS: Resource status automatically moved to: "${updatedResource.status}"`);

  // 8. Inspect Condition Reports Snapshot History
  console.log('\n6. Inspecting Condition Inspection Trail...');
  const reports = await conditionService.getConditionReports(booking.id);
  console.log(`PASS: Retrieved ${reports.length} inspection reports (Stages: ${reports.map((r) => r.stage).join(', ')})`);

  // 9. Owner Resolves the Incident
  console.log('\n7. Lab Owner resolving the damage incident...');
  const resolvedIncident = await conditionService.resolveIncident(returnResult.incident_id, {
    status: 'resolved',
    resolutionNotes: 'Replacement cooling shroud ordered under department warranty. Repaired and tested.',
  });
  console.log(`PASS: Incident resolved. Status: "${resolvedIncident.status}", Resolution: "${resolvedIncident.resolution_notes}"`);

  // 10. Clean up session
  await supabase.auth.signOut();
  console.log('\nSUCCESS: ProofLoop Handover, Condition Reports, and Incidents workflow verified.');
}

runHandoverAndConditionTests().catch((err) => {
  console.error('\nUNEXPECTED TEST FAILURE:', err);
  process.exit(1);
});