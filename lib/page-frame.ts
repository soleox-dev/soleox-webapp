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

/**
 * Phones get no cards: the screen is too narrow to spend on a card's border and padding inside the page gutter.
 * `phoneTitle` turns a page's title card into a plain heading on the page background.
 */
export const phoneTitle = 'max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none dark:max-sm:bg-transparent';

/**
 * `phoneSheet` turns a content panel (a table, a list, a settings group) into a sheet that runs edge to edge
 * across the screen, keeping its own padding and a rule above and below. Floating things (menus, dialogs),
 * the report filters, and small summary tiles keep their cards.
 */
export const phoneSheet = 'max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0 max-sm:shadow-none';
