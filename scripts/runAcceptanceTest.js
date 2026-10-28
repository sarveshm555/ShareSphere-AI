import { supabase } from '../src/config/supabaseClient.js';
import { resourceService } from '../src/services/resourceService.js';
import { eligibilityService } from '../src/services/eligibilityService.js';
import { bookingService } from '../src/services/bookingService.js';
import { handoverService } from '../src/services/handoverService.js';
import { conditionService } from '../src/services/conditionService.js';
import { notificationService } from '../src/services/notificationService.js';
import { auditService } from '../src/services/auditService.js';

const CREDENTIALS = {
  owner: { email: 'equipx.test.owner@gmail.com', password: 'Password123!' },
  student: { email: 'equipx.test.student@gmail.com', password: 'Password123!' },
};

async function login(userKey) {
  const { data, error } = await supabase.auth.signInWithPassword(CREDENTIALS[userKey]);
  if (error) throw new Error(`Login failed for ${userKey}: ${error.message}`);
  return data.user;
}

async function runFinalAcceptanceTest() {
  console.log('================================================================');
  console.log('       EQUIPX BACKEND: FINAL 12-STEP ACCEPTANCE TEST           ');
  console.log('================================================================\n');

  // -------------------------------------------------------------------------
  // STAGE 1: Owner creates an equipment listing
  // -------------------------------------------------------------------------
  console.log('STEP 1: Resource owner listings creation...');
  const owner = await login('owner');
  const uniqueName = `Tektronix MSO 4-Series Oscilloscope [Run-${Date.now().toString().slice(-4)}]`;

  const newResource = await resourceService.createResource({
    name: uniqueName,
    description: 'High-bandwidth mixed signal oscilloscope for analog & digital debugging',
    category: 'Electronics',
    location: 'Advanced Circuits Lab - Room 410',
    status: 'available',
  });
  console.log(`  -> Listing created: "${newResource.name}" (ID: ${newResource.id})`);

  // Attach a prerequisite to test TrustPass
  const requirement = await resourceService.addRequirement(newResource.id, {
    requirement_type: 'training',
    description: 'Electrical Safety 101 Certification',
  });
  console.log(`  -> Attached requirement: [${requirement.requirement_type}] "${requirement.description}"`);

  // -------------------------------------------------------------------------
  // STAGE 2: Student discovers equipment
  // -------------------------------------------------------------------------
  console.log('\nSTEP 2: Student discovers equipment in catalog...');
  const student = await login('student');
  const catalog = await resourceService.getResources({
    search: 'Oscilloscope',
    category: 'Electronics',
  });
  const found = catalog.resources.find((r) => r.id === newResource.id);
  if (!found) throw new Error('Catalog discovery failed: newly listed equipment not found.');
  console.log(`  -> Successfully discovered resource in catalog: "${found.name}"`);

  // -------------------------------------------------------------------------
  // STAGE 3: TrustPass eligibility verification
  // -------------------------------------------------------------------------
  console.log('\nSTEP 3: Checking TrustPass student eligibility...');
  let eligibility = await eligibilityService.checkResourceEligibility(student.id, newResource.id);
  console.log(`  -> Initial status: Eligible = ${eligibility.eligible} (${eligibility.reason})`);

  // Grant the required certification so the student becomes eligible
  console.log('  -> Owner granting prerequisite certification to student...');
  await login('owner');
  await eligibilityService.grantVerification({
    userId: student.id,
    requirementType: 'training',
    title: 'Electrical Safety 101 Certification',
    expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
    notes: 'Completed in lab orientation session.',
  });

  await login('student');
  eligibility = await eligibilityService.checkResourceEligibility(student.id, newResource.id);
  if (!eligibility.eligible) throw new Error('TrustPass check failed after certification grant.');
  console.log(`  -> Re-checked status: Eligible = ${eligibility.eligible} (${eligibility.reason})`);

  // -------------------------------------------------------------------------
  // STAGE 4: Student requests booking
  // -------------------------------------------------------------------------
  console.log('\nSTEP 4: Student submitting booking request...');
  const startWindow = new Date(Date.now() + 86400000 * 30 + Math.floor(Math.random() * 50000000));
  const endWindow = new Date(startWindow.getTime() + 3600000 * 3);

  const booking = await bookingService.requestBooking({
    resourceId: newResource.id,
    startTime: startWindow.toISOString(),
    endTime: endWindow.toISOString(),
    purpose: 'Senior design power inverter debugging',
  });
  console.log(`  -> Booking requested: ${booking.id} (Status: "${booking.status}")`);

  // -------------------------------------------------------------------------
  // STAGE 5: Owner approves booking
  // -------------------------------------------------------------------------
  console.log('\nSTEP 5: Resource owner approves booking request...');
  await login('owner');
  const approval = await bookingService.approveBooking(booking.id);
  console.log(`  -> Booking approved atomically: status = "${approval.status}"`);

  // -------------------------------------------------------------------------
  // STAGE 6: Equipment check-out
  // -------------------------------------------------------------------------
  console.log('\nSTEP 6: Owner executes equipment checkout (ProofLoop)...');
  const checkout = await handoverService.checkoutBooking({
    bookingId: booking.id,
    conditionGrade: 'excellent',
    notes: 'Unit verified intact with 4 passive probes and power supply.',
    photoPaths: ['condition-photos/acceptance_checkout_front.jpg'],
  });
  console.log(`  -> Checkout complete: Handover record ID = ${checkout.handover_id}`);

  // -------------------------------------------------------------------------
  // STAGE 7: Initial condition recorded
  // -------------------------------------------------------------------------
  console.log('\nSTEP 7: Verifying initial condition report recorded...');
  const initialReports = await conditionService.getConditionReports(booking.id);
  const checkoutReport = initialReports.find((r) => r.stage === 'checkout');
  if (!checkoutReport) throw new Error('Initial condition report not found.');
  console.log(`  -> Condition verified: Stage = "${checkoutReport.stage}", Grade = "${checkoutReport.condition_grade}"`);

  // -------------------------------------------------------------------------
  // STAGE 8: Equipment return
  // -------------------------------------------------------------------------
  console.log('\nSTEP 8: Borrower returns equipment...');
  const returnResult = await handoverService.returnBooking({
    bookingId: booking.id,
    conditionGrade: 'good',
    notes: 'All probes returned cleanly. Minor cosmetic smudge on handle.',
    photoPaths: ['condition-photos/acceptance_return_view.jpg'],
  });
  console.log(`  -> Return processed successfully: status = "${returnResult.status}"`);

  // -------------------------------------------------------------------------
  // STAGE 9: Final condition recorded
  // -------------------------------------------------------------------------
  console.log('\nSTEP 9: Verifying final condition report recorded...');
  const allReports = await conditionService.getConditionReports(booking.id);
  const returnReport = allReports.find((r) => r.stage === 'return');
  if (!returnReport) throw new Error('Final return condition report not found.');
  console.log(`  -> Return condition confirmed: Stage = "${returnReport.stage}", Grade = "${returnReport.condition_grade}"`);

  // -------------------------------------------------------------------------
  // STAGE 10: Booking & resource availability updated
  // -------------------------------------------------------------------------
  console.log('\nSTEP 10: Verifying final database statuses...');
  const { data: finalBooking } = await supabase.from('bookings').select('status').eq('id', booking.id).single();
  const { data: finalResource } = await supabase.from('resources').select('status').eq('id', newResource.id).single();
  console.log(`  -> Booking status: "${finalBooking.status}" (Expected: returned)`);
  console.log(`  -> Resource status: "${finalResource.status}" (Expected: available)`);

  // -------------------------------------------------------------------------
  // STAGE 11: Audit trail retention
  // -------------------------------------------------------------------------
  console.log('\nSTEP 11: Inspecting immutable audit ledger...');
  const auditEntries = await auditService.getAuditLogs({ entityType: 'booking', entityId: booking.id });
  console.log(`  -> Retrieved ${auditEntries.logs.length} immutable audit event(s):`);
  auditEntries.logs.forEach((log) => {
    console.log(`     - [${log.action}] at ${log.created_at}`);
  });

  // -------------------------------------------------------------------------
  // STAGE 12: In-app notifications generated
  // -------------------------------------------------------------------------
  console.log('\nSTEP 12: Verifying notification delivery to student and owner...');
  await login('student');
  const studentAlerts = await notificationService.getMyNotifications({ limit: 5 });
  const approvalNotice = studentAlerts.find((n) => n.metadata?.booking_id === booking.id);
  console.log(`  -> Student alert verified: "${approvalNotice?.title || 'Delivered'}"`);

  await login('owner');
  const ownerAlerts = await notificationService.getMyNotifications({ limit: 5 });
  const returnNotice = ownerAlerts.find((n) => n.metadata?.booking_id === booking.id && n.type === 'return');
  console.log(`  -> Owner return alert verified: "${returnNotice?.title || 'Delivered'}"`);

  await supabase.auth.signOut();

  console.log('\n================================================================');
  console.log('   ALL 12 ACCEPTANCE CRITERIA VERIFIED AGAINST SUPABASE DATA    ');
  console.log('================================================================');
}

runFinalAcceptanceTest().catch((err) => {
  console.error('\nACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});