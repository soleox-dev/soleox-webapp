import { supabaseAdmin } from '@/lib/supabase';

export const CLIENT_COOKIE = 'soleox-client';

/** Accounts that can open every client. Stored here so access works before the database column exists. */
const PLATFORM_SUPER_ADMINS = new Set(['carlos.bes@soleox.org']);

const FULL_ACCESS_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

export type ClientChoice = {
  id: string;
  name: string;
};

export type AccessPermissions = {
  commissionTrackerRead: boolean;
  commissionTrackerWrite: boolean;
  commissionTrackerSettings: boolean;
  ownerReports: boolean;
  superAdmin: boolean;
};

export type AccessProfile = {
  email: string;
  isSuperAdmin: boolean;
  clients: ClientChoice[];
  clientId: string | null;
  clientName: string | null;
  needsSelection: boolean;
  permissions: AccessPermissions;
};

export type AccessGate =
  | 'tracker_read'
  | 'tracker_write'
  | 'settings'
  | 'owner_reports'
  | 'super_admin';

const NONE: AccessPermissions = {
  commissionTrackerRead: false,
  commissionTrackerWrite: false,
  commissionTrackerSettings: false,
  ownerReports: false,
  superAdmin: false,
};

export function clientCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  };
}

export function allows(access: AccessProfile, gate: AccessGate): boolean {
  if (access.isSuperAdmin || access.permissions.superAdmin) return true;
  switch (gate) {
    case 'super_admin':
      return false;
    case 'tracker_write':
      return access.permissions.commissionTrackerWrite;
    case 'tracker_read':
      return access.permissions.commissionTrackerRead || access.permissions.commissionTrackerWrite;
    case 'settings':
      return access.permissions.commissionTrackerSettings;
    case 'owner_reports':
      return access.permissions.ownerReports;
    default:
      return false;
  }
}

function permissionsFor(roles: string[], fullAccess: boolean): AccessPermissions {
  if (fullAccess) {
    return {
      commissionTrackerRead: true,
      commissionTrackerWrite: true,
      commissionTrackerSettings: true,
      ownerReports: true,
      superAdmin: true,
    };
  }
  const write = roles.includes('COMMISSION_TRACKER_WRITE');
  const read = roles.includes('COMMISSION_TRACKER_READ') || write;
  return {
    commissionTrackerRead: read,
    commissionTrackerWrite: write,
    commissionTrackerSettings: roles.includes('COMMISSION_TRACKER_SETTINGS'),
    ownerReports: roles.includes('OWNER_REPORTS'),
    superAdmin: false,
  };
}

type RoleRow = { client_id: string; role: string | null; is_active: boolean | null };
type ClientRow = { id: string; client_name: string | null; status: string | null; archived?: boolean | null };

const ACCESS_CACHE_MS = 60_000;
const accessCache = new Map<string, { expires: number; profile: AccessProfile }>();
const accessInflight = new Map<string, Promise<AccessProfile>>();

async function loadUser(email: string): Promise<{ id: string | null; isSuperAdmin: boolean }> {
  const normalized = email.toLowerCase();
  const withFlag = await supabaseAdmin
    .from('web_users')
    .select('id, email, is_super_admin')
    .eq('email', normalized)
    .maybeSingle();

  if (!withFlag.error && withFlag.data) {
    const flag = Boolean((withFlag.data as { is_super_admin?: boolean }).is_super_admin);
    return { id: String(withFlag.data.id), isSuperAdmin: flag || PLATFORM_SUPER_ADMINS.has(normalized) };
  }

  const plain = await supabaseAdmin
    .from('web_users')
    .select('id, email')
    .eq('email', normalized)
    .maybeSingle();

  if (plain.error || !plain.data) {
    return { id: null, isSuperAdmin: PLATFORM_SUPER_ADMINS.has(normalized) };
  }
  return { id: String(plain.data.id), isSuperAdmin: PLATFORM_SUPER_ADMINS.has(normalized) };
}

async function loadActiveClients(): Promise<ClientChoice[]> {
  const { data: clientRows, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('id, client_name, status, archived')
    .eq('status', 'ACTIVE');
  if (clientError) throw new Error(clientError.message);

  return ((clientRows || []) as ClientRow[])
    .filter((row) => row.archived !== true)
    .map((row) => ({ id: String(row.id), name: row.client_name || String(row.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadRoles(userId: string): Promise<RoleRow[]> {
  const { data, error } = await supabaseAdmin
    .from('client_user_roles')
    .select('client_id, role, is_active')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  return (data || []) as RoleRow[];
}

export async function loadAccessForEmail(email: string, selectedCookie?: string | null): Promise<AccessProfile> {
  const normalized = email.toLowerCase();
  const cookie = selectedCookie?.trim() || '';
  const cacheKey = `${normalized}\0${cookie}`;
  const now = Date.now();
  const cached = accessCache.get(cacheKey);
  if (cached && cached.expires > now) return cached.profile;
  const pending = accessInflight.get(cacheKey);
  if (pending) return pending;

  const loading = loadAccessUncached(normalized, cookie, cacheKey, now).finally(() => {
    accessInflight.delete(cacheKey);
  });
  accessInflight.set(cacheKey, loading);
  return loading;
}

async function loadAccessUncached(normalized: string, cookie: string, cacheKey: string, now: number): Promise<AccessProfile> {
  const [user, activeClients] = await Promise.all([loadUser(normalized), loadActiveClients()]);
  const roles = user.id ? await loadRoles(user.id) : [];

  const roleClientIds = new Set(roles.map((row) => String(row.client_id)));
  const clients = user.isSuperAdmin
    ? activeClients
    : activeClients.filter((client) => roleClientIds.has(client.id));

  const cookieMatch = cookie && clients.some((client) => client.id === cookie) ? cookie : '';
  const clientId = cookieMatch || (clients.length === 1 ? clients[0].id : null);
  const clientName = clients.find((client) => client.id === clientId)?.name ?? null;
  const clientRoles = roles
    .filter((row) => String(row.client_id) === clientId)
    .map((row) => String(row.role || ''));
  const fullOnClient = user.isSuperAdmin || clientRoles.some((role) => FULL_ACCESS_ROLES.has(role));

  const profile: AccessProfile = {
    email: normalized,
    isSuperAdmin: user.isSuperAdmin,
    clients,
    clientId,
    clientName,
    needsSelection: clients.length > 1 && !cookieMatch,
    permissions: clientId ? permissionsFor(clientRoles, fullOnClient) : NONE,
  };
  accessCache.set(cacheKey, { expires: now + ACCESS_CACHE_MS, profile });
  return profile;
}

function isSettingsApi(pathname: string): boolean {
  return [
    '/api/schema',
    '/api/fields',
    '/api/client-field-configuration',
    '/api/commission-templates',
    '/api/commission-template-parameters',
    '/api/commission-template-logic',
    '/api/commission-template-submissions',
    '/api/commission-entities',
    '/api/client-lookup-values',
    '/api/transaction-scorecards',
    '/api/transaction-default-view',
    '/api/integrations',
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isOperationalApi(pathname: string): boolean {
  return [
    '/api/transactions',
    '/api/transaction-commission-items',
    '/api/agents',
    '/api/payments',
    '/api/waterfall',
    '/api/formula-lookups',
    '/api/compliance',
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Which permission an API call or page needs. Null means any signed-in user with a selected client. */
export function gateForRequest(pathname: string, method: string): AccessGate | null {
  const path = pathname.split('?')[0];
  const write = method !== 'GET' && method !== 'HEAD';

  if (path.startsWith('/api/access') || path.startsWith('/api/auth') || path.startsWith('/api/cron')) return null;
  if (path === '/api/session' || path === '/api/clients' || path.startsWith('/api/web-users') || path.startsWith('/api/client-user-roles') || path.startsWith('/api/role-permissions')) {
    return path.startsWith('/api/web-users') || path.startsWith('/api/client-user-roles') || path.startsWith('/api/role-permissions')
      ? 'super_admin'
      : null;
  }

  if (path.startsWith('/api/')) {
    if (path.startsWith('/api/agents')) return write ? 'tracker_write' : 'tracker_read';
    if (path.startsWith('/api/integrations')) {
      if (!write) return 'tracker_read';
      if (path.includes('/sync') || path.includes('/preview')) return 'tracker_write';
      return 'settings';
    }
    if (isOperationalApi(path)) {
      if (!write) return 'tracker_read';
      return 'tracker_write';
    }
    if (isSettingsApi(path)) {
      if (!write) return 'tracker_read';
      return 'settings';
    }
    return write ? 'settings' : 'tracker_read';
  }

  if (path.startsWith('/commission-tracker/settings')) return 'settings';
  if (path.startsWith('/commission-tracker')) return 'tracker_read';
  if (path.startsWith('/owner-reports')) return 'owner_reports';
  if (
    path.startsWith('/agent-reports')
    || path.startsWith('/office-reports')
    || path.startsWith('/goals')
    || path.startsWith('/leads')
    || path.startsWith('/operating-expenses')
  ) {
    return 'super_admin';
  }
  return null;
}

/** Owner Reports reads transaction data through the same APIs as Commission Tracker. */
export function allowsRequest(access: AccessProfile, pathname: string, method: string): boolean {
  const gate = gateForRequest(pathname, method);
  if (!gate) return true;
  const path = pathname.split('?')[0];
  if (path.includes('/api/integrations/') && (path.includes('/sync') || path.includes('/preview'))) {
    return allows(access, 'tracker_write') || allows(access, 'settings');
  }
  if (path.startsWith('/api/commission-template-submissions') && method !== 'GET' && method !== 'HEAD') {
    return allows(access, 'tracker_write') || allows(access, 'settings');
  }
  if (gate === 'tracker_read' && access.permissions.ownerReports && (method === 'GET' || method === 'HEAD')) {
    const operational = isOperationalApi(path) || path.startsWith('/api/schema') || path.startsWith('/api/commission-entities') || path.startsWith('/api/client-lookup-values');
    if (operational) return true;
  }
  if (gate === 'tracker_read' && access.permissions.commissionTrackerSettings && isSettingsRead(pathname)) return true;
  return allows(access, gate);
}

function isSettingsRead(pathname: string): boolean {
  return isSettingsApi(pathname.split('?')[0]);
}
