import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth';
import { CLIENT_COOKIE, loadAccessForEmail } from '@/lib/access';

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const jar = await cookies();
  const access = await loadAccessForEmail(email, jar.get(CLIENT_COOKIE)?.value);
  return NextResponse.json({ success: true, access });
}
