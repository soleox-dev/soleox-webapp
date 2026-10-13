import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { CLIENT_COOKIE, allowsRequest, clientCookieOptions, loadAccessForEmail } from '@/lib/access';

const OPEN_PATH = /^\/login$|^\/api\/auth(\/|$)|^\/api\/cron(\/|$)/;

function emailFromToken(token: { email?: unknown } | null): string | null {
  return typeof token?.email === 'string' && token.email.trim() ? token.email.trim() : null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (OPEN_PATH.test(pathname)) return NextResponse.next();

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const email = emailFromToken(token);
  if (!email) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const login = new URL('/login', request.url);
    login.searchParams.set('callbackUrl', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  if (pathname === '/api/access' || pathname.startsWith('/api/access/')) {
    return NextResponse.next();
  }

  const access = await loadAccessForEmail(email, request.cookies.get(CLIENT_COOKIE)?.value);

  if (access.clients.length === 0) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'No client is assigned to this account.' }, { status: 403 });
    }
    if (pathname !== '/no-access') return NextResponse.redirect(new URL('/no-access', request.url));
    return NextResponse.next();
  }

  if (!access.clientId) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Choose a client before continuing.' }, { status: 409 });
    }
    if (pathname !== '/select-client') return NextResponse.redirect(new URL('/select-client', request.url));
    return NextResponse.next();
  }

  if (!allowsRequest(access, pathname, request.method)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'You do not have access to this.' }, { status: 403 });
    }
    if (pathname !== '/no-access') return NextResponse.redirect(new URL('/no-access', request.url));
    return NextResponse.next();
  }

  const headers = new Headers(request.headers);
  headers.set('x-client-id', access.clientId);
  headers.set('x-soleox-client', access.clientId);
  const response = NextResponse.next({ request: { headers } });
  if (request.cookies.get(CLIENT_COOKIE)?.value !== access.clientId) {
    response.cookies.set(CLIENT_COOKIE, access.clientId, clientCookieOptions());
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
