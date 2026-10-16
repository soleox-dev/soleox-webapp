import { NextResponse } from 'next/server';
import { apiError, requireSessionClient } from '@/lib/session';

export async function GET() {
  try {
    const { clientId, supabase } = await requireSessionClient();
    const { data, error } = await supabase
      .from('audit_events')
      .select('id, actor_email, action, entity, entity_id, summary, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ success: true, events: data || [] });
  } catch (error) {
    return apiError(error, 'The activity log could not be loaded.', 'success');
  }
}
