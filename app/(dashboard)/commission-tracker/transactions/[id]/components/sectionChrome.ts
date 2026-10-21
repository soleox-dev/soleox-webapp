// Transaction Detail's three sections (Overview, Commission Waterfall, Payments Breakdown) on a phone:
// no card around them, so the content gets the whole width inside the page gutter. Each heading becomes
// a band across the full screen, which marks where a section starts now that the card no longer does.

/** On the section element. */
export const SECTION_SHELL_PHONE = 'max-sm:overflow-visible max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:shadow-none dark:max-sm:bg-transparent';

/** On the section's heading row, and on any band that should run edge to edge the same way. */
export const SECTION_BAND_PHONE = 'max-sm:-mx-4 max-sm:px-4 max-sm:border-y max-sm:bg-white dark:max-sm:bg-slate-800';

/** On the section's content, which drops its side padding: the page gutter is enough. */
export const SECTION_BODY_PHONE = 'max-sm:px-0';
