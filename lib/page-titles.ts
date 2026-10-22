import type { Metadata } from 'next';

/** Browser tab title for a route, without the Soleox REBI prefix. */
export function titleForPath(pathname: string): string | null {
  const path = pathname.split('?')[0].replace(/\/$/, '') || '/';

  if (path === '/') return 'Home';
  if (path.startsWith('/owner-reports')) return 'Owner Reports';
  if (path.startsWith('/agent-reports')) return 'Agent Reports';
  if (path.startsWith('/office-reports')) return 'Office Reports';
  if (path === '/login') return 'Sign In';
  if (path === '/select-client') return 'Choose a Client';
  if (path === '/no-access') return 'No Access';
  if (path === '/commission-tracker/transactions') return 'Transactions';
  if (path === '/commission-tracker/transactions/new') return 'New Transaction';
  if (path.startsWith('/commission-tracker/transactions/')) return 'Transaction Detail';
  if (path.startsWith('/commission-tracker/agents')) return 'Agents';
  if (path.startsWith('/commission-tracker/settings/fields')) return 'Fields';
  if (path.startsWith('/commission-tracker/settings/transaction-view')) return 'Views';
  if (path.startsWith('/commission-tracker/settings/integrations')) return 'TMS Integrations';
  if (path.startsWith('/commission-tracker/settings/scorecards')) return 'Scorecards';
  if (path.startsWith('/commission-tracker/settings/commission-entities')) return 'Commission Entities';
  if (path.startsWith('/commission-tracker/settings/commission-templates/') && path !== '/commission-tracker/settings/commission-templates') {
    return 'Commission Template';
  }
  if (path.startsWith('/commission-tracker/settings/commission-templates')) return 'Commission Templates';
  if (path.startsWith('/commission-tracker/settings/commission-plans')) return 'Commission Plans';
  if (path.startsWith('/commission-tracker/settings/caps') || path.startsWith('/commission-tracker/settings/team-caps')) return 'Caps';
  if (path.startsWith('/commission-tracker/settings/lists')) return 'Dropdown Lists';
  if (path.startsWith('/commission-tracker/settings/commission-rules')) return 'Commission Rules';
  if (path.startsWith('/commission-tracker/settings/activity')) return 'Activity';
  if (path.startsWith('/commission-tracker/settings/agent-allocations')) return 'Agent Allocations';
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
