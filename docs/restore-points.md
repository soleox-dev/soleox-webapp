# Restore Points

## restore/pre-commission-redesign-2026-10-24

The whole app as it stood before the commission model redesign (`docs/commission-model-redesign.md`): commit
`d9d4460` on `ui-refresh`, tagged and pushed to GitHub.

### Code

See what changed since the restore point:

```bash
git diff restore/pre-commission-redesign-2026-10-24 --stat
```

Run the old version beside the current one, without touching any branch:

```bash
git worktree add ../soleox-restore restore/pre-commission-redesign-2026-10-24
```

Put a branch back to it (rewrites that branch; push with `--force-with-lease` only after everyone agrees):

```bash
git switch ui-refresh && git reset --hard restore/pre-commission-redesign-2026-10-24
```

Or undo the redesign's commits as new commits, keeping history:

```bash
git revert --no-edit restore/pre-commission-redesign-2026-10-24..HEAD
```

### Database

Git holds the schema migrations (`db/migrations/001` through `080`), not the data. The redesign's data migration
rewrites saved commission lines, templates, caps and plans, so take a database backup first:

- **Supabase dashboard:** Database > Backups. Confirm a daily backup exists from after 2026-10-24, or download one
  (Point-in-Time Recovery restores to any moment on paid plans).
- **Or a dump:** install the Supabase CLI and run `supabase db dump --data-only -f backup-2026-10-24.sql` (plus
  `supabase db dump -f schema-2026-10-24.sql`) against the project.

To restore: restore the backup in the dashboard (or load the dump into a fresh database), then deploy the code at the
restore tag. TATH's data can also be re-uploaded from its source files.

No redesign migration is applied to the database until that backup is confirmed.
