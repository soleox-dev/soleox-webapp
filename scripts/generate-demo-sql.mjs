import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const csvDir = '/Users/carlosbes/Library/CloudStorage/GoogleDrive-carlos.bes@soleox.org/My Drive/Commissions Tracker/Clients/DEMO/02_PROD/Soleox Commissions Tracker_DEMO/DO NOT TOUCH_CSV_DEMO';
const outputDir = path.join(process.cwd(), 'db/seeds');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function parseCSV(content) {
  const lines = content.split('\n');
  const result = [];
  function parseLine(text) {
    const row = [];
    let inQuotes = false;
    let entry = '';
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (inQuotes && text[i+1] === '"') {
          entry += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        row.push(entry.trim());
        entry = '';
      } else {
        entry += c;
      }
    }
    row.push(entry.trim());
    return row;
  }
  const headers = parseLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    const parsed = parseLine(l);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = parsed[idx] !== undefined ? parsed[idx] : '';
    });
    result.push(obj);
  }
  return result;
}

function parseExcelDate(val) {
  if (!val || val === '' || isNaN(Number(val))) return null;
  const num = Number(val);
  if (num <= 0) return null;
  const ms = Math.round((num - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function parseExcelDateTime(val) {
  if (!val || val === '' || isNaN(Number(val))) return null;
  const num = Number(val);
  if (num <= 0) return null;
  const ms = Math.round((num - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function sqlEscape(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isNaN(val) ? 'NULL' : String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

function parseAgentName(raw) {
  if (!raw) return { first: '', last: '', full: '' };
  const trimmed = raw.trim();
  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',').map(s => s.trim());
    return { first: first || '', last: last || '', full: `${first} ${last}`.trim() };
  }
  const parts = trimmed.split(/\s+/);
  return {
    first: parts[0] || '',
    last: parts.slice(1).join(' ') || '',
    full: trimmed,
  };
}

function hashId(prefix, str) {
  const hex = crypto.createHash('md5').update(str).digest('hex').slice(0, 12).toUpperCase();
  return `${prefix}_${hex}`;
}

// 1. Read CSV files
const agentsCsv = parseCSV(fs.readFileSync(path.join(csvDir, 'Agents.csv'), 'utf-8'));
const entitiesCsv = parseCSV(fs.readFileSync(path.join(csvDir, 'Commission Entities.csv'), 'utf-8'));
const txCsv = parseCSV(fs.readFileSync(path.join(csvDir, 'Transactions.csv'), 'utf-8'));
const commCsv = parseCSV(fs.readFileSync(path.join(csvDir, 'Commissions.csv'), 'utf-8'));
const payCsv = parseCSV(fs.readFileSync(path.join(csvDir, 'Payments.csv'), 'utf-8'));
const rulesCsv = parseCSV(fs.readFileSync(path.join(csvDir, 'Commission Rules.csv'), 'utf-8'));

console.log('Loaded CSV rows:', {
  agents: agentsCsv.length,
  entities: entitiesCsv.length,
  transactions: txCsv.length,
  commissions: commCsv.length,
  payments: payCsv.length,
  rules: rulesCsv.length,
});

// Known existing agents from Supabase (preserving primary keys)
const knownAgentIds = {
  'Brennan Devon': 'AGT_A8C5F636713A',
  'Robert Ito': 'AGT_B45B9A8A0322',
  'Christa Tyler': 'AGT_77ABA1E7C0B7',
  'Sarah Conner': 'AGT_DEMO_01',
};

// Known existing entities from Supabase
const knownEntityIds = {
  'Broker Cap': 'ENT_2C8AEE9D0B8B',
  'Broker Fee': 'ENT_8A1280374861',
  'Broker Review': 'ENT_E2D75EE0A98C',
  'Miscellaneous': 'ENT_8AE838232CC6',
  'Photos': 'ENT_F4184EDD6472',
  'Referral': 'ENT_EDC3FE414E79',
  'Risk Mgmt': 'ENT_561E2978DC23',
  'Staging': 'ENT_528A6E37230F',
  'Stock': 'ENT_2144C1AD6DA3',
  'TC Fee': 'ENT_95D8B41E1346',
  'Assistant Sarah': 'ENT_B76F6B1B27BB',
  'Broker': 'ENT_099423CE38DA',
};

// Map agents to IDs & normalized names
const agentMap = new Map(); // raw or full name -> AGT_ id
const agentInfoMap = new Map(); // full name -> { id, first, last, full }

agentsCsv.forEach(a => {
  const rawName = a.Name;
  if (!rawName) return;
  const parsed = parseAgentName(rawName);
  const id = knownAgentIds[parsed.full] || hashId('AGT', 'DEMO:AGT:' + parsed.full);

  agentMap.set(rawName, id);
  agentMap.set(parsed.full, id);
  agentMap.set(rawName.toLowerCase(), id);
  agentMap.set(parsed.full.toLowerCase(), id);

  agentInfoMap.set(parsed.full, {
    id,
    first: parsed.first,
    last: parsed.last,
    full: parsed.full,
    group: a.Group || null,
    email: a['Email Address'] || null,
    phone: a['Phone Number'] || null,
    status: a['Agent Status'] || 'Active',
    capDate: parseExcelDate(a['Broker Cap Date']),
    capLimit: Number(a['Broker Cap']) || 8000,
    broker250FeeCap: Number(a['Broker 250 Fee Cap']) || 5000,
    riskCapLimit: Number(a['Risk Mgmt Cap']) || 750,
    stockPercent: Number(a['Stock']) || 0,
    isTeamLead: parsed.full === 'Robert Ito',
  });
});

// Map entities to IDs
const entityMap = new Map();
Object.entries(knownEntityIds).forEach(([name, id]) => {
  entityMap.set(name, id);
  entityMap.set(name.toLowerCase(), id);
});

entitiesCsv.forEach(e => {
  const name = e.Name;
  if (!name) return;
  if (!entityMap.has(name)) {
    const id = hashId('ENT', 'DEMO:ENT:' + name);
    entityMap.set(name, id);
    entityMap.set(name.toLowerCase(), id);
  }
});

// Map transactions: TR000006 -> TXN_<12_HEX>
const txIdMap = new Map(); // TR000006 -> TXN_...
txCsv.forEach(tx => {
  const legacyId = tx.ID;
  if (!legacyId) return;
  const newTxId = hashId('TXN', 'DEMO:TXN:' + legacyId);
  txIdMap.set(legacyId, newTxId);
});

console.log('Total mapped agents:', agentInfoMap.size);
console.log('Total mapped entities:', entityMap.size / 2);
console.log('Total mapped transactions:', txIdMap.size);

// ==========================================
// FILE 1: 01_lookups_and_entities.sql
// ==========================================
let sql1 = `-- ====================================================================
-- Soleox DEMO Seed Data: Step 1 - Lookup Values & Commission Entities
-- Nomenclature: CLV_<12_HEX>, ENT_<12_HEX>
-- ====================================================================

-- 1. Insert Client Lookup Values (Groups)
INSERT INTO public.client_lookup_values (id, client_id, category, option_label, option_value, sort_order, is_active, is_default, archived)
VALUES
  ('CLV_893A4F1B0001', 'DEMO', 'GROUP_ID', 'Group A', 'Group A', 3, TRUE, FALSE, FALSE),
  ('CLV_893A4F1B0002', 'DEMO', 'GROUP_ID', 'Group B', 'Group B', 4, TRUE, FALSE, FALSE)
ON CONFLICT (id) DO UPDATE SET
  option_label = EXCLUDED.option_label,
  is_active = TRUE;

-- 2. Insert Commission Entities (all ENT_<12_HEX>)
INSERT INTO public.commission_entities (id, client_id, entity_name, entity_type, is_active, archived, created_by, updated_by)
VALUES
`;

const entityRowsSql = [];
const seenEntityIds = new Set();
entityMap.forEach((id, nameKey) => {
  // Only process standard-case names to avoid duplicate SQL inserts
  if (nameKey !== nameKey.toLowerCase() || nameKey === 'tc fee') {
    if (seenEntityIds.has(id)) return;
    seenEntityIds.add(id);

    let type = 'OTHER';
    if (nameKey.includes('Broker')) type = 'BROKERAGE';
    else if (nameKey.includes('Risk')) type = 'BROKERAGE';
    else if (nameKey.includes('TC')) type = 'TEAM';
    else if (nameKey.includes('Stock')) type = 'EQUITY';
    else if (nameKey.includes('Photo') || nameKey.includes('Staging')) type = 'VENDOR';

    entityRowsSql.push(`  (${sqlEscape(id)}, 'DEMO', ${sqlEscape(nameKey)}, ${sqlEscape(type)}, TRUE, FALSE, 'system_seed', 'system_seed')`);
  }
});

sql1 += entityRowsSql.join(',\n') + `\nON CONFLICT (id) DO UPDATE SET\n  entity_name = EXCLUDED.entity_name,\n  is_active = TRUE,\n  archived = FALSE;\n`;
fs.writeFileSync(path.join(outputDir, '01_lookups_and_entities.sql'), sql1);
console.log('Generated 01_lookups_and_entities.sql');

// ==========================================
// FILE 2: 02_agents.sql
// ==========================================
let sql2 = `-- ====================================================================
-- Soleox DEMO Seed Data: Step 2 - Agents
-- Nomenclature: AGT_<12_HEX>, agent_name = 'First Last'
-- ====================================================================

INSERT INTO public.agents (
  id, client_id, agent_name, agent_email, agent_phone, group_id, agent_status, is_team_lead,
  commission_attributes, custom_attributes, archived, created_by, updated_by
)
VALUES
`;

const agentRowsSql = [];
agentInfoMap.forEach(info => {
  const commAttrs = {
    broker_cap_date: info.capDate,
    broker_cap_limit: info.capLimit,
    broker_cap_paid_ytd: 0,
    broker_250_fee_cap: info.broker250FeeCap,
    risk_cap_limit: info.riskCapLimit,
    risk_paid_ytd: 0,
    stock_percent: info.stockPercent,
  };

  const customAttrs = {
    first_name: info.first,
    last_name: info.last,
  };

  agentRowsSql.push(`  (${sqlEscape(info.id)}, 'DEMO', ${sqlEscape(info.full)}, ${sqlEscape(info.email)}, ${sqlEscape(info.phone)}, ${sqlEscape(info.group)}, ${sqlEscape(info.status)}, ${info.isTeamLead ? 'TRUE' : 'FALSE'}, ${sqlEscape(commAttrs)}, ${sqlEscape(customAttrs)}, FALSE, 'system_seed', 'system_seed')`);
});

sql2 += agentRowsSql.join(',\n') + `\nON CONFLICT (id) DO UPDATE SET\n  agent_name = EXCLUDED.agent_name,\n  agent_email = EXCLUDED.agent_email,\n  agent_phone = EXCLUDED.agent_phone,\n  group_id = EXCLUDED.group_id,\n  agent_status = EXCLUDED.agent_status,\n  commission_attributes = EXCLUDED.commission_attributes,\n  custom_attributes = EXCLUDED.custom_attributes,\n  archived = FALSE;\n`;
fs.writeFileSync(path.join(outputDir, '02_agents.sql'), sql2);
console.log('Generated 02_agents.sql');

// ==========================================
// PRE-GROUP COMMISSIONS BY TRANSACTION
// ==========================================
const commsByTx = new Map();
commCsv.forEach(c => {
  const legacyTxId = c['Transaction ID'];
  if (!legacyTxId) return;
  if (!commsByTx.has(legacyTxId)) commsByTx.set(legacyTxId, []);
  commsByTx.get(legacyTxId).push(c);
});

// ==========================================
// FILE 3: 03_transactions.sql
// ==========================================
const txRowsSql = [];
txCsv.forEach(tx => {
  const legacyId = tx.ID;
  const newTxId = txIdMap.get(legacyId);
  const rawPrimaryAgentName = tx['Primary Agent'];
  const parsedPrimary = parseAgentName(rawPrimaryAgentName);
  const agentId = agentMap.get(parsedPrimary.full) || agentMap.get(rawPrimaryAgentName) || null;

  const listDate = parseExcelDate(tx['List Date']);
  const listPrice = tx['List Price'] ? Number(tx['List Price']) : null;
  const acceptanceDate = parseExcelDate(tx['Acceptance Date']);
  const closingDate = parseExcelDateTime(tx['Closing Date']);
  const salesPrice = tx['Sales Price'] ? Number(tx['Sales Price']) : null;
  const gciPerc = tx['GCI %'] ? Number(tx['GCI %']) : null;
  const gciAmount = tx['GCI'] ? Number(tx['GCI']) : null;
  const txFee = tx['Transaction Fee'] ? Number(tx['Transaction Fee']) : null;
  const totalComm = tx['Total Commission'] ? Number(tx['Total Commission']) : null;
  const createdAt = parseExcelDateTime(tx.Added) || '2026-08-01T00:00:00+00:00';
  const updatedAt = parseExcelDateTime(tx['Last Modified']) || '2026-08-15T00:00:00+00:00';

  const settlementVendors = {
    lending_company: tx['Lending Company'] || null,
    loan_officer: tx['Lending Officer'] || null,
    title_company: tx['Title Company'] || null,
    title_officer: tx['Title Officer'] || null,
  };

  const txComms = commsByTx.get(legacyId) || [];
  
  // 1. Off the top rules
  const offTheTopRules = txComms
    .filter(c => c.Section === 'Referrals')
    .map((c, idx) => ({
      id: `rule_off_${idx + 1}`,
      name: c['Commission Rule'] || 'Referral',
      entity: c.Entity || 'Referral',
      type: c.Type === 'Percent' ? 'PERCENT' : 'AMOUNT',
      value: c.Type === 'Percent' ? Number(c.Percent) : Math.abs(Number(c.Data || c.Amount || 0)),
    }));

  // 2. Agents
  const agentSplits = txComms.filter(c => c.Section === 'Agent Splits');
  const embeddedAgents = [];
  
  if (agentSplits.length > 0) {
    const primaryInSplits = agentSplits.some(s => parseAgentName(s.Agent).full === parsedPrimary.full);
    if (!primaryInSplits && parsedPrimary.full) {
      const pId = agentId || hashId('AGT', 'DEMO:AGT:' + parsedPrimary.full);
      const coAgentTotalPerc = agentSplits.reduce((acc, s) => acc + (Number(s.Percent) || 0), 0);
      const primaryPerc = Math.max(0, 1 - coAgentTotalPerc);
      embeddedAgents.push({
        id: pId,
        name: parsedPrimary.full,
        firstName: parsedPrimary.first,
        lastName: parsedPrimary.last,
        isTeamLead: parsedPrimary.full === 'Robert Ito',
        splitType: 'PERCENT',
        splitVal: Number(primaryPerc.toFixed(4)),
        brokerCapLimit: 8000,
        brokerCapPaidYTD: 0,
        riskCapLimit: 750,
        riskPaidYTD: 0,
      });
    }

    agentSplits.forEach((s, idx) => {
      const parsedS = parseAgentName(s.Agent);
      const sId = agentMap.get(parsedS.full) || hashId('AGT', 'DEMO:AGT:' + parsedS.full);
      embeddedAgents.push({
        id: sId,
        name: parsedS.full,
        firstName: parsedS.first,
        lastName: parsedS.last,
        isTeamLead: parsedS.full === 'Robert Ito',
        splitType: 'PERCENT',
        splitVal: Number(Number(s.Percent || 0).toFixed(4)),
        brokerCapLimit: 8000,
        brokerCapPaidYTD: 0,
        riskCapLimit: 750,
        riskPaidYTD: 0,
      });
    });
  } else if (parsedPrimary.full) {
    const pId = agentId || hashId('AGT', 'DEMO:AGT:' + parsedPrimary.full);
    embeddedAgents.push({
      id: pId,
      name: parsedPrimary.full,
      firstName: parsedPrimary.first,
      lastName: parsedPrimary.last,
      isTeamLead: parsedPrimary.full === 'Robert Ito',
      splitType: 'PERCENT',
      splitVal: 1.0,
      brokerCapLimit: 8000,
      brokerCapPaidYTD: 0,
      riskCapLimit: 750,
      riskPaidYTD: 0,
    });
  }

  // 3. Post-split rules by agent (keyed by normalized First Last)
  const postSplitRulesByAgent = {};
  txComms
    .filter(c => c.Section === 'Post-splits' && c.Agent)
    .forEach((c, idx) => {
      const parsedA = parseAgentName(c.Agent);
      const aName = parsedA.full;
      if (!postSplitRulesByAgent[aName]) postSplitRulesByAgent[aName] = [];
      postSplitRulesByAgent[aName].push({
        id: `rule_post_${idx + 1}`,
        name: c['Commission Rule'] || 'Deduction',
        entity: c.Entity || c['Commission Rule'] || 'Broker',
        type: c.Type === 'Percent' ? 'PERCENT' : 'AMOUNT',
        value: c.Type === 'Percent' ? Number(c.Percent) : Math.abs(Number(c.Data || c.Amount || 0)),
      });
    });

  const customAttrs = {
    sales_memo: tx['Sales Memo'] || null,
    gross_agent_paid_income: tx['Gross Agent(s) Paid Income'] ? Number(tx['Gross Agent(s) Paid Income']) : null,
    gross_agent_paid_income_perc: tx['Gross Agent(s) Paid Income %'] ? Number(tx['Gross Agent(s) Paid Income %']) : null,
    agents: embeddedAgents,
    offTheTopRules,
    postSplitRulesByAgent,
  };

  txRowsSql.push(`  (${sqlEscape(newTxId)}, 'DEMO', ${sqlEscape(legacyId)}, ${sqlEscape(tx.Status || 'Active')}, ${sqlEscape(tx['Finance Status'] || null)}, ${sqlEscape(tx['Client Type'] || 'Buyer')}, ${sqlEscape(tx['Property Address'] || '')}, ${sqlEscape(tx['Client Name'] || null)}, ${sqlEscape(tx['Lead Source'] || null)}, ${sqlEscape(listDate)}, ${sqlEscape(listPrice)}, ${sqlEscape(acceptanceDate)}, ${sqlEscape(closingDate)}, ${sqlEscape(salesPrice)}, 'PERCENTAGE', ${sqlEscape(gciPerc)}, ${sqlEscape(gciAmount)}, ${sqlEscape(txFee)}, ${sqlEscape(totalComm)}, ${sqlEscape(agentId)}, ${sqlEscape(tx.Notes || null)}, ${sqlEscape(settlementVendors)}, ${sqlEscape(customAttrs)}, FALSE, ${sqlEscape(createdAt)}, ${sqlEscape(updatedAt)})`);
});

const BATCH_SIZE = 100;
let txSqlFileContent = `-- ====================================================================
-- Soleox DEMO Seed Data: Step 3 - Transactions (${txRowsSql.length} records)
-- Nomenclature: TXN_<12_HEX>, legacy ID stored in tms_id
-- ====================================================================
`;

for (let i = 0; i < txRowsSql.length; i += BATCH_SIZE) {
  const batch = txRowsSql.slice(i, i + BATCH_SIZE);
  txSqlFileContent += `\nINSERT INTO public.transactions (
  id, client_id, tms_id, transaction_status, finance_status, transaction_side,
  property_address, client_name, lead_source, list_date, list_price,
  acceptance_date, closing_date, sales_price, gci_type, gci_perc,
  gci_amount, transaction_fee, total_commission, agent_id, notes,
  settlement_vendors, custom_attributes, archived, created_at, updated_at
)
VALUES
` + batch.join(',\n') + `
ON CONFLICT (id) DO UPDATE SET
  tms_id = EXCLUDED.tms_id,
  transaction_status = EXCLUDED.transaction_status,
  finance_status = EXCLUDED.finance_status,
  transaction_side = EXCLUDED.transaction_side,
  property_address = EXCLUDED.property_address,
  client_name = EXCLUDED.client_name,
  lead_source = EXCLUDED.lead_source,
  list_date = EXCLUDED.list_date,
  list_price = EXCLUDED.list_price,
  acceptance_date = EXCLUDED.acceptance_date,
  closing_date = EXCLUDED.closing_date,
  sales_price = EXCLUDED.sales_price,
  gci_type = EXCLUDED.gci_type,
  gci_perc = EXCLUDED.gci_perc,
  gci_amount = EXCLUDED.gci_amount,
  transaction_fee = EXCLUDED.transaction_fee,
  total_commission = EXCLUDED.total_commission,
  agent_id = EXCLUDED.agent_id,
  notes = EXCLUDED.notes,
  settlement_vendors = EXCLUDED.settlement_vendors,
  custom_attributes = EXCLUDED.custom_attributes,
  archived = FALSE,
  updated_at = EXCLUDED.updated_at;\n`;
}

fs.writeFileSync(path.join(outputDir, '03_transactions.sql'), txSqlFileContent);
console.log('Generated 03_transactions.sql');

// ==========================================
// FILE 4: 04_commission_items.sql
// ==========================================
const commItemRowsSql = [];
commCsv.forEach((c, idx) => {
  const legacyTxId = c['Transaction ID'];
  const newTxId = txIdMap.get(legacyTxId);
  if (!newTxId) return;

  const stepNumber = Number(c.Index) || (idx + 1);
  const itemId = hashId('TCI', `DEMO:TCI:${legacyTxId}:${c.Section}:${stepNumber}:${idx}`);
  const submissionId = hashId('CTS', `DEMO:CTS:${legacyTxId}`);

  let section = 'POST_SPLIT';
  let payeeType = 'ENTITY';
  if (c.Section === 'Referrals') {
    section = 'OFF_THE_TOP';
    payeeType = 'ENTITY';
  } else if (c.Section === 'Agent Splits') {
    section = 'PRE_SPLIT';
    payeeType = 'AGENT';
  } else if (c.Section === 'Post-splits') {
    section = 'POST_SPLIT';
    payeeType = c.Entity === 'Broker' ? 'BROKERAGE' : 'ENTITY';
  }

  const parsedA = parseAgentName(c.Agent);
  const agentId = parsedA.full ? (agentMap.get(parsedA.full) || null) : null;
  const entityName = c.Entity;
  const entityId = entityName ? (entityMap.get(entityName) || null) : null;

  const rawAmount = Math.abs(Number(c.Data || c.Amount || 0));
  const ruleName = c['Commission Rule'] || (payeeType === 'AGENT' ? `${parsedA.full} Split` : 'Commission Deduction');

  commItemRowsSql.push(`  (${sqlEscape(itemId)}, 'DEMO', ${sqlEscape(newTxId)}, ${sqlEscape(submissionId)}, ${stepNumber}, ${sqlEscape(ruleName)}, ${sqlEscape(section)}, ${sqlEscape(payeeType)}, ${sqlEscape(entityId)}, ${sqlEscape(agentId)}, ${sqlEscape(rawAmount)}, ${sqlEscape(rawAmount)}, FALSE, FALSE)`);
});

let commSqlFileContent = `-- ====================================================================
-- Soleox DEMO Seed Data: Step 4 - Commission Items (${commItemRowsSql.length} records)
-- Nomenclature: TCI_<12_HEX>, transaction_id = TXN_<12_HEX>
-- ====================================================================
`;

const COMM_BATCH_SIZE = 250;
for (let i = 0; i < commItemRowsSql.length; i += COMM_BATCH_SIZE) {
  const batch = commItemRowsSql.slice(i, i + COMM_BATCH_SIZE);
  commSqlFileContent += `\nINSERT INTO public.transaction_commission_items (
  id, client_id, transaction_id, submission_id, step_number, rule_name,
  section, payee_type, payee_entity_id, agent_id, calculated_amount,
  final_amount, is_manual_override, archived
)
VALUES
` + batch.join(',\n') + `
ON CONFLICT (id) DO UPDATE SET
  transaction_id = EXCLUDED.transaction_id,
  rule_name = EXCLUDED.rule_name,
  calculated_amount = EXCLUDED.calculated_amount,
  final_amount = EXCLUDED.final_amount,
  archived = FALSE;\n`;
}

fs.writeFileSync(path.join(outputDir, '04_commission_items.sql'), commSqlFileContent);
console.log('Generated 04_commission_items.sql');

// ==========================================
// FILE 5: 05_payments.sql
// ==========================================
const payItemRowsSql = [];
payCsv.forEach((p, idx) => {
  const legacyTxId = p['Transaction ID'];
  const newTxId = txIdMap.get(legacyTxId);
  if (!newTxId) return;

  const payId = hashId('PAY', `DEMO:PAY:${legacyTxId}:${idx}`);
  const amountPaid = Number(p.GCI) || 0;
  const paymentDate = parseExcelDate(p['Closing Date']);
  const paymentStatus = p.Status === 'Closed' ? 'Completed' : 'Pending';

  const parsedRecipient = parseAgentName(p.Recipient);
  const parsedPrimary = parseAgentName(p['Primary Agent']);
  const recipientDisplay = p.Type === 'Agent' ? parsedRecipient.full : p.Recipient;
  const primaryDisplay = parsedPrimary.full;
  const notes = `${recipientDisplay} (${p.Type}) - Primary: ${primaryDisplay}`;

  payItemRowsSql.push(`  (${sqlEscape(payId)}, 'DEMO', ${sqlEscape(newTxId)}, ${sqlEscape(amountPaid)}, ${sqlEscape(paymentStatus)}, ${sqlEscape(paymentDate)}, 'ACH', ${sqlEscape(notes)}, FALSE)`);
});

let paySqlFileContent = `-- ====================================================================
-- Soleox DEMO Seed Data: Step 5 - Payments (${payItemRowsSql.length} records)
-- Nomenclature: PAY_<12_HEX>, transaction_id = TXN_<12_HEX>
-- ====================================================================
`;

const PAY_BATCH_SIZE = 250;
for (let i = 0; i < payItemRowsSql.length; i += PAY_BATCH_SIZE) {
  const batch = payItemRowsSql.slice(i, i + PAY_BATCH_SIZE);
  paySqlFileContent += `\nINSERT INTO public.payments (
  id, client_id, transaction_id, amount_paid, payment_status, payment_date,
  payment_method, notes, archived
)
VALUES
` + batch.join(',\n') + `
ON CONFLICT (id) DO UPDATE SET
  transaction_id = EXCLUDED.transaction_id,
  amount_paid = EXCLUDED.amount_paid,
  payment_status = EXCLUDED.payment_status,
  payment_date = EXCLUDED.payment_date,
  archived = FALSE;\n`;
}

fs.writeFileSync(path.join(outputDir, '05_payments.sql'), paySqlFileContent);
console.log('Generated 05_payments.sql');

// ==========================================
// FILE 6: load_all_demo_data.sql (Consolidated)
// ==========================================
const consolidatedSql = `-- ====================================================================
-- Soleox DEMO: Unified Seed Data Script
-- Strict ID Nomenclature:
--   Lookup Values: CLV_<12_HEX>
--   Entities: ENT_<12_HEX>
--   Agents: AGT_<12_HEX> (agent_name: 'First Last')
--   Transactions: TXN_<12_HEX> (tms_id: original code e.g. TR000006)
--   Commission Items: TCI_<12_HEX>
--   Payments: PAY_<12_HEX>
-- ====================================================================

BEGIN;

-- Purge legacy unstandardized demo records
DELETE FROM public.transaction_commission_items WHERE client_id = 'DEMO' AND (transaction_id LIKE 'TR%' OR id LIKE 'TCI_TR%');
DELETE FROM public.payments WHERE client_id = 'DEMO' AND (transaction_id LIKE 'TR%' OR id LIKE 'PAY_TR%');
DELETE FROM public.transactions WHERE client_id = 'DEMO' AND id LIKE 'TR%';
DELETE FROM public.commission_entities WHERE id = '[DEMO] ENT_1346';

${sql1}

${sql2}

${txSqlFileContent}

${commSqlFileContent}

${paySqlFileContent}

COMMIT;
`;

fs.writeFileSync(path.join(outputDir, 'load_all_demo_data.sql'), consolidatedSql);
console.log('Generated load_all_demo_data.sql');
console.log('Seed SQL regeneration with strict ID nomenclature completed successfully!');
