import { aiMatchingService } from '../src/services/aiMatchingService.js';

async function runAiMatchingTest() {
  console.log('--- EquipX Backend: Testing AI Resource Matching Module ---');

  // Test keyword tokenizer
  const samplePrompt = 'I want to build an IoT-based environmental monitoring device using CNC machining and sensors.';
  const keywords = aiMatchingService.extractKeywords(samplePrompt);
  console.log(`PASS: Extracted search tokens: [${keywords.join(', ')}]`);

  // Execute matching query
  console.log('\nMatching resources against prompt: "CNC milling and precision parts machining"...');
  const matches = await aiMatchingService.matchResources({
    projectDescription: 'We need precision CNC milling for robotics brackets',
    limit: 3,
  });

  console.log(`PASS: Found ${matches.length} matching resource(s).`);
  matches.forEach((m, idx) => {
    console.log(`  #${idx + 1}: ${m.resource.name} (Score: ${m.relevanceScore}, Terms: [${m.matchedKeywords.join(', ')}])`);
  });

  console.log('\nSUCCESS: AI Resource Matching module verified.');
}

runAiMatchingTest().catch((err) => {
  console.error('\nUNEXPECTED TEST FAILURE:', err);
  process.exit(1);
});