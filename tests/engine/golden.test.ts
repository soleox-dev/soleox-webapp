import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dealIds, expectedPath, fixtureClients, loadClient, loadDeal } from './fixtures';
import { runGoldenScenarios } from './callers';

/**
 * Every fixture deal runs through the deal page, the template popup and the out-of-date payments checks, and
 * the numbers must match the expected file written by the code at the pre-engine-refactor tag.
 * UPDATE_GOLDEN=1 rewrites the expected files; only do that on the tagged code.
 */
const update = process.env.UPDATE_GOLDEN === '1';

for (const clientId of fixtureClients()) {
  describe(`golden ${clientId}`, () => {
    const client = loadClient(clientId);
    for (const dealId of dealIds(clientId)) {
      it(dealId, () => {
        const actual = JSON.parse(JSON.stringify(runGoldenScenarios(client, loadDeal(clientId, dealId), dealId)));
        const file = expectedPath(clientId, dealId);
        if (update) {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`);
          return;
        }
        expect(fs.existsSync(file), `missing ${file}; generate it on the pre-engine-refactor tag`).toBe(true);
        expect(actual).toEqual(JSON.parse(fs.readFileSync(file, 'utf8')));
      });
    }
  });
}
