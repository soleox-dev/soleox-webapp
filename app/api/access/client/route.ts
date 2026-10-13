import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth';
import { CLIENT_COOKIE, clientCookieOptions, loadAccessForEmail } from '@/lib/access';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const clientId = String(body.clientId || '').trim();
  if (!clientId) return NextResponse.json({ error: 'Choose a client.' }, { status: 400 });

  const access = await loadAccessForEmail(email, null);
  if (!access.clients.some((client) => client.id === clientId)) {
    return NextResponse.json({ error: 'You do not have access to this client.' }, { status: 403 });
  }

  const jar = await cookies();
  jar.set(CLIENT_COOKIE, clientId, clientCookieOptions());
  const next = await loadAccessForEmail(email, clientId);
  return NextResponse.json({ success: true, access: next });
}
