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

## Universal gates for deliverables

These apply to every domain below:

- **Publishing needs approval.** Anything that posts, sends, schedules, or files needs explicit human approval immediately before the side-effectful step. Drafting is free; publishing is not.
- **Evidence Gate still applies** (Step 8.0). No "done" without the artefact.
- **Brand check.** If `brand-guidelines` is installed, check any outward-facing draft against it.

## Domain packs

### Marketing — `marketing-skills` (47 skills, MIT)

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
