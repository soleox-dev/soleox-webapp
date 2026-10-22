/**
 * Splits a golden-capture-<CLIENT>.json download (capture-fixtures.browser.js) into the golden fixtures:
 * tests/engine/fixtures/<CLIENT>/shared.json and deals/<TXN>.json.
 *
 *   npx tsx scripts/golden/split-capture.ts ~/Downloads/golden-capture-TATH.json
 *
 * Expected results are then written by the code at the pre-engine-refactor tag (see tests/engine/README.md).
 */
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npx tsx scripts/golden/split-capture.ts <golden-capture-CLIENT.json>');
  process.exit(1);
}
const capture = JSON.parse(fs.readFileSync(file, 'utf8'));
const report = capture.privacyReport || {};
if (report.fullNamesLeft || report.addressesLeft || report.clientNamesLeft || report.otherEmailsLeft || report.loneFirstOrLastNamesLeft) {
  console.error('The capture reports personal data left in it. Not writing fixtures.');
  process.exit(1);
}
const clientId = String(capture.clientId || '');
if (!/^[A-Z0-9_]+$/.test(clientId)) throw new Error(`Unexpected client id ${clientId}`);
const root = path.join(process.cwd(), 'tests/engine/fixtures', clientId);
fs.mkdirSync(path.join(root, 'deals'), { recursive: true });
const shared = {
  clientId,
  agents: capture.agents,
  lookupAgents: capture.lookupAgents,
  fieldConfigurations: capture.fieldConfigurations,
  schema: { catalog: capture.schema?.catalog || [] },
  entities: capture.entities,
  templates: capture.templates,
  bundles: capture.bundles,
  allocationConfig: capture.allocationConfig,
  teamCapHistory: capture.teamCapHistory,
  ledger: capture.ledger,
};
fs.writeFileSync(path.join(root, 'shared.json'), `${JSON.stringify(shared, null, 2)}\n`);
for (const [id, deal] of Object.entries(capture.deals as Record<string, unknown>)) {
  if (!/^TXN_[A-Za-z0-9_]+$/.test(id)) throw new Error(`Unexpected deal id ${id}`);
  fs.writeFileSync(path.join(root, 'deals', `${id}.json`), `${JSON.stringify(deal, null, 2)}\n`);
}
console.log(`Wrote ${Object.keys(capture.deals).length} ${clientId} deals to ${path.relative(process.cwd(), root)}`);
console.table(report);
