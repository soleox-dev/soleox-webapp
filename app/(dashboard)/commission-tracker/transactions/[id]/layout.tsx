import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: id === 'new' ? 'New transaction' : 'Transaction detail' };
}

export default function TransactionDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
