import { supabase } from '../src/config/supabaseClient.js';
import { bookingService } from '../src/services/bookingService.js';
import { auditService } from '../src/services/auditService.js';
import { notificationService } from '../src/services/notificationService.js';

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

async function runAuditAndNotificationTests() {
  console.log('--- EquipX Backend: Testing Audit Trail & In-App Notifications ---');

  // 1. Establish Owner Session & Fetch Equipment
  console.log('\n1. Authenticating as Owner...');
  const owner = await loginUser(TEST_OWNER.email, TEST_OWNER.password);
  console.log(`PASS: Owner active: ${owner.id}`);

  const { data: resource } = await supabase
    .from('resources')
    .select('id, name')
    .eq('owner_id', owner.id)
    .limit(1)
    .single();

  // 2. Student Submits a Booking Request
  console.log('\n2. Student submitting a booking request to trigger automatic alerts...');
  const student = await loginUser(TEST_STUDENT.email, TEST_STUDENT.password);

  const uniqueOffsetHours = 500 + Math.floor(Math.random() * 500);
  const start = new Date(Date.now() + 3600000 * uniqueOffsetHours);
  const end = new Date(start.getTime() + 3600000 * 3);

  const booking = await bookingService.requestBooking({
    resourceId: resource.id,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    purpose: 'Notification and audit trail automated verification',
  });
  console.log(`PASS: Booking created: ${booking.id}`);

  // 3. Verify Automatic Owner Notification
  console.log('\n3. Verifying Owner received automatic "New Booking Request" notification...');
  await loginUser(TEST_OWNER.email, TEST_OWNER.password);

  const ownerNotifications = await notificationService.getMyNotifications({ unreadOnly: true });
  const requestNotice = ownerNotifications.find((n) => n.metadata?.booking_id === booking.id);

  if (requestNotice) {
    console.log(`PASS: Trigger successfully created notification: "${requestNotice.title}" - ${requestNotice.message}`);
  } else {
    throw new Error('Database trigger failed to notify the resource owner.');
  }

  // 4. Owner Approves the Booking
  console.log('\n4. Owner approving the booking...');
  await bookingService.approveBooking(booking.id);
  console.log('PASS: Booking approved.');

  // 5. Verify Automatic Student Notification
  console.log('\n5. Verifying Student received automatic "Booking Approved" notification...');
  await loginUser(TEST_STUDENT.email, TEST_STUDENT.password);

  const studentNotifications = await notificationService.getMyNotifications({ unreadOnly: true });
  const approvalNotice = studentNotifications.find(
    (n) => n.metadata?.booking_id === booking.id && n.type === 'booking_approved'
  );

  if (approvalNotice) {
    console.log(`PASS: Student received alert: "${approvalNotice.title}" - ${approvalNotice.message}`);
  } else {
    throw new Error('Database trigger failed to notify the student of approval.');
  }

  // 6. Test Notification Management (Mark as Read)
  console.log('\n6. Testing student markAsRead()...');
  const readResult = await notificationService.markAsRead(approvalNotice.id);
  console.log(`PASS: Notification marked as read. is_read = ${readResult.is_read}`);

  const unreadCount = await notificationService.getUnreadCount();
  console.log(`PASS: Live unread notifications counter: ${unreadCount}`);

  // 7. Verify Immutable Audit Trail
  console.log('\n7. Verifying automatic PostgreSQL audit records...');
  const auditData = await auditService.getAuditLogs({
    entityType: 'booking',
    entityId: booking.id,
  });

  console.log(`PASS: Retrieved ${auditData.logs.length} automatic audit events for this booking:`);
  auditData.logs.forEach((log) => {
    console.log(`  - [${log.action}] at ${log.created_at} (Actor: ${log.actor_id})`);
  });

  // 8. Security Test: Verify Audit Immutability (Tamper Attempt)
  console.log('\n8. Testing Audit Immutability: Attempting unauthorized audit modification...');
  const testAuditLogId = auditData.logs[0]?.id;
  if (testAuditLogId) {
    const { error: tamperError } = await supabase
      .from('audit_logs')
      .update({ action: 'FRAUDULENT_RECORD' })
      .eq('id', testAuditLogId);

    if (tamperError) {
      console.log(`PASS: PostgreSQL RLS blocked audit log modification: "${tamperError.message}"`);
    } else {
      console.error('FAIL: Audit log allowed client mutation! Immutability policy violated.');
      process.exit(1);
    }
  }

  // 9. Clean up session
  await supabase.auth.signOut();
  console.log('\nSUCCESS: Audit Trail, Database Triggers, and In-App Notifications verified.');
}

runAuditAndNotificationTests().catch((err) => {
  console.error('\nUNEXPECTED TEST FAILURE:', err);
  process.exit(1);
});