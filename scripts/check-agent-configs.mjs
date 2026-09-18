import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

async function check() {
  const { data: configs } = await supabase
    .from('client_field_configurations')
    .select('id, field_key, field_label, section_name, section_sort_order, sort_order, is_enabled')
    .eq('client_id', 'DEMO')
    .eq('target_table', 'agents')
    .or('archived.is.null,archived.eq.false')
    .order('section_sort_order')
    .order('sort_order');

  console.log('client_field_configurations for agents:');
  console.log(configs);
}

check().catch(console.error);
