/** Side inset for every page. The content edges match the Owner Reports filters card. */
export const pageFrame = 'mx-auto w-full max-w-[1600px] px-4 md:px-6';

/** Data pages (Transactions, Agents, reports) use the full screen width with the same side inset. */
export const widePageFrame = 'w-full px-4 md:px-6';

/** True for the data pages that use `widePageFrame`, so the top navigation lines up with them. */
export function isWidePagePath(pathname: string): boolean {
  return pathname === '/commission-tracker/transactions'
    || pathname === '/commission-tracker/agents'
    || pathname.startsWith('/owner-reports')
    || pathname.startsWith('/agent-reports')
    || pathname.startsWith('/office-reports');
}
