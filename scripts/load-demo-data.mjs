import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const csvDir = '/Users/carlosbes/Library/CloudStorage/GoogleDrive-carlos.bes@soleox.org/My Drive/Commissions Tracker/Clients/DEMO/02_PROD/Soleox Commissions Tracker_DEMO/DO NOT TOUCH_CSV_DEMO';

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

async function batchUpsert(table, rows, chunkSize = 100) {
  console.log(`📦 Upserting ${rows.length} rows into ${table}...`);
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' });
    if (error) {
      console.error(`❌ Error in ${table} at chunk ${i}-${i + chunk.length}:`, error);
      throw error;
    }
  }
  console.log(`✅ Finished ${table} (${rows.length} records)`);
}

async function main() {
  console.log('🚀 Starting DEMO data ingestion with strict ID nomenclature into Supabase...');

  // 1. Read CSVs
  const agentsCsv = parseCSV(fs.readFileSync(path.join(csvDir, 'Agents.csv'), 'utf-8'));
  const entitiesCsv = parseCSV(fs.readFileSync(path.join(csvDir, 'Commission Entities.csv'), 'utf-8'));
  const txCsv = parseCSV(fs.readFileSync(path.join(csvDir, 'Transactions.csv'), 'utf-8'));
  const commCsv = parseCSV(fs.readFileSync(path.join(csvDir, 'Commissions.csv'), 'utf-8'));
  const payCsv = parseCSV(fs.readFileSync(path.join(csvDir, 'Payments.csv'), 'utf-8'));

  // ==========================================
  // PURGE LEGACY RECORDS WITH TR% / UNSTANDARDIZED IDS
  // ==========================================
  console.log('🧹 Purging legacy unstandardized rows for DEMO tenant...');
  
  // Commission items with legacy transaction IDs or legacy IDs
  const { error: errTci } = await supabase
    .from('transaction_commission_items')
    .delete()
    .eq('client_id', 'DEMO')
    .or('transaction_id.like.TR%,id.like.TCI_TR%');
  if (errTci) console.warn('Warning on legacy TCI purge:', errTci.message);

  // Payments with legacy transaction IDs or legacy IDs
  const { error: errPay } = await supabase
    .from('payments')
    .delete()
    .eq('client_id', 'DEMO')
    .or('transaction_id.like.TR%,id.like.PAY_TR%');
  if (errPay) console.warn('Warning on legacy PAY purge:', errPay.message);

  // Transactions with legacy TR IDs
  const { error: errTx } = await supabase
    .from('transactions')
    .delete()
    .eq('client_id', 'DEMO')
    .like('id', 'TR%');
  if (errTx) console.warn('Warning on legacy TXN purge:', errTx.message);

  // Cleanup old non-standard entity and lookup IDs
  await supabase.from('commission_entities').delete().eq('id', '[DEMO] ENT_1346');
  await supabase.from('client_lookup_values').delete().in('id', ['CLV_GRP_A', 'CLV_GRP_B']);

  console.log('🧹 Cleanup complete!');

  // 2. Lookup Values (Groups)
  console.log('1️⃣ Updating client_lookup_values...');
  const lookupRows = [
    { id: 'CLV_893A4F1B0001', client_id: 'DEMO', category: 'GROUP_ID', option_label: 'Group A', option_value: 'Group A', sort_order: 3, is_active: true, is_default: false, archived: false },
    { id: 'CLV_893A4F1B0002', client_id: 'DEMO', category: 'GROUP_ID', option_label: 'Group B', option_value: 'Group B', sort_order: 4, is_active: true, is_default: false, archived: false },
  ];
  await batchUpsert('client_lookup_values', lookupRows);

  // 3. Commission Entities (all ENT_<12_HEX>)
  console.log('2️⃣ Updating commission_entities...');
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

  const entityRows = [];
  const seenEntityIds = new Set();
  entityMap.forEach((id, nameKey) => {
    if (nameKey !== nameKey.toLowerCase() || nameKey === 'tc fee') {
      if (seenEntityIds.has(id)) return;
      seenEntityIds.add(id);

      let type = 'OTHER';
      if (nameKey.includes('Broker') || nameKey.includes('Risk')) type = 'BROKERAGE';
      else if (nameKey.includes('TC')) type = 'TEAM';
      else if (nameKey.includes('Stock')) type = 'EQUITY';
      else if (nameKey.includes('Photo') || nameKey.includes('Staging')) type = 'VENDOR';

      entityRows.push({
        id,
        client_id: 'DEMO',
        entity_name: nameKey,
        entity_type: type,
        is_active: true,
        archived: false,
        created_by: 'system_seed',
        updated_by: 'system_seed',
      });
    }
  });
  await batchUpsert('commission_entities', entityRows);

  // 4. Agents (Strict AGT_<12_HEX> with normalized First Last names)
  console.log('3️⃣ Updating agents...');
  const knownAgentIds = {
    'Brennan Devon': 'AGT_A8C5F636713A',
    'Robert Ito': 'AGT_B45B9A8A0322',
    'Christa Tyler': 'AGT_77ABA1E7C0B7',
    'Sarah Conner': 'AGT_DEMO_01',
  };

  const agentMap = new Map();
  const agentInfoMap = new Map();

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

  const agentRows = [];
  agentInfoMap.forEach(info => {
    agentRows.push({
      id: info.id,
      client_id: 'DEMO',
      agent_name: info.full,
      agent_email: info.email,
      agent_phone: info.phone,
      group_id: info.group,
      agent_status: info.status,
      is_team_lead: info.isTeamLead,
      commission_attributes: {
        broker_cap_date: info.capDate,
        broker_cap_limit: info.capLimit,
        broker_cap_paid_ytd: 0,
        broker_250_fee_cap: info.broker250FeeCap,
        risk_cap_limit: info.riskCapLimit,
        risk_paid_ytd: 0,
        stock_percent: info.stockPercent,
      },
      custom_attributes: {
        first_name: info.first,
        last_name: info.last,
      },
      archived: false,
      created_by: 'system_seed',
      updated_by: 'system_seed',
    });
  });
  await batchUpsert('agents', agentRows);

  // 5. Transactions (Strict TXN_<12_HEX>, legacy ID in tms_id)
  console.log('4️⃣ Updating transactions...');
  const commsByTx = new Map();
  commCsv.forEach(c => {
    const legacyTxId = c['Transaction ID'];
    if (!legacyTxId) return;
    if (!commsByTx.has(legacyTxId)) commsByTx.set(legacyTxId, []);
    commsByTx.get(legacyTxId).push(c);
  });

  const txIdMap = new Map();
  const txRows = [];

  txCsv.forEach(tx => {
    const legacyId = tx.ID;
    const newTxId = hashId('TXN', 'DEMO:TXN:' + legacyId);
    txIdMap.set(legacyId, newTxId);

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

    const offTheTopRules = txComms
      .filter(c => c.Section === 'Referrals')
      .map((c, idx) => ({
        id: `rule_off_${idx + 1}`,
        name: c['Commission Rule'] || 'Referral',
        entity: c.Entity || 'Referral',
        type: c.Type === 'Percent' ? 'PERCENT' : 'AMOUNT',
        value: c.Type === 'Percent' ? Number(c.Percent) : Math.abs(Number(c.Data || c.Amount || 0)),
      }));

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

      agentSplits.forEach(s => {
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

    txRows.push({
      id: newTxId,
      client_id: 'DEMO',
      tms_id: legacyId,
      transaction_status: tx.Status || 'Active',
      finance_status: tx['Finance Status'] || null,
      transaction_side: tx['Client Type'] || 'Buyer',
      property_address: tx['Property Address'] || '',
      client_name: tx['Client Name'] || null,
      lead_source: tx['Lead Source'] || null,
      list_date: listDate,
      list_price: listPrice,
      acceptance_date: acceptanceDate,
      closing_date: closingDate,
      sales_price: salesPrice,
      gci_type: 'PERCENTAGE',
      gci_perc: gciPerc,
      gci_amount: gciAmount,
      transaction_fee: txFee,
      total_commission: totalComm,
      agent_id: agentId,
      notes: tx.Notes || null,
      settlement_vendors: settlementVendors,
      custom_attributes: customAttrs,
      archived: false,
      created_at: createdAt,
      updated_at: updatedAt,
    });
  });
  await batchUpsert('transactions', txRows, 100);

  // 6. Commission Items (Strict TCI_<12_HEX>, transaction_id: TXN_<12_HEX>)
  console.log('5️⃣ Updating transaction_commission_items...');
  const commRows = [];
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

    commRows.push({
      id: itemId,
      client_id: 'DEMO',
      transaction_id: newTxId,
      submission_id: submissionId,
      step_number: stepNumber,
      rule_name: ruleName,
      section,
      split_type: 'AMOUNT',
      split_value: rawAmount,
      note: null,
      payee_type: payeeType,
      payee_entity_id: entityId,
      entity_name: entityName || null,
      agent_id: agentId,
      agent_name: parsedA.full || null,
      is_primary: false,
      calculated_amount: rawAmount,
      final_amount: rawAmount,
      is_manual_override: false,
      archived: false,
    });
  });
  await batchUpsert('transaction_commission_items', commRows, 250);

  // 7. Payments (Strict PAY_<12_HEX>, transaction_id: TXN_<12_HEX>)
  console.log('6️⃣ Updating payments...');
  const payRows = [];
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

    payRows.push({
      id: payId,
      client_id: 'DEMO',
      transaction_id: newTxId,
      payee_type: p.Type === 'Agent' ? 'AGENT' : (p.Recipient === 'Broker' ? 'BROKERAGE' : 'ENTITY'),
      payee_name: recipientDisplay,
      agent_id: p.Type === 'Agent' ? (agentMap.get(parsedRecipient.full) || null) : null,
      payee_entity_id: p.Type !== 'Agent' ? (entityMap.get(p.Recipient) || null) : null,
      disbursement_type: p.Type === 'Agent' ? 'AGENT_NET' : 'THIRD_PARTY_DISBURSEMENT',
      amount_paid: amountPaid,
      payment_status: paymentStatus,
      payment_date: paymentDate,
      payment_method: p.Type === 'Agent' ? 'ACH' : 'Escrow Wire',
      notes,
      archived: false,
    });
  });
  await batchUpsert('payments', payRows, 250);

  console.log('🎉 All demo data successfully reloaded with clean, standard ID nomenclature!');
}

main().catch(err => {
  console.error('Fatal load error:', err);
  process.exit(1);
});
