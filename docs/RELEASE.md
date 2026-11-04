# Reza Desk: Release Process

Every release is small, reviewed, tested and reversible. Nothing is pushed without the owner's explicit approval.

## 1. Before changing code

1. Run `git pull` and confirm the working tree is clean and `main` equals `origin/main`.
2. Work on a branch.
3. For a bug fix, write the regression test first. It must **fail** on the current version.

## 2. Version bump (only when an app file changes)

An app file is `index.html`, `sw.js`, `manifest.webmanifest`, `js/*.js`, `fonts/*`, an image, or `qr.js`.
Changes to `tests/` or `docs/` alone need **no** bump: the app never loads them.

Use the version tool (v4.41, WP-5); it edits files only and never commits, pushes or deploys:

```
node tools/version.js check          # every place and whether they agree
node tools/version.js set X.Y --dry  # what would change
node tools/version.js set X.Y        # write the numbers (refuses a version that is not higher)
```

| Place | Written by the tool |
|---|---|
| `index.html` `const APP_VER='X.Y'` | yes |
| `js/*.js` `const <NAME>_VER='X.Y'` (every part in `APP_PARTS`) | yes |
| `sw.js` `const V='miz-kar-vX.Y'` (the cache name) | yes |
| `version.json` `{"v": "X.Y"}` | yes |
| `index.html`: one new group `['X.Y',[…]]` at the top of `WHATS_NEW` (Persian, user-facing) | no — words; `check` fails until it exists |
| `HANDOFF.md`: a `## vX.Y` section | no — words; `check` fails until it exists |

`tests/00-static.test.js` fails if the versions disagree; `tests/69-…` tests the tool itself.

## 3. Verification before push

1. `sh tests/run.sh` must pass in full (about 6 minutes). Record the output for the exact commit.
2. Review `git diff` for:
   - unrelated changes
   - real names, phone numbers, amounts, keys or tokens
   - new network dependencies in app files
3. Show the owner:
   - the commit hash
   - the changed files
   - the test output
   - known limitations
   - the rollback plan

## 4. Publish (after approval)

1. Fast-forward `main` to the reviewed commit and `git push` (never force-push).
2. GitHub Pages republishes the repository root, usually within a few minutes **[unverified timing]**.
3. Deployment evidence: the phone shows «نسخهٔ X.Y» under the page title after an online launch. The app checks `version.json` at launch and when it becomes visible (`checkUpdate()`).

## 5. Phone verification (for app-file releases)

Short checks, with no real data changed:

1. The version line shows X.Y.
2. The feature that changed behaves as specified.
3. Airplane mode → close the app fully → reopen. It opens with its data.

## 6. Rollback

The app updates only to a **higher** version (`checkUpdate()` compares version numbers). So a rollback is always **forward**:

1. `git revert <commit>`
2. bump to the next version (section 2)
3. test, then push

Never move `main` backwards.

**Data:** releases do not change stored data unless a separately approved migration says so. In that case the migration needs its own recovery plan.
