import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { ACTIVITY_COOKIE, CLIENT_COOKIE, activityCookieOptions, allowsRequest, clientCookieOptions, loadAccessForEmail, sessionIsIdle } from '@/lib/access';
import { limitApiWrite } from '@/lib/rate-limit';

const OPEN_PATH = /^\/login$|^\/api\/auth(\/|$)|^\/api\/cron(\/|$)/;

function emailFromToken(token: { email?: unknown } | null): string | null {
  return typeof token?.email === 'string' && token.email.trim() ? token.email.trim() : null;
}

function rememberActivity(response: NextResponse) {
  response.cookies.set(ACTIVITY_COOKIE, String(Date.now()), activityCookieOptions());
  return response;
}

function endIdleSession(request: NextRequest) {
  const response = request.nextUrl.pathname.startsWith('/api/')
    ? NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })
    : NextResponse.redirect(new URL('/login', request.url));
  const clear = { httpOnly: true, sameSite: 'lax' as const, path: '/', maxAge: 0 };
  response.cookies.set(ACTIVITY_COOKIE, '', clear);
  response.cookies.set(CLIENT_COOKIE, '', { ...clientCookieOptions(), maxAge: 0 });
  response.cookies.set('next-auth.session-token', '', clear);
  response.cookies.set('__Secure-next-auth.session-token', '', { ...clear, secure: true });
  return response;
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

  if (sessionIsIdle(request.cookies.get(ACTIVITY_COOKIE)?.value)) {
    return endIdleSession(request);
  }

  if (pathname === '/api/access' || pathname.startsWith('/api/access/')) {
    return rememberActivity(NextResponse.next());
  }

  const access = await loadAccessForEmail(email, request.cookies.get(CLIENT_COOKIE)?.value);

  if (access.clients.length === 0) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'No client is assigned to this account.' }, { status: 403 });
    }
    if (pathname !== '/no-access') return rememberActivity(NextResponse.redirect(new URL('/no-access', request.url)));
    return rememberActivity(NextResponse.next());
  }

  if (!access.clientId) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Choose a client before continuing.' }, { status: 409 });
    }
    if (pathname !== '/select-client') return rememberActivity(NextResponse.redirect(new URL('/select-client', request.url)));
    return rememberActivity(NextResponse.next());
  }

  if (!allowsRequest(access, pathname, request.method)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'You do not have access to this.' }, { status: 403 });
    }
    if (pathname !== '/no-access') return rememberActivity(NextResponse.redirect(new URL('/no-access', request.url)));
    return rememberActivity(NextResponse.next());
  }

  const method = request.method.toUpperCase();
  if (pathname.startsWith('/api/') && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const allowance = limitApiWrite({ email, clientId: access.clientId, pathname });
    if (allowance.ok === false) {
      const response = NextResponse.json(
        { error: 'Too many requests. Try again in a moment.' },
        { status: 429, headers: { 'Retry-After': String(allowance.retryAfterSeconds) } },
      );
      return rememberActivity(response);
    }
  }

  const headers = new Headers(request.headers);
  headers.set('x-client-id', access.clientId);
  headers.set('x-soleox-client', access.clientId);
  const response = NextResponse.next({ request: { headers } });
  if (request.cookies.get(CLIENT_COOKIE)?.value !== access.clientId) {
    response.cookies.set(CLIENT_COOKIE, access.clientId, clientCookieOptions());
  }
  return rememberActivity(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
