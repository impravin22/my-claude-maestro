## What

<!-- One or two sentences. The PR title is the squash-commit subject and the
     release-notes line — make it conventional (feat:/fix:/docs:/ci:/…). -->

## Why

<!-- The problem this solves, and why this approach over the alternatives. -->

## Test evidence

<!-- Paste actual output, not "tests pass". -->

```
bash tests/install-smoke.sh
```

## Checklist

- [ ] `bash tests/install-smoke.sh` passes locally (output above)
- [ ] `shellcheck -S warning -e SC2294 install.sh` and `shellcheck -S warning tests/install-smoke.sh` are clean (if shell changed)
- [ ] Version bumped in **both** manifests + README prose (if release-worthy — see RELEASING.md)
- [ ] `SKILL.md` word count justified in the description (if the hot path grew — see CONTRIBUTING.md §3)
- [ ] README `Plugin Structure` tree updated (if root files changed)
- [ ] Prose is British English
