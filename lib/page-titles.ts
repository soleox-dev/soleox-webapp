import type { Metadata } from 'next';

/** Browser tab title for a route, without the Soleox REBT prefix. */
export function titleForPath(pathname: string): string | null {
  const path = pathname.split('?')[0].replace(/\/$/, '') || '/';

  if (path === '/') return 'Main Menu';
  if (path === '/login') return 'Sign In';
  if (path === '/commission-tracker/transactions') return 'Transactions';
  if (path === '/commission-tracker/transactions/new') return 'New Transaction';
  if (path.startsWith('/commission-tracker/transactions/')) return 'Transaction Detail';
  if (path.startsWith('/commission-tracker/settings/fields')) return 'Field Customizations';
  if (path.startsWith('/commission-tracker/settings/transaction-view')) return 'Transactions: Default View';
  if (path.startsWith('/commission-tracker/settings/scorecards')) return 'Transactions: Scorecards';
  if (path.startsWith('/commission-tracker/settings/agents')) return 'Agents';
  if (path.startsWith('/commission-tracker/settings/commission-entities')) return 'Commission Entities';
  if (path.startsWith('/commission-tracker/settings/commission-templates/') && path !== '/commission-tracker/settings/commission-templates') {
    return 'Commission Template';
  }
  if (path.startsWith('/commission-tracker/settings/commission-templates')) return 'Commission Templates';
  if (path.startsWith('/commission-tracker/settings/lists')) return 'Dropdown Lists';
  if (path.startsWith('/commission-tracker/settings/commission-rules')) return 'Commission Rules';
  if (path.startsWith('/commission-tracker/settings')) return 'Settings';
  if (path.startsWith('/goals/settings')) return 'Goals Settings';
  if (path.startsWith('/goals')) return 'Goals';
  if (path.startsWith('/leads/settings')) return 'Leads Settings';
  if (path.startsWith('/leads')) return 'Leads';
  if (path.startsWith('/operating-expenses/settings')) return 'Operating Expenses Settings';
  if (path.startsWith('/operating-expenses')) return 'Operating Expenses';

  return null;
}

export function pageMetadata(page: string): Metadata {
  return { title: page };
}
