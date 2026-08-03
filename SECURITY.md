# Security Policy

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private vulnerability reporting:

[Report a vulnerability](https://github.com/impravin22/my-claude-maestro/security/advisories/new)

You should receive a response within 7 days. Coordinated disclosure is appreciated — please allow a fix to ship before publishing details.

## Scope

Maestro is a Claude Code plugin. The attack surface worth your attention:

- **`hooks/check-update.sh`** — runs automatically on every SessionStart for every installed user. Anything that could make it execute remote content, block the session, or exfiltrate data is critical.
- **`install.sh`** — installs third-party plugins, MCP servers and skills onto a developer machine. Command injection, unpinned or typosquatted sources, and unsafe `eval` paths are in scope.
- **Skill content (`skills/maestro/`)** — prompt-injection vectors: instructions that could steer an agent into exfiltrating secrets, weakening security gates, or installing untrusted artefacts.
- **CI workflows (`.github/workflows/`)** — injection via untrusted interpolation, token over-scoping, supply-chain integrity of pinned actions.

## Out of scope

- Vulnerabilities in the ~20 upstream packs maestro composes (superpowers, Context7, claude-mem, …) — report those to their own maintainers. Maestro's exposure to them is tracked in `references/ecosystem.md` and the daily upstream tracker.
- Social-engineering scenarios that require the user to ignore Claude Code's own permission prompts.

## Supported versions

Only the latest released version is supported. The plugin updates from `main`, so fixes ship as a normal version bump — there are no backport branches.
