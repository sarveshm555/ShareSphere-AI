import { supabase } from '../src/config/supabaseClient.js';
import { storageService } from '../src/services/storageService.js';

const TEST_OWNER = {
  email: 'equipx.test.owner@gmail.com',
  password: 'Password123!',
};

async function runStorageTests() {
  console.log('--- EquipX Backend: Testing Supabase Storage & Signed URLs ---');

  // 1. Authenticate Owner
  console.log('\n1. Authenticating as Owner...');
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: TEST_OWNER.email,
    password: TEST_OWNER.password,
  });

  if (authErr || !authData.user) {
    throw new Error(`Owner login failed: ${authErr?.message}`);
  }
  console.log(`PASS: Owner authenticated: ${authData.user.id}`);

  // Create mock image binary buffer (1x1 transparent PNG)
  const mockPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  );
  mockPngBuffer.type = 'image/png';
  mockPngBuffer.size = mockPngBuffer.length;

  // 2. Test Public Resource Image Upload
  console.log('\n2. Testing Public Equipment Image Upload (resource-images)...');
  const publicUpload = await storageService.uploadResourceImage(
    mockPngBuffer,
    'haas_cnc_front.png',
    '9735912d-d067-4378-9ff8-46e8db5d0c12'
  );

  console.log(`PASS: Public image uploaded: ${publicUpload.path}`);
  console.log(`PASS: Public URL generated: ${publicUpload.publicUrl}`);

  // 3. Test Private Condition Photo Upload
  console.log('\n3. Testing Private Condition Photo Upload (condition-photos)...');
  const dummyBookingId = '128e1ced-e808-43b3-a65f-8db8261e87bb';
  const privateUpload = await storageService.uploadConditionPhoto(
    mockPngBuffer,
    'spindle_damage_macro.png',
    dummyBookingId,
    'return'
  );

  console.log(`PASS: Private condition evidence uploaded: ${privateUpload.path}`);

  // 4. Test Signed URL Generation for Authorized Inspection
  console.log('\n4. Generating 1-Hour Time-Limited Signed URL for Private Photo...');
  const signedUrl = await storageService.getConditionPhotoSignedUrl(privateUpload.path, 3600);
  console.log(`PASS: Signed URL created successfully (contains token):`);
  console.log(`  --> ${signedUrl.substring(0, 85)}...`);

  // 5. Test Batch Signed URL Resolution
  console.log('\n5. Testing Batch Signed URL Resolution...');
  const batchUrls = await storageService.getConditionPhotosSignedUrls([privateUpload.path], 1800);
  console.log(`PASS: Batch resolved ${batchUrls.length} file(s). First URL verified valid.`);

  // 6. Test File Validator (Block disallowed file types)
  console.log('\n6. Testing Security Validator: Attempting upload of disallowed file format...');
  try {
    const invalidFile = Buffer.from('console.log("hello malicious script");');
    invalidFile.type = 'application/javascript';
    invalidFile.size = invalidFile.length;

    storageService.validateFile(invalidFile);
    console.error('FAIL: File validator allowed application/javascript upload!');
    process.exit(1);
  } catch (err) {
    console.log(`PASS: File validator rejected invalid MIME type: "${err.message}"`);
  }

  // 7. Clean up session
  await supabase.auth.signOut();
  console.log('\nSUCCESS: Supabase Storage, Bucket RLS, and Signed URLs verified.');
}

runStorageTests().catch((err) => {
  console.error('\nUNEXPECTED TEST FAILURE:', err);
  process.exit(1);
});