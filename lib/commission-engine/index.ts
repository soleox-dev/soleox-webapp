/**
 * The commission waterfall engine. Pure functions: deal, template, parameters, caps, ledger, overrides and lookups
 * in; commission lines, team cap and sales volume allocations, payments and a per-number explanation out.
 * Safe to run on the server. Which value wins when saved lines, a typed split and the template disagree:
 * lib/commission-engine/README.md.
 */
export * from './model';
export * from './template';
export * from './stored-lines';
export * from './waterfall';
export * from './allocation';
export * from './submit';
export * from './save';
export * from './deal';
export * from './drift';
export * from './plans';
export * from './plan-presets';
export * from './plan-rows';
export * from './plan-template';
export * from './plan-waterfall';
