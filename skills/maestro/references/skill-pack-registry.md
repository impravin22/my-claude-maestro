# Skill Pack Registry — Domain Packs & the Deliverable Flow

Read this **only when CLASSIFY routes to a non-engineering domain**. Engineering tasks never need it — the standard 10-step flow in `SKILL.md` covers them.

Install commands and degradation rules for every pack live in `ecosystem.md`.

## The Deliverable flow

Non-code deliverables — marketing copy, social posts, financial analysis, contract review: anything producing content or analysis rather than a repo diff — run a shortened flow:

```
CLASSIFY → CONTEXT7 (only if tool libraries are involved)
         → BRAINSTORM → PLAN (lightweight)
         → DRAFT using the domain pack's skills
         → VERIFY (Evidence Gate + the domain gate below)
```

Steps 5 (UI mockup), 7 (TDD), 8.5, 9 and 10 (git/PR) apply only when the deliverable is code or lands in a repo. Step 6 (SECURITY) applies whenever the task touches credentials, customer data, or PII — **regardless of domain**.

**Mixed tasks split.** "Build the landing page and write the launch email" = the engineering flow owns the repo diff, the Deliverable flow owns the email. Each half passes its own gates.

**Model tier on this flow:** `opus` throughout; dispatch the domain gate's final judgement (legal risk, financial variance interpretation, pricing strategy) on `fable` per `model-routing.md`.

## Universal gates for deliverables

These apply to every domain below:

- **Publishing needs approval.** Anything that posts, sends, schedules, or files needs explicit human approval immediately before the side-effectful step. Drafting is free; publishing is not.
- **Evidence Gate still applies** (Step 8.0). No "done" without the artefact.
- **Brand check.** If `brand-guidelines` is installed, check any outward-facing draft against it.

## Domain packs

### Marketing — `marketing-skills` (50 skills, MIT)

Copywriting, seo-audit, ai-seo, programmatic-seo, schema, site-architecture, cro, lead-magnets, launch, pricing, offers, ads, ad-creative, emails, cold-email, sms, referrals, onboarding, paywalls, popups, marketing-psychology, competitors, customer-research, and more.

- **Gate:** brand check + publish approval (above).
- **Caveat:** install only from the canonical `coreyhaines31/marketingskills` slug — copycat forks with identical descriptions circulate.

### Social media — `social-media-skills` (17 skills, MIT)

voice-builder, post-writer, post-formatter, post-scorer, hook-generator, quote-post, reels-scripting, youtube-thumbnail, graphic-designer, gemini-carousel, gemini-infographic, newsletter-voice, niche-research, profile-optimizer, content-matrix, analytics-dashboard, pinned-comment.

- **Gate — voice:** a `voice-builder` profile (`about-me.md` + `voice.md`) must exist before any author-voice content. Without it, outputs carry the pack author's own branding and CTAs. Run `voice-builder` first or flag this explicitly.
- **Gate — cost:** `reels-scripting` and `post-scorer` call paid third-party APIs (Apify, Google Gemini — API keys required, roughly $0.50/run for post-scorer) and `post-scorer` scrapes LinkedIn via a third party, which is ToS-grey. **Surface the cost and the scraping to the user before running either.**
- **Caveat:** `niche-research` drives the user's logged-in browser sessions across Reddit, X, and Google.

### Finance — `finance` (8 skills, Apache-2.0, Anthropic first-party)

financial-statements, reconciliation, variance-analysis, close-management, journal-entry, journal-entry-prep, audit-support, sox-testing.

- **Gate:** every figure traces to source data. No invented numbers. Estimates labelled as estimates, with the basis stated.

### Small business — `small-business` (31 skills, Apache-2.0, Anthropic first-party)

cash-flow-snapshot, plan-payroll, invoice-chase, tax-prep, month-end-prep, close-month, margin-analyzer, price-check, lead-triage, crm-cleanup, customer-pulse, handle-complaint, ticket-deflector, run-campaign, job-post-builder, quarterly-review, monday-brief, friday-brief, and more.

- **Gate:** pre-1.0 (v0.3.0) and drives money-adjacent workflows (payroll, invoicing, tax). Every money-touching or customer-touching step keeps a human approval step. Treat as high-trust automation.

### Legal — `legal` (9 skills, Apache-2.0, Anthropic first-party)

review-contract, triage-nda, compliance-check, legal-risk-assessment, brief, legal-response, meeting-briefing, signature-request, vendor-check.

- **Gate:** outputs are **drafts for counsel review, never legal advice**. Say so in the deliverable itself, not just in chat.

### Leadership & delivery — installed packs first, then `leadership-skills` / `pm-claude-skills`

Covers five jobs. **Route to what is already installed before installing anything** — an audit of a fully-provisioned setup found the PM packs installed but never invoked, because nothing routed to them.

| Job | Route to (installed) | Install only if the gap below bites |
| --- | --- | --- |
| Write a Jira ticket | `pm-execution:user-stories` / `wwas` / `write-stories` for craft (3 C's, INVEST, testable AC); `atlassian:spec-to-backlog`, `capture-tasks-from-meeting-notes`, `triage-issue` to create it | Craft and pipe never touch: pm-execution emits markdown and is Jira-blind, atlassian needs a Confluence page, meeting notes, or an existing bug. No path from a bare idea to a created ticket → `pm-delivery:user-story-writer` (pm-claude-skills, pinned — installed by default); `jira-expert` (the `pm-skills` plugin inside alirezarezvani/claude-skills, not installed by default) |
| Summarise tickets | `atlassian:generate-status-report` (multi-query JQL, exec tier, RAG status), `jira-sprint-dashboard-canvas` (read-only by default) | **Saturated — install nothing.** Five installed surfaces already claim this phrasing. Only residue is cross-sprint delta; not worth a plugin |
| Organise thoughts | `superpowers:brainstorming` → `writing-plans` for anything feature-shaped | brainstorming is hard-gated into code and terminates in `writing-plans`; it will turn a quarter-planning dump into a design doc. For non-feature dumps → `decision-making:decision-memo`, `communication:bluf-communication` |
| Identify opportunities | `pm-execution:prioritization-frameworks` (Opportunity Score = Importance × (1 − Satisfaction)), `outcome-roadmap`, `engineering:tech-debt` | All frames, no scanners — they rank a list you already wrote. For discovery → `pm-product-discovery:opportunity-solution-tree` (Torres); for engineering-org leverage → `vpe-advisor` |
| Translate shipped code for execs | `example-skills:internal-comms` for register only | **Largest genuine gap.** internal-comms reads Slack/Drive, never git; `release-notes` targets customers. A grep for brag doc / promotion packet / self-review / performance review across a full install returns zero hits → `communication:reframe-for-execs` plus the `performance-management` cluster (both installed by default); `pm-career:brag-doc` (pm-claude-skills, pinned — installed by default; see Caveats) |

**Packs, all MIT:**

- **`leadership-skills`** (PierrickMartos marketplace; the installable plugins are `communication`, `performance-management`, `decision-making`, plus `hiring`/`learning` to taste; 13 skills) — write-performance-review, calibrate-talent, write-self-review, assess-career-growth, difficult-conversations, communication-coach, escalate-without-drama, bluf-communication, reframe-for-execs, decision-memo, adversarial-review; plus screen-candidate-for-hm-call (`hiring`) and learn-deeply (`learning`), whose bundles install.sh leaves to taste. Task-and-artefact shaped: each ends in a deliverable with a fixed contract.
- **`pm-claude-skills`** (mohitagw15856) — `pm-delivery`, `pm-people`, `pm-career`, `pm-comms` only, never the whole marketplace, and **pinned to a reviewed commit** rather than tracked at its default branch. Fills what the others leave: 1:1 prep, delegation briefs, feedback (SBI + Radical Candor), brag-doc, promotion packets, team-health checks.
- **`pm-product-discovery`** (phuryn, 13 skills) — the discovery pack most `pm-skills` users do not have; opportunity-solution-tree, identify/prioritize-assumptions, brainstorm-experiments.
- **`c-level-skills`** (alirezarezvani, repo directory `c-level-advisor`) — vpe-advisor, chro-advisor, org-health-diagnostic, decision-logger. `executive-mentor` is a sibling plugin, installed separately. Persona-and-diagnostic shaped; ships stdlib-only Python analysis tools.

**Gates:**

- **Impact claims trace to artefacts.** Every business-impact statement in an exec write-up names the PR, commit, metric, or ticket behind it. Unattributed impact is the failure mode of this whole domain — these skills will happily generate a confident number nobody can source. This is the Evidence Gate (Step 8.0) applied to narrative, and it is not optional because the output is not code.
- **Jira writes need approval.** `createJiraIssue`, `editJiraIssue` and `transitionJiraIssue` are side-effectful against a shared team board. Draft freely; get explicit approval immediately before the write. Read-only by default.
- **People data is PII.** Performance reviews, PIPs, calibration notes and 1:1 records name real employees. Never commit them to a repo, never paste them into a third-party API, never write them to a shared path. Step 6 SECURITY fires on any task in this cluster regardless of domain.
- **Exec updates are outward-facing.** Publish approval (above) applies before anything reaches leadership.

**Caveats:**

- **The `pm-claude-skills` provenance badge is false.** Its README badge claims listing in Anthropic's official plugin directory; the badge links to an anchor in its own README, and the live 278-plugin manifest has no such entry. The content is sound — the four leadership bundles carry zero network calls — so maestro ships it **pinned to a reviewed commit** rather than excluding it. `claude plugin marketplace add` cannot pin (it always resolves the default branch), so `install.sh` clones the reviewed commit to `~/.claude/pinned/pm-claude-skills` and registers that path. `verify_pinned_sha` fails closed if the checkout sits at another commit **or has local modifications** — `git checkout` over a dirty tree keeps the edit, so HEAD alone is not the guarantee — and `is_ephemeral_path` refuses to register the marketplace at all when the pin directory sits under a temporary root, because that absolute path is recorded in the global registry and a throwaway `HOME` leaves it pointing at a directory that later vanishes. In each case the pack is skipped and the run exits non-zero. Moving the pin means re-reviewing, not just bumping a string.
- **Two different repos are called "pm-skills".** `phuryn/pm-skills` is the well-known one; `pm-claude-skills` instructs users to search `pm-skills` in `/plugin`. Check the author before installing.
- **Excluded on licence, deliberately.** `deanpeters/Product-Manager-Skills` is CC BY-NC-SA — strong content, but the NonCommercial clause is unresolved for use inside a commercial employer. `htk007/claude-skills-for-leaders` and `shaik41/em-skills-claude-code` ship no LICENSE file at all, which defaults to all-rights-reserved.

### Documents & artefacts — `example-skills` (+ optional `document-skills`)

web-artifacts-builder (claude.ai artifacts — note the name; "artifacts-builder" does not exist), doc-coauthoring, canvas-design, algorithmic-art, slack-gif-creator, theme-factory. Office formats (docx, pdf, pptx, xlsx) live in the separate `document-skills` plugin.

- **Caveat:** `document-skills` content is source-available, **not** open source — check the terms before redistributing or modifying it.

### Brand & comms — `example-skills`

brand-guidelines, internal-comms.

- Consumed as the brand gate for every other domain's outward-facing drafts.

## Connector caveat (finance / small-business / legal)

Each knowledge-work plugin ships a `.mcp.json` pre-wiring hosted third-party MCP connectors:

| Plugin | Connectors |
| --- | --- |
| finance | Snowflake, Databricks, BigQuery, Slack, Gmail, Google Calendar |
| legal | Slack, Box, Egnyte, Atlassian, DocuSign |
| small-business | QuickBooks, PayPal, HubSpot, Canva, DocuSign, Slack |

Connectors stay dormant until OAuth-approved, and several ship empty placeholder URLs needing manual configuration. **Review them before any org-wide rollout** — installing the plugin is what puts the OAuth prompts in front of users.

These plugins are built primarily for Claude Cowork ("also compatible with Claude Code"); their auth flows assume Cowork-style connectors.

## Precedence

Domain packs are **voices, not conductors**. They supply expertise inside whichever flow CLASSIFY selected; they never replace the maestro skeleton, and they never override a maestro gate (security, accessibility, evidence).

On topical overlap between an Everything Claude Code user-scope skill and a registry plugin (e.g. ECC's `seo` vs marketing-skills' `seo-audit`), prefer the plugin-scope registry skill and treat the ECC one as a second opinion.
