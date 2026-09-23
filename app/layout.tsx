// app/layout.tsx

import type { Metadata } from 'next';
import { AuthProvider } from '@/components/auth-provider';
import { Providers } from './providers';
import Navbar from '@/components/Navbar';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Soleox REBT',
    template: '%s | Soleox REBT',
  },
  description: 'Soleox Real Estate Business Tracker',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
};

// Immediate blocking script to apply dark class and set document background color before browser paint
const themeInitializerScript = `
  (function() {
    try {
      var savedTheme = localStorage.getItem('soleox-theme');
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var mode = (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system')
        ? savedTheme
        : 'system';
      var isDark = mode === 'dark' || (mode === 'system' && prefersDark);

      if (isDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.style.backgroundColor = '#0f172a';
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.style.backgroundColor = '#f1f5f9';
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          id="theme-initializer"
          dangerouslySetInnerHTML={{ __html: themeInitializerScript }}
        />
      </head>
      <body className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
        <AuthProvider>
          <Providers>
            <Navbar />
            {children}
          </Providers>
        </AuthProvider>
      </body>
    </html>
  );
}