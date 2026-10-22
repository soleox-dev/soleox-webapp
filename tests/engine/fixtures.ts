import fs from 'node:fs';
import path from 'node:path';

/**
 * Golden fixtures are the app's own API responses for a deal, masked (scripts/golden/capture-fixtures.browser.js).
 * Shared per client: agents, entities, schema, templates, caps. Per deal: the deal row, its commission lines,
 * template submissions, stored team cap and allocation rows, and the ledger rows its formulas can read.
 */
export type ApiRow = Record<string, any>;

export type ClientFixture = {
  clientId: string;
  agents: ApiRow[];
  lookupAgents: ApiRow[];
  fieldConfigurations: ApiRow[];
  schema: { catalog: ApiRow[] };
  entities: ApiRow[];
  templates: ApiRow[];
  bundles: Record<string, { parameters: ApiRow[]; steps: ApiRow[] }>;
  allocationConfig: { teamCaps: ApiRow[]; agentCaps: ApiRow[]; salesVolume: ApiRow | null };
  teamCapHistory: { agentId: string; amount: number; periodStart: string | null; teamCapId: string | null; transactionId?: string | null }[];
  /** Ledger rows any of the client's fixture deals can read; used when a deal has no ledger of its own. */
  ledger?: LedgerTuple[];
};

/** [final_amount, agent_id, payee_entity_id, section, transaction_id, closing_date, transaction_status] */
export type LedgerTuple = [unknown, unknown, unknown, unknown, unknown, unknown, unknown];

export type DealFixture = {
  deal: ApiRow;
  items: ApiRow[];
  submissions: ApiRow[];
  teamCapRows: ApiRow[];
  allocationRows: ApiRow[];
  /** The rows this deal's SUMIFS can read. Without it the client's shared ledger is used. */
  ledger?: LedgerTuple[];
};

export const FIXTURE_ROOT = path.join(__dirname, 'fixtures');
export const EXPECTED_ROOT = path.join(__dirname, 'expected');

export function fixtureClients(): string[] {
  if (!fs.existsSync(FIXTURE_ROOT)) return [];
  return fs.readdirSync(FIXTURE_ROOT).filter((name) => fs.existsSync(path.join(FIXTURE_ROOT, name, 'shared.json'))).sort();
}

export function loadClient(clientId: string): ClientFixture {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, clientId, 'shared.json'), 'utf8'));
}

export function dealIds(clientId: string): string[] {
  const dir = path.join(FIXTURE_ROOT, clientId, 'deals');
  return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5)).sort();
}

export function loadDeal(clientId: string, dealId: string): DealFixture {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, clientId, 'deals', `${dealId}.json`), 'utf8'));
}

export function expectedPath(clientId: string, dealId: string): string {
  return path.join(EXPECTED_ROOT, clientId, `${dealId}.json`);
}
