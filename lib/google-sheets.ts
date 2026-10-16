import crypto from 'crypto';
import { repairImportedText } from '@/lib/imported-text';
import { DEFAULT_SHEET_TAB, type SheetSyncRow } from '@/lib/transaction-sync';

if (typeof window !== 'undefined') {
  throw new Error('The Google service account is server-only.');
}

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export function googleServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, '\n'),
    };
  } catch {
    return null;
  }
}

export function parseSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromUrl) return fromUrl[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export function spreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.token;
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: account.client_email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(account.private_key);
  const assertion = `${unsigned}.${base64url(signature)}`;
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || 'Google did not return an access token.');
  }
  cachedToken = { token: String(body.access_token), expiresAt: now + Number(body.expires_in || 3600) };
  return cachedToken.token;
}

export interface GoogleSheetTable {
  headers: string[];
  rows: SheetSyncRow[];
}

/** Reads the first row as headers and each following row as source-column values. */
export async function readGoogleSheet(spreadsheetId: string, tabName: string): Promise<GoogleSheetTable> {
  const account = googleServiceAccount();
  if (!account) {
    throw new Error('Google Sheets is not configured. Add GOOGLE_SERVICE_ACCOUNT_JSON for the Soleox service account.');
  }
  const tab = tabName.trim() || DEFAULT_SHEET_TAB;
  const range = `'${tab.replace(/'/g, "''")}'!A:ZZ`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
  const token = await accessToken(account);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || 'The spreadsheet could not be read.';
    throw new Error(message);
  }
  const values: unknown[][] = Array.isArray(body.values) ? body.values : [];
  if (values.length === 0) return { headers: [], rows: [] };

  const headers: string[] = [];
  const seen = new Map<string, number>();
  (values[0] || []).forEach((cell) => {
    const header = String(cell ?? '').trim();
    if (!header) return;
    const count = seen.get(header.toLowerCase()) || 0;
    seen.set(header.toLowerCase(), count + 1);
    headers.push(header);
  });
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([header]) => header);
  if (duplicates.length > 0) {
    throw new Error(`These column headers appear more than once: ${duplicates.join(', ')}.`);
  }

  const headerIndex = new Map<string, number>();
  (values[0] || []).forEach((cell, index) => {
    const header = String(cell ?? '').trim();
    if (header) headerIndex.set(header, index);
  });

  const rows: SheetSyncRow[] = [];
  values.slice(1).forEach((line, offset) => {
    const cells: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header) => {
      const index = headerIndex.get(header) ?? -1;
      const value = index >= 0 ? repairImportedText(String(line?.[index] ?? '').trim()) : '';
      if (value) hasValue = true;
      cells[header] = value;
    });
    if (!hasValue) return;
    rows.push({ rowNumber: offset + 2, cells });
  });
  return { headers, rows };
}
