# Releasing

## Process

1. **One PR bumps the version** in `.claude-plugin/plugin.json` **and** `.claude-plugin/marketplace.json`, plus any README prose that names the version. Conventional title, squash-merge. The `manifests parse` CI job blocks drift between the two manifests.
2. **Merge to main.** At this moment the release is live for users — marketplace installs clone the default branch, and `hooks/check-update.sh` starts advertising the new version.
3. **Tag the merged commit:**

   ```bash
   git checkout main && git pull
   git tag -a v1.13.0 -m "maestro 1.13.0"
   git push origin v1.13.0
   ```

   or, equivalently, use the built-in helper (it validates manifest parity first and produces a `maestro--v1.13.0` tag — both schemes are accepted):

   ```bash
   claude plugin tag --push
   ```

4. **`release.yml` does the rest:** asserts the tag matches both manifests **and** the version main currently ships, asserts the tag is an ancestor of main, re-runs the full test suite at the tagged commit, then publishes a GitHub Release with generated notes.

## Why bump-then-tag, in that order

Claude Code marketplaces install from the **default branch** — the local plugin cache clones the repo and records version + commit SHA; nothing resolves tags or releases. `hooks/check-update.sh` compares the user's installed version against raw `main`'s `plugin.json`. So `main` is the source of truth for "what version is available", and the tag is a post-hoc marker for humans, changelogs and archival. Tagging before main is bumped would advertise a version nobody can install; `release.yml`'s main-version assertion exists to make that mistake impossible.

## Notes on the mechanics

- Releases are **immutable** once published (repo setting): a botched release is fixed by shipping a new patch version, never by moving the tag.
- One version, one release: pushing both `v1.13.0` and `maestro--v1.13.0` publishes only once — the publish job guards by version, not tag name.
- Prerelease tags (`v1.13.0-rc.1`) are out of scope by design; nothing fires on them.
- Release-notes categories come from PR labels (`.github/release.yml`): `upstream-update` PRs are grouped separately; label a PR `ignore-for-release` to keep it out of the notes.
