// app/api/session/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const clientId = request.headers.get('x-client-id');
    const tenant = await getTenantContext(clientId);

    return NextResponse.json({ success: true, tenant });
  } catch (error: any) {
    const status = error.message?.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}
