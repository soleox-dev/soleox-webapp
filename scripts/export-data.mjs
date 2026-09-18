import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  console.error('Please run with: node --env-file=.env.local scripts/export-data.mjs');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

const TABLES = [
  'clients',
  'web_users',
  'client_user_roles',
  'role_permissions',
  'client_field_configurations',
  'client_lookup_values',
  'agents',
  'commission_entities',
  'commission_templates',
  'commission_template_parameters',
  'commission_template_logic',
  'commission_template_submissions',
  'transactions',
  'transaction_commission_items',
  'payments'
];

async function main() {
  console.log('🔄 Fetching database tables from Supabase...');
  const result = {};

  for (const table of TABLES) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact' });

      if (error) {
        console.warn(`⚠️  Table "${table}": ${error.message}`);
        result[table] = { error: error.message, rows: [] };
      } else {
        console.log(`✅ Table "${table}": ${data?.length || 0} rows`);
        result[table] = data || [];
      }
    } catch (err) {
      console.error(`❌ Table "${table}" exception:`, err.message);
      result[table] = { error: err.message, rows: [] };
    }
  }

  const outputDir = path.resolve(process.cwd(), 'db');
  const outputPath = path.join(outputDir, 'supabase_data_export.json');

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');

  console.log(`\n🎉 Data exported successfully to: ${outputPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
