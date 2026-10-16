// app/api/session/route.ts

import { NextResponse } from 'next/server';
import { apiError, getTenantContext } from '@/lib/session';

export async function GET() {
  try {
    const tenant = await getTenantContext();
    return NextResponse.json({ success: true, tenant });
  } catch (error) {
    return apiError(error, 'The session could not be loaded.', 'success');
  }
}
