// lib/supabase.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
}

/**
 * Standard Supabase client using the public anonymous key.
 * Used for public unauthenticated endpoints (if any).
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Creates an authenticated Supabase client for a specific user email
 * by minting a short-lived (5 min) JWT signed with SUPABASE_JWT_SECRET.
 * This ensures PostgreSQL Row Level Security (RLS) is strictly enforced.
 */
export function createAuthenticatedSupabaseClient(email: string): SupabaseClient {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    throw new Error(
      'Missing SUPABASE_JWT_SECRET environment variable. Please retrieve your JWT Secret from Supabase Dashboard > Project Settings > API > JWT Settings and add it to .env.local'
    );
  }

  const customToken = jwt.sign(
    {
      aud: 'authenticated',
      role: 'authenticated',
      email: email,
      sub: email,
    },
    jwtSecret,
    { expiresIn: '5m' }
  );

  return createClient(supabaseUrl!, supabaseAnonKey!, {
    global: {
      headers: {
        Authorization: `Bearer ${customToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Server-side helper that retrieves the current NextAuth session,
 * extracts the user's verified email, and returns an authenticated Supabase client.
 */
export async function getAuthenticatedSupabase(emailOverride?: string): Promise<SupabaseClient> {
  let email = emailOverride;

  if (!email) {
    const session = await getServerSession(authOptions);
    email = session?.user?.email || undefined;
  }

  if (!email) {
    throw new Error('Unauthorized: No active user session');
  }

  return createAuthenticatedSupabaseClient(email);
}
