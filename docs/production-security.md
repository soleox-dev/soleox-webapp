# Production security

Work through this list in the order below. Times are development time before the first production deploy.

## Must

| Order | Priority | Item | Time | Status |
| --- | --- | --- | --- | --- |
| 1 | High | Use only the client chosen for the session. Ignore a client id in the body, query, or header. A person in two brokerages cannot aim a request at the other one without switching. | 1 day | Done |
| 2 | High | Super admin comes only from `web_users.is_super_admin`. Remove the hardcoded email so access can be turned off without a deploy. | 1 hour | Done |
| 3 | High | Return a short error to the browser. Keep database details in the server log. | Half a day | Done |
| 4 | High | Send HSTS, a content security policy, a frame rule, and a referrer policy. | Half a day | Done |
| 5 | High | Confirm `SUPABASE_SERVICE_ROLE_KEY` and `GOOGLE_SERVICE_ACCOUNT_JSON` are read only on the server. | 1 hour | Done |
| 6 | Medium | End the session after a workday of inactivity and require sign-in again. | 3 hours | Done |

## Nice to have

| Order | Priority | Item | Time | When |
| --- | --- | --- | --- | --- |
| 7 | Medium | Limit how often sync and write routes can be called. | Half a day | Done |
| 8 | Medium | Record who changed a permission, a template, a transaction, or a sync, and who exported or deleted a client’s data. | 2 days | Done |
| 9 | Low | Export or delete one client’s rows when that client leaves. | 1 day | Nice until a client leaves. |

The session ends after 12 hours without a request. Signing in again starts a new one. Super admin is the `is_super_admin` flag on `web_users`. Clearing that flag removes the access on the next load. The service role key lives in `lib/supabase-admin.ts`. The Google service account JSON is read in `lib/google-sheets.ts`. Neither name is public to the browser.

A brokerage can start Sync with TMS once every 15 seconds, and at most 30 times an hour. Any other create, update, or delete is limited to 300 requests a minute for that person on that brokerage. The scheduled hourly sync is separate and does not use this limit. The count is kept in the server process.

Activity is stored in `audit_events` and listed under Commission Tracker Settings. Each row names the person, the action, and the record. Scheduled sync is recorded as `scheduled sync`. Export uses the same log when a brokerage’s data is exported. There is no export in the app until that action is built.

## Production setup

These are done on launch day, not in the application code.

| Priority | Item | Time |
| --- | --- | --- |
| High | A separate production database and keys. Remove the demo book before the first real client. | Part of launch day |
| High | Multi-factor sign-in on the Google and Microsoft accounts that can sign in. The app cannot force this. | About 30 minutes in those accounts |
| High | Daily backups on Supabase, and one restore test. | About 2 hours |
