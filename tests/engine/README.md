# Commission engine golden tests

```bash
npm test
```

Each deal in `fixtures/<CLIENT>/deals` runs through the paths the screens use:

- The deal page's saved waterfall, both before and after the template replay loads.
- A split typed by hand.
- Resubmitting the template from the popup.
- The template button's and the Transactions list's out-of-date payments checks, with and without a saved
  `manual_split`.

Every number has to match `expected/<CLIENT>/<TXN>.json`. `callers.ts` does the wiring each screen does.

- `SYNTH` is made up (`npx tsx scripts/golden/build-synthetic.ts`).
- `TATH` holds 25 real deals, masked.
- Real clients are captured with `scripts/golden/capture-fixtures.browser.js`, which masks names, emails,
  addresses and free text in the browser, then split with
  `npx tsx scripts/golden/split-capture.ts <download>`.

## Expected results come from the code before the refactor

The expected files are written by the code at the `pre-engine-refactor` tag, never by the code under test. To add
fixtures, put them in place and generate their expected files from commit `03abf8f`. That commit is the tag plus
the first version of this harness.

```bash
git worktree add ../golden-baseline 03abf8f
cp -R tests/engine/fixtures/<CLIENT> ../golden-baseline/tests/engine/fixtures/
# The harness at 03abf8f reads each deal's own ledger; copy the client's shared ledger into every deal there.
node -e 'const fs=require("fs"),p=require("path"),r=process.argv[1],l=JSON.parse(fs.readFileSync(p.join(r,"shared.json"))).ledger;for(const f of fs.readdirSync(p.join(r,"deals"))){const q=p.join(r,"deals",f),d=JSON.parse(fs.readFileSync(q));d.ledger=l;fs.writeFileSync(q,JSON.stringify(d))}' ../golden-baseline/tests/engine/fixtures/<CLIENT>
(cd ../golden-baseline && npm ci && UPDATE_GOLDEN=1 npx vitest run)
cp -R ../golden-baseline/tests/engine/expected/<CLIENT> tests/engine/expected/
git worktree remove ../golden-baseline
npm test
```

Run `UPDATE_GOLDEN=1` on current code only when a number is meant to change, and say so in the commit.
