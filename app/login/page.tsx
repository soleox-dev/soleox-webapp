// app/login/page.tsx
'use client';

import { signIn } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { SoleoxLogo } from '@/components/ui/logo';

export default function LoginPage() {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  // Reset loading state when page mounts or when navigating back via browser history
  useEffect(() => {
    const resetLoading = () => setLoadingProvider(null);

    // Handles standard page mounts and browser back/forward cache restores
    window.addEventListener('pageshow', resetLoading);
    window.addEventListener('focus', resetLoading);

    resetLoading(); // Immediate reset on initial mount

    return () => {
      window.removeEventListener('pageshow', resetLoading);
      window.removeEventListener('focus', resetLoading);
    };
  }, []);

  const handleSignIn = async (providerId: string) => {
    setLoadingProvider(providerId);
    try {
      await signIn(providerId, { callbackUrl: '/commission-tracker/settings/fields' });
    } catch (error) {
      setLoadingProvider(null);
    }
  };

  return (
    <main className="min-h-screen w-full flex flex-col justify-center items-center bg-slate-950 text-slate-100 relative overflow-hidden px-4">
      {/* Background Glows */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md flex flex-col items-center relative z-10">
        
        {/* Exterior Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2.5 mb-2">
            <SoleoxLogo className="h-9 w-auto" />
            <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/80">
              REBT
            </span>
          </div>
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">
            Real Estate Business Tracker
          </p>
        </div>

        {/* Card Body */}
        <div className="w-full bg-slate-900/80 border border-slate-800 backdrop-blur-xl rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Welcome Back
            </h1>
            <p className="text-slate-400 text-sm mt-1.5">
              Authenticate using your verified corporate account to access your workspace.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3.5">
            {/* Google */}
            <button
              type="button"
              onClick={() => handleSignIn('google')}
              disabled={loadingProvider !== null}
              className="w-full h-12 px-4 rounded-xl font-medium text-slate-800 bg-white hover:bg-slate-100 transition-all duration-200 flex items-center justify-center gap-3 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loadingProvider === 'google' ? (
                <div className="w-5 h-5 border-2 border-slate-400 border-t-slate-800 rounded-full animate-spin" />
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span className="text-slate-900 font-semibold text-sm">
                    Continue with Google
                  </span>
                </>
              )}
            </button>

            {/* Microsoft */}
            <button
              type="button"
              onClick={() => handleSignIn('azure-ad')}
              disabled={loadingProvider !== null}
              className="w-full h-12 px-4 rounded-xl font-medium text-white bg-slate-800 hover:bg-slate-750 border border-slate-700 transition-all duration-200 flex items-center justify-center gap-3 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loadingProvider === 'azure-ad' ? (
                <div className="w-5 h-5 border-2 border-slate-500 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 23 23">
                    <path fill="#f35325" d="M1 1h10v10H1z" />
                    <path fill="#81bc06" d="M12 1h10v10H12z" />
                    <path fill="#05a6f0" d="M1 12h10v10H1z" />
                    <path fill="#ffba08" d="M12 12h10v10H12z" />
                  </svg>
                  <span className="text-white font-semibold text-sm">
                    Continue with Microsoft
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Security Footer */}
          <div className="mt-8 pt-6 border-t border-slate-800/80 text-center">
            <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Enterprise SSO & Row-Level Security Protected
            </p>
          </div>

        </div>
      </div>
    </main>
  );
}