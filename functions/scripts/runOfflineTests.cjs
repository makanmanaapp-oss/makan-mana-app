// Run every compiled domain suite that does not require an emulator.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const integration = process.argv.includes('--emulator');
if (integration && !/^(127\.0\.0\.1|localhost):[0-9]+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')) {
  throw new Error('Local Firestore emulator required');
}
function collect(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'rules-emulator' || (!integration && entry.name === 'emulator')) return [];
      return collect(file);
    }
    return entry.name.endsWith('.test.ts') ? [file] : [];
  });
}
// Select current source tests so deleted test files left in a local output
// directory cannot run against a later checkout.
const files = collect('src/domain').filter((file) =>
  !integration || file.split(path.sep).includes('emulator')).sort().map((file) =>
  path.join('lib-test', path.relative('src', file)).replace(/\.ts$/, '.js'));
if (!files.length) throw new Error('No compiled offline tests found');
const options = integration ? ['--test-concurrency=1'] : [];
const result = spawnSync(process.execPath, ['--test', ...options, ...files], {stdio: 'inherit'});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
