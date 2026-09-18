// app/(dashboard)/layout.tsx

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // Redirect to sign-in page if no active session exists
  if (!session?.user) {
    redirect('/api/auth/signin'); // or your custom /login page
  }

  return <>{children}</>;
}