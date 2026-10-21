import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // The full tab title, as PageTitle sets it after load, so the tab reads the same from the first paint.
  return { title: { absolute: `Soleox REBI > ${id === 'new' ? 'New Transaction' : 'Transaction Detail'}` } };
}

export default function TransactionDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
