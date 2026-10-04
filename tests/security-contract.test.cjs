const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const page = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
test('student scan flow uses the authenticated backend and requires consent', () => {
  assert.doesNotMatch(page, /ART_SCANNER_API_KEY_V2/);
  const scan = page.slice(page.indexOf('async function lockCompositionAndScan'), page.indexOf('function robustJsonParse'));
  assert.match(scan, /action:\s*'analyzeArtwork'/);
  assert.match(page, /imageConsent/);
  assert.doesNotMatch(scan, /state\.apiKey|callStrictGeminiVisionAPI/);
});
test('cloud archive requires a teacher-reviewed, non-demo result', () => {
  assert.match(page, /teacherReviewed/);
  assert.match(page, /isDemo:\s*false/);
  assert.match(page, /classroomToken/);
});
test('server keeps the Drive folder private and provides the requested initial admin password', () => {
  const code = fs.readFileSync(require('node:path').join(__dirname, '..', 'Code.gs'), 'utf8');
  assert.doesNotMatch(code, /DEFAULT_FOLDER_ID_/);
  assert.match(code, /getProperty\('FOLDER_ID'\)/);
  assert.match(code, /DEFAULT_ADMIN_PASSWORD_ = 'admin888'/);
});
