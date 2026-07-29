# Fable ↔ Opus head-to-head — 2026-07-29

**Date:** 2026-07-29
**Status:** Approved — re-tier shipped in v1.12.0
**Version:** maestro 1.12.0

Backing evidence for the v1.12.0 re-tier in `skills/maestro/references/model-routing.md`.

## Question

`model-routing.md` assigned six work types to `fable`. That assignment was made when Fable led Opus by a wide margin and was never re-measured after both families shipped new generations. The premium tier was being spent on a gap nobody had checked still existed.

Narrow question: **on the rows where `fable` is assigned for generation quality, is there a measurable difference from `opus`?**

## Method

Three rows under test — architecture, planning, root-cause analysis.

Three rows excluded, for two different reasons that should not be run together:

- **Security adjudication and review arbitration** are adjudication seats, not generation seats. The generator/judge asymmetry argues for premium there structurally, independent of any measured quality gap.
- **High-stakes domain judgement** (legal risk, financial variance, pricing) *is* a generation task, and excluding it needs its own justification: its failure cost lands outside the repo, so repo-grounded prompts cannot measure what actually matters about it. This is the weakest exclusion in the design and should be treated as a gap, not a decision.

The run:

- **6 prompts**, two per row, all grounded in this repo so answers were checkable rather than plausible-sounding.
- **12 generator runs** — each prompt issued verbatim to both tiers, `model:` the only difference.
- **12 judgements** — each of the 6 pairs judged twice, once by a `fable` judge and once by an `opus` judge. Two judges because a single `fable` judge finding for `fable` would have been worthless. No judgement was discarded; all 12 appear below. (Total agent dispatches for the experiment: 24 — 12 generators plus 12 judges.)
- **Blinding** — outputs anonymised to A/B with the tier↔letter map varied per prompt, so position carried no signal.
- **Judging weighted on verifiable ground truth where it existed.** Judges were required to open every cited `file:line` and count false positives rather than assess plausibility. This control was strong on P5 and P6, which had checkable answers by construction, and weak on P1–P4, which produce designs and plans carrying few checkable citations. See Threats.
- **Length was bounded but not capped.** The instruction said 600 words; outputs ran 536–664, so it was an instruction rather than an enforced cap. Per-tier means are reported below because the range alone does not rule out a confound.

## Results

| # | Task | Row | `fable` judge | `opus` judge | Agree | Outcome |
|---|---|---|---|---|---|---|
| P1 | Dual-domain CLASSIFY design | Architecture | fable | opus | ✗ | split |
| P2 | Skill-pack conflict resolution | Architecture | opus | fable | ✗ | split |
| P3 | `--dry-run` implementation plan | Planning | opus | opus | ✓ | **opus** |
| P4 | Step 5 hot-path split plan | Planning | fable | fable | ✓ | **fable** |
| P5 | README↔SKILL.md drift hunt | Root cause | fable | opus | ✗ | split |
| P6 | install.sh failure modes | Root cause | opus | opus *(clear)* | ✓ | **opus** |

- **Votes:** opus 7, fable 5.
- **Margins:** 11 of 12 recorded `narrow`; the single `clear` went to opus.
- **Inter-judge agreement: 3 of 6 pairs (50%)** — chance level on a binary choice.
- **Per row:** architecture 0–0 (both split), planning 1–1, root-cause 1–0 to opus with one split.

### Where the margin actually comes from

Splitting the vote by judge is the most important number in this document:

| Judge | picked fable | picked opus |
|---|---|---|
| `fable` | 3 | 3 |
| `opus` | 2 | 4 |

The `fable` judge shows **no self-preference** — dead even at 3–3. The `opus` judge leaned **4–2 toward its own family**, and that lean is the entire source of the headline 7–5. At n=6 a 4–2 split is not distinguishable from noise, but it cannot be waved away either: the only directional signal in the experiment was produced by the judge sharing a family with the winner.

Strip the possibly-biased judge and the remaining evidence is **3–3**. That does not rescue `fable`; it makes the null result *stronger*, because the cleanest judge in the set found nothing at all.

### Output length

| Tier | mean words | longer on |
|---|---|---|
| `fable` | 576 | 1 of 6 prompts |
| `opus` | 611 | 5 of 6 prompts |

`opus` ran ~6% longer and was the longer answer on five of six prompts. If judges rewarded thoroughness, this favours the tier that won. The effect is small and the sample tiny, but the honest position is that a length confound is **live, not excluded**.

## Conclusion

**Null result.** Six tasks cannot separate the two tiers on architecture, planning, or root-cause analysis. 7–5 across eleven narrow margins, with judges agreeing at chance level and the entire margin traceable to one possibly-biased judge, is noise rather than a ranking.

This does **not** show Opus is better. It shows no measurable difference — which is sufficient to stop paying a premium, because the premium was only ever justified by a gap.

## Decision

Demote architecture, planning, and root-cause analysis to `opus`. Keep security adjudication, review arbitration, and high-stakes domain judgement on `fable` — **not because they were measured**, but because they were not, and their failure cost is asymmetric. Each is a single call whose verdict propagates downstream, so the premium is cheap insurance rather than throughput spend.

The escalation rule (two failures on the same task → one retry on `fable`) is what makes an `opus`-by-default table safe: a genuine model ceiling still gets found, it just has to prove itself first.

## Threats to validity — read before citing this

1. **n=6, single trial per cell.** No repeats, so per-task variance is unseparated from tier effect. This is a directional signal, not a statistical result.
2. **The entire margin comes from one judge, and it is the judge whose family won.** See "Where the margin actually comes from". This confound happens to reinforce the null rather than undermine it, but any future reading of these numbers must decompose by judge rather than cite 7–5.
3. **A length confound is live.** `opus` averaged 6% longer and was longer on 5 of 6 prompts. Not controlled for.
4. **The ground-truth control covered 2 of 6 prompts.** P5 and P6 had checkable answers; P1–P4 produced designs and plans where "count the false citations" has little to bite on. The strongest control was weakest on the four prompts that generated three of the four non-unanimous outcomes.
5. **Judges are LLMs.** The ground-truth weighting and two-judge design mitigate but do not remove judge error. The 50% agreement rate is itself evidence that judging this was hard.
6. **Tasks all come from one repo**, and a small documentation-heavy one. Results may not transfer to large codebases, unfamiliar domains, or long-horizon agentic work.
7. **Adjudication was never tested.** The three rows still on `fable` have no evidence either way. Their assignment is an unmeasured default, exactly like the one this experiment replaced, and should get its own head-to-head before anyone trusts it. High-stakes domain judgement in particular is a *generation* row excluded from a generation experiment — the justification for that exclusion is real but it is not the same justification as the other two.
8. **A pre-registered stopping rule was violated, deliberately and with sign-off.** Before running, the bar was "only demote on a clean sweep, never a split." No row swept. Demoting on indistinguishability is a different and defensible rule — do not pay a premium for an unmeasurable difference — but it was adopted *after* seeing the data, which is exactly the move that makes results unreliable. It was surfaced and approved rather than applied silently. Weigh this finding accordingly.

## Byproducts

The experiment's real yield was not the tiering answer. Two prompts turned up live defects, both fixed in [#40](https://github.com/impravin22/my-claude-maestro/pull/40):

- **P6** found a crash in `install.sh` — an empty `INSTALLED` array under `set -u` aborted the summary on bash 3.2, reproduced live by two independent judges and then by hand.
- **P5** found four README↔source contradictions, including a wrong marketplace slug that made a documented install command fail, plus the structural cause: `track-upstream.yml` named every file but `README.md` in its maintainer checklists.

Adversarial repo-grounded prompting found real bugs more reliably than it ranked models.
