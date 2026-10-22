/*
 * Golden fixture capture for the commission engine tests.
 *
 * Run it in the browser's devtools console on a signed-in Soleox page (http://127.0.0.1:3000),
 * with the client you want to capture selected. It only reads, through the app's own API, and
 * downloads one file: golden-capture-<CLIENT>.json. Names, emails, phones, addresses and other
 * free text are replaced in the browser before the file is written, so the download holds no
 * personal data. The console prints a privacy report; the file is not downloaded when it finds a
 * real name, email or address left in the output.
 *
 * Then: npx tsx scripts/golden/split-capture.ts ~/Downloads/golden-capture-<CLIENT>.json
 */
(async () => {
  const DEAL_IDS = [
    'TXN_0ED41005C86B', 'TXN_2229407EDAF0', 'TXN_3722A70A306D', 'TXN_5FDF62654CA7', 'TXN_F8183C35C673',
    'TXN_3E6061A155EB', 'TXN_F0128B7C4FCF', 'TXN_FD0470EA6284', 'TXN_FD346656E6FF', 'TXN_FD4970D0F142',
    'TXN_899683479910', 'TXN_D0405F9E14BE', 'TXN_DE20A3B3A4CE', 'TXN_FBE2A457B307', 'TXN_FBF24B1C27B0',
    'TXN_FD6DA17060DD', 'TXN_A69A1C96008F', 'TXN_BBA745E36D6C', 'TXN_FFC18C67CAEA', 'TXN_FFCF6081BD08',
    'TXN_FD87BA99F923', 'TXN_FEA5E6A03D5C', 'TXN_F8441300101C', 'TXN_F4378C210D3C', 'TXN_F8D466AD0D6A',
  ];
  // Ledger rows are kept only where a template SUMIFS could match them (see ledgerSlice).
  const access = (await (await fetch('/api/access')).json()).access;
  const C = access.clientId;
  const H = { 'x-client-id': C };
  const get = async (url) => {
    const response = await fetch(url, { headers: H, cache: 'no-store' });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(`${url}: ${body.error || response.status}`);
    return body;
  };
  const pageAll = async (table) => {
    let rows = [];
    for (let offset = 0; offset < 50000; offset += 1000) {
      const body = await get(`/api/formula-lookups?table=${table}&client_id=${C}&offset=${offset}&limit=1000`);
      rows = rows.concat(body.rows || []);
      if ((body.rows || []).length < 1000) break;
    }
    return rows;
  };

  console.log(`Capturing ${DEAL_IDS.length} deals for ${C}…`);
  const [agentsBody, entitiesBody, dealsBody, templatesBody, allocationConfig, schema, ledgerBody] = await Promise.all([
    get('/api/agents?include_archived=true'),
    get('/api/commission-entities'),
    get('/api/transactions'),
    get('/api/commission-templates'),
    get(`/api/agent-allocations?client_id=${C}`),
    get('/api/schema/transactions'),
    get(`/api/transaction-commission-items?client_id=${C}&view=ledger`),
  ]);
  const [lookupAgents, fieldConfigurations] = await Promise.all([pageAll('agents'), pageAll('client_field_configurations')]);
  const allAgents = agentsBody.agents || [];
  const history = (await get(`/api/transaction-team-caps?history=1&client_id=${C}&agent_ids=${encodeURIComponent(allAgents.map((a) => a.id).join(','))}`)).history || [];

  const deals = {};
  for (const id of DEAL_IDS) {
    const deal = (dealsBody.transactions || []).find((row) => row.id === id);
    if (!deal) { console.warn(`${id} not found for ${C}; skipped.`); continue; }
    const [items, submissions, teamCaps, allocations] = await Promise.all([
      get(`/api/transaction-commission-items?client_id=${C}&transaction_id=${id}`),
      get(`/api/commission-template-submissions?client_id=${C}&transaction_id=${id}`),
      get(`/api/transaction-team-caps?client_id=${C}&transaction_id=${id}`),
      get(`/api/transaction-agent-allocations?client_id=${C}&transaction_id=${id}`),
    ]);
    deals[id] = {
      deal,
      items: items.items || [],
      submissions: submissions.submissions || [],
      teamCapRows: teamCaps.teamCaps || [],
      allocationRows: allocations.allocations || [],
    };
  }
  const templateIds = [...new Set(Object.values(deals).flatMap((d) => d.submissions.map((s) => s.template_id)).filter(Boolean))];
  const bundles = {};
  for (const templateId of templateIds) {
    const [parameters, logic] = await Promise.all([
      get(`/api/commission-template-parameters?template_id=${templateId}`),
      get(`/api/commission-template-logic?template_id=${templateId}`),
    ]);
    bundles[templateId] = { parameters: parameters.parameters || [], steps: logic.logic_steps || [] };
  }

  // ---- Which agents and ledger rows the fixtures need ----
  const AGT = /\bAGT_[0-9A-F]{12}\b/g;
  const capRecipients = new Set((allocationConfig.teamCaps || []).map((cap) => cap.recipient_agent_id).filter(Boolean));
  const dealAgentIds = (entry) => {
    const ids = new Set(capRecipients);
    if (entry.deal.agent_id) ids.add(entry.deal.agent_id);
    entry.items.forEach((item) => item.agent_id && ids.add(item.agent_id));
    entry.submissions.forEach((s) => JSON.stringify(s.submitted_parameters || {}).match(AGT)?.forEach((m) => ids.add(m)));
    return ids;
  };
  const kept = new Set();
  Object.values(deals).forEach((entry) => dealAgentIds(entry).forEach((id) => kept.add(id)));
  allAgents.forEach((agent) => agent.is_team_lead && kept.add(agent.id));
  // A field only some agent has still exists for formulas (tier 3): keep one agent carrying each field.
  const fieldOwners = new Map();
  allAgents.forEach((agent) => Object.entries(agent).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '' && !fieldOwners.has(key)) fieldOwners.set(key, agent.id);
  }));
  const keptKeys = new Set();
  allAgents.filter((a) => kept.has(a.id)).forEach((agent) => Object.entries(agent).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') keptKeys.add(key);
  }));
  fieldOwners.forEach((id, key) => { if (!keptKeys.has(key)) kept.add(id); });

  const entityName = new Map((entitiesBody.entities || []).map((e) => [e.id, e.entity_name || '']));
  const templateText = Object.values(bundles).map((b) => JSON.stringify(b)).join('\n');
  const sumifsEntities = new Set([...templateText.matchAll(/commission_entities\.entity_name\s*,\s*\\?"([^"\\]+)\\?"/g)].map((m) => m[1]));
  const sumifsStatuses = new Set([...templateText.matchAll(/transactions\.transaction_status\s*,\s*\\?"([^"\\]+)\\?"/g)].map((m) => m[1]));
  const everySumifsFiltersAgent = [...templateText.matchAll(/SUMIFS\(([^)]*)/g)].every((m) => /transaction_commission_items\.agent_id/.test(m[1]));
  const ledgerSlice = (entry) => {
    const agents = dealAgentIds(entry);
    const close = String(entry.deal.closing_date || '').slice(0, 10);
    return (ledgerBody.items || []).filter((row) => {
      if (everySumifsFiltersAgent && !agents.has(row.agent_id)) return false;
      if (sumifsEntities.size > 0 && !sumifsEntities.has(entityName.get(row.payee_entity_id) || '')) return false;
      if (sumifsStatuses.size > 0 && !sumifsStatuses.has(String(row.transaction_status || ''))) return false;
      if (close && String(row.closing_date || '').slice(0, 10) >= close) return false;
      return true;
    }).map((row) => [row.final_amount, row.agent_id, row.payee_entity_id, row.section, row.transaction_id, row.closing_date, row.transaction_status]);
  };
  Object.values(deals).forEach((entry) => { entry.ledger = ledgerSlice(entry); });

  // ---- Masking ----
  const pad = (n) => String(n).padStart(3, '0');
  const sortedAgents = [...allAgents].sort((a, b) => a.id.localeCompare(b.id));
  const pseudo = new Map(sortedAgents.map((agent, index) => [agent.id, { first: `Fn${pad(index + 1)}`, last: `Ln${pad(index + 1)}` }]));
  const variants = new Map();
  const realNames = new Set();
  const addVariant = (real, replacement) => {
    const key = String(real || '').trim();
    if (key.length < 5 || !/[ ,]/.test(key)) return;
    realNames.add(key);
    if (!variants.has(key.toLowerCase())) variants.set(key.toLowerCase(), replacement);
  };
  allAgents.forEach((agent) => {
    const p = pseudo.get(agent.id);
    const full = `${p.first} ${p.last}`;
    const comma = `${p.last}, ${p.first}`;
    const raw = String(agent.agent_name || '').trim();
    if (raw.includes(',')) {
      addVariant(raw, comma);
      const [last, first] = raw.split(',').map((part) => part.trim());
      addVariant(`${first} ${last}`, full);
    } else {
      addVariant(raw, full);
    }
    addVariant(`${agent.first_name || ''} ${agent.last_name || ''}`, full);
    addVariant(`${agent.last_name || ''}, ${agent.first_name || ''}`, comma);
  });
  // First names of team cap recipients appear in field keys and cap names (custom_<first>_team_cap_split).
  const ENGINE_WORDS = new Set(['sales', 'price', 'gci', 'perc', 'amount', 'total', 'commission', 'closing', 'date', 'agent', 'split', 'team', 'cap', 'lead', 'source', 'side', 'transaction', 'status', 'fee', 'baseline', 'prior', 'units', 'custom', 'stock', 'liability', 'company', 'comm', 'flat', 'exp', 'reset', 'join', 'name', 'first', 'last', 'level', 'post', 'pre', 'off', 'top']);
  const firstTokens = new Map();
  const skippedTokens = [];
  capRecipients.forEach((id) => {
    const agent = allAgents.find((a) => a.id === id);
    if (!agent) return;
    const first = String(agent.first_name || String(agent.agent_name || '').split(/[ ,]+/)[0] || '').trim();
    if (first.length < 3) return;
    if (ENGINE_WORDS.has(first.toLowerCase())) { skippedTokens.push(pseudo.get(id).first); return; }
    firstTokens.set(first.toLowerCase(), pseudo.get(id).first);
  });
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nameKeys = [...variants.keys(), ...firstTokens.keys()].sort((a, b) => b.length - a.length);
  const NAME_RX = new RegExp(`(?<![A-Za-z])(${nameKeys.map(escape).join('|')})(?![A-Za-z])`, 'gi');
  const sameCase = (source, replacement) => (source === source.toLowerCase() ? replacement.toLowerCase() : replacement);
  const replaceNames = (text) => text.replace(NAME_RX, (match) => sameCase(match, variants.get(match.toLowerCase()) ?? firstTokens.get(match.toLowerCase())));

  const MASKED_EMAIL = 'masked@example.test';
  const filled = (value) => value !== null && value !== undefined && value !== '';
  const agentIdsOnly = (value) => {
    const text = Array.isArray(value) ? value.join(',') : String(value);
    return text.split(',').every((part) => /^AGT_[0-9A-F]{12}$/.test(part.trim()));
  };
  const DEAL_FREE_TEXT = ['notes', 'address_details', 'co_broker', 'custom_client_phone', 'custom_commission_splits', 'custom_referral',
    'custom_co_broker_agent', 'custom_co_broker_company', 'custom_loan_officer', 'custom_closing_officer', 'lender_company',
    'custom_escrow_company', 'title_company', 'tms_connection'];
  const DEAL_PEOPLE = ['lead_owner', 'isa', 'transaction_coordinator'];
  const realAddresses = new Set();
  const realClients = new Set();
  const maskDealFields = (record, index) => {
    if (!record || typeof record !== 'object') return record;
    const next = { ...record };
    if (filled(next.property_address)) { realAddresses.add(String(next.property_address)); next.property_address = `${100 + index} Example Street`; }
    if (filled(next.client_name)) { realClients.add(String(next.client_name)); next.client_name = `Client ${pad(index + 1)}`; }
    if (filled(next.custom_client_email)) next.custom_client_email = MASKED_EMAIL;
    DEAL_FREE_TEXT.forEach((key) => { if (filled(next[key])) next[key] = typeof next[key] === 'object' ? null : 'Masked'; });
    DEAL_PEOPLE.forEach((key) => { if (filled(next[key]) && !agentIdsOnly(next[key])) next[key] = 'Masked'; });
    ['created_by', 'updated_by'].forEach((key) => { if (filled(next[key])) next[key] = MASKED_EMAIL; });
    if (next.custom_attributes && typeof next.custom_attributes === 'object') next.custom_attributes = maskDealFields(next.custom_attributes, index);
    return next;
  };
  const maskAgent = (agent) => {
    const p = pseudo.get(agent.id) || { first: 'Fn000', last: 'Ln000' };
    const next = { ...agent };
    const raw = String(agent.agent_name || '');
    next.agent_name = raw.includes(',') ? `${p.last}, ${p.first}` : `${p.first} ${p.last}`;
    if ('first_name' in next) next.first_name = p.first;
    if ('last_name' in next) next.last_name = p.last;
    ['agent_email', 'agent_phone', 'user_id', 'tms_id'].forEach((key) => { if (key in next) next[key] = null; });
    ['created_by', 'updated_by'].forEach((key) => { if (filled(next[key])) next[key] = MASKED_EMAIL; });
    if (next.custom_attributes && typeof next.custom_attributes === 'object') {
      next.custom_attributes = Object.fromEntries(Object.entries(next.custom_attributes).map(([key, value]) => (
        [key, typeof value === 'string' && value.includes('@') ? MASKED_EMAIL : value]
      )));
    }
    return next;
  };
  const keepEntityName = (name) => templateText.includes(name) || /broker/i.test(name);
  const entityPseudo = new Map();
  const maskEntity = (entity) => {
    const name = String(entity.entity_name || '');
    let masked = name;
    if (name && !keepEntityName(name)) {
      const asAgent = variants.get(name.trim().toLowerCase());
      if (asAgent) masked = asAgent;
      else {
        if (!entityPseudo.has(name)) entityPseudo.set(name, `Entity ${pad(entityPseudo.size + 1)}`);
        masked = entityPseudo.get(name);
        realNames.add(name);
      }
    }
    return { ...entity, entity_name: masked, contact_name: null, contact_email: null, tax_id: null,
      created_by: filled(entity.created_by) ? MASKED_EMAIL : entity.created_by, updated_by: filled(entity.updated_by) ? MASKED_EMAIL : entity.updated_by };
  };
  const maskWho = (row) => ({ ...row, ...(filled(row.created_by) ? { created_by: MASKED_EMAIL } : {}), ...(filled(row.updated_by) ? { updated_by: MASKED_EMAIL } : {}) });

  const dealIndex = new Map(Object.keys(deals).map((id, index) => [id, index]));
  const output = {
    version: 1,
    clientId: C,
    capturedAt: new Date().toISOString(),
    agents: allAgents.filter((a) => kept.has(a.id)).map(maskAgent),
    lookupAgents: lookupAgents.filter((a) => kept.has(a.id)).map(maskAgent),
    fieldConfigurations: fieldConfigurations.map(maskWho),
    schema: { ...schema, catalog: (schema.catalog || []).map(maskWho) },
    entities: (entitiesBody.entities || []).map(maskEntity),
    templates: (templatesBody.templates || []).map(maskWho),
    bundles: Object.fromEntries(Object.entries(bundles).map(([id, b]) => [id, { parameters: b.parameters.map(maskWho), steps: b.steps.map(maskWho) }])),
    allocationConfig: { teamCaps: allocationConfig.teamCaps || [], agentCaps: (allocationConfig.agentCaps || []).map(maskWho), salesVolume: allocationConfig.salesVolume ?? null },
    teamCapHistory: history.filter((row) => kept.has(row.agentId)),
    deals: Object.fromEntries(Object.entries(deals).map(([id, entry]) => [id, {
      deal: maskDealFields(entry.deal, dealIndex.get(id)),
      items: entry.items.map(maskWho),
      submissions: entry.submissions.map(maskWho),
      teamCapRows: entry.teamCapRows,
      allocationRows: entry.allocationRows,
      ledger: entry.ledger,
    }])),
  };
  // Masked entity names are replaced wherever they appear (stored rule names, labels).
  let text = JSON.stringify(output);
  entityPseudo.forEach((replacement, real) => {
    if (real.length >= 4) text = text.replace(new RegExp(`(?<![A-Za-z])${escape(real)}(?![A-Za-z])`, 'g'), replacement);
  });
  text = replaceNames(text);
  text = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (email) => (email === MASKED_EMAIL ? email : MASKED_EMAIL));
  const final = JSON.parse(text);

  // ---- Privacy report ----
  const lower = text.toLowerCase();
  const hits = (set) => [...set].filter((value) => value.trim().length >= 5 && lower.includes(value.trim().toLowerCase())).length;
  const loneNameHits = new Set();
  allAgents.forEach((agent) => [agent.first_name, agent.last_name].forEach((part) => {
    const word = String(part || '').trim();
    if (word.length >= 4 && !ENGINE_WORDS.has(word.toLowerCase()) && new RegExp(`(?<![A-Za-z])${escape(word)}(?![A-Za-z])`, 'i').test(text)) loneNameHits.add(word);
  }));
  const report = {
    deals: Object.keys(final.deals).length,
    agentsKept: final.agents.length,
    ledgerRows: Object.values(final.deals).reduce((sum, d) => sum + d.ledger.length, 0),
    everySumifsFiltersAgent,
    fullNamesLeft: hits(realNames),
    addressesLeft: hits(realAddresses),
    clientNamesLeft: hits(realClients),
    otherEmailsLeft: (text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).filter((e) => e !== MASKED_EMAIL).length,
    loneFirstOrLastNamesLeft: loneNameHits.size,
    skippedFirstNameTokens: skippedTokens.length,
    bytes: text.length,
  };
  console.table(report);
  if (report.fullNamesLeft || report.addressesLeft || report.clientNamesLeft || report.otherEmailsLeft) {
    console.error('Personal data is still in the output; nothing was downloaded.');
    return;
  }
  if (report.loneFirstOrLastNamesLeft) {
    console.warn(`${report.loneFirstOrLastNamesLeft} first or last names still appear on their own (window.__goldenLoneNames). Check them before committing.`);
    window.__goldenLoneNames = [...loneNameHits];
  }
  final.privacyReport = report;
  const blob = new Blob([JSON.stringify(final)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `golden-capture-${C}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  console.log(`Downloaded golden-capture-${C}.json`);
})().catch((error) => console.error('Golden capture failed:', error));
