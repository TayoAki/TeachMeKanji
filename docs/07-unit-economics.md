# Unit economics (COGS)

What it costs to serve one subscriber for a month, and what's left of the price. Prices are
as of November 2026: Railway, Anthropic (Claude) and Stripe list prices. Each paid plan's
credits are **derived** from its price and target margin (`creditsForMargin` in
`packages/core/src/billing.ts`), and a test keeps every plan at or above its target with all
credits spent: Builder 60%, Pro 80%.

Plans sit at the same price points as other AI app builders: Rork, a0.dev and Vibecode charge
$20 and $200 a month, Newly $25 (November 2026).

## Per subscriber, per month (worst case)

Worst case means a subscriber spends every included credit.

| | Builder $20 | Pro $200 |
|---|---:|---:|
| Target margin | 60% | 80% |
| Credits included (derived) | 99 | 610 |
| AI (all credits used, × $0.05) | $4.95 | $30.50 |
| Hosting (estimate, see below) | $2.00 | $2.00 |
| Payments (2.9% + $0.30 card, 0.7% Stripe Billing) | $1.02 | $7.50 |
| **Cost of goods sold** | **$7.97** | **$40.00** |
| **Gross margin** | **60.2%** | **80.0%** |

At half usage the margins are about 72% and 88%. What a credit buys: a new app is about 60–90
credits on Opus 5.5, a chat edit on Sonnet 5.5 usually 5–15. So Builder covers about one new app
plus a few edits a month, and Pro about eight new apps or sixty edits. One more credit on either
plan would break its target. Free keeps 100 credits once (about one app; up to $5 of AI per
sign-up, an acquisition cost).

**Tax:** prices include tax (Stripe Tax, inclusive, tax code `txcd_10103001`, SaaS business
use). With no tax registrations today, the whole price is revenue. Once you register somewhere,
tax comes out of the price there: at 20% VAT a $20 sale is $16.67 of revenue, which takes
Builder to about 52% and Pro to about 76% worst case, before Stripe Tax's own fee on taxed
transactions. Re-derive the credits then, or set the targets per region.

## The cost lines

### AI (built-in agent: Free and Pro only)

Claude Opus 5.5 costs $4 per million input tokens, $20 per million output tokens, and $0.20
per million cached input tokens. One credit is $0.05 of measured model cost, and every run
reserves a budget that the worker enforces, so no run can cost more than:

| Run | Budget (cap) | Estimated typical cost |
|---|---:|---:|
| Plan or plan revision | 6 credits = $0.30 | $0.05 to $0.30 |
| Build (theme, data, onboarding, paywall, settings and about 4 main screens) | 90 credits = $4.50 | $3 to $3.50 |
| Chat edit | 24 credits = $1.20 | $0.30 to $0.80 |

Measured on the deployed site (a kanji learning app on Opus 5.5): the plan costs 1 to 2
credits. Before apps had onboarding, a paywall and settings, the build cost 30 to 32 credits
($1.50 to $1.60); with them (seven screens and 30–60 entries of content) it costs 60 to 67
credits ($3.00 to $3.35) and scores 93 instead of 33 on the quality rubric
([docs/evals](evals/README.md)).
Building screens in parallel made the build about three times faster without costing more. Every run records its real
token counts and cost (`agent_run`), so a week of real usage will firm these numbers up.

So 80 Pro credits buy roughly one new app and a few edits a month. Ways to give more for
the same margin:
- Run builds on Claude Sonnet 5.5 ($2 / $10): each credit buys twice the work.
- Run plan revisions on Claude Haiku 5.5 ($0.10 / $0.50).

### Hosting (Railway)

Railway bills per second: $20 per vCPU-month, $10 per GB of RAM per month, $0.05 per GB of
egress, $0.15 per GB-month of volume and $0.015 per GB-month of bucket storage. The plan fee
($5 Hobby, $20 Pro) is credited against usage.

**Fixed:** measured on the Railway deployment at idle (November 2026):

| Service | RAM | CPU |
|---|---:|---:|
| web | 0.16 GB | ~0.01 vCPU |
| worker | 0.12 GB | <0.01 vCPU |
| Postgres | 0.06 to 0.09 GB | <0.01 vCPU |
| preview | 0.08 GB | <0.01 vCPU |

Total: about 0.42 GB of RAM ($4.20), a few cents of CPU, and a 0.9 GB volume ($0.13).
That is about $4.50 a month, inside the Hobby plan's $5 of included usage. Under real traffic,
expect $10 to $20 a month (Next.js grows to 0.3 to 0.5 GB). Two Builder subscribers cover it.

**Per active user:** storage and egress are small:
- Database rows and images cost under $0.01.
- Previews and published apps download a 1 MB runtime: 1,000 views is about 1 GB, or $0.05.

Extra CPU and RAM as traffic grows is roughly $0.10 to $0.50 a user. The $2 used in the margin
model is deliberately conservative. At a handful of users, the fixed $20 to $30 dominates.

**Watch:** a very popular published app (100,000 views is about 100 GB, or $5). Compressing
the preview runtime and turning on Railway's CDN for the preview service cut that several-fold.

### Payments (Stripe)

US cards: 2.9% + $0.30 per charge, plus 0.7% for Stripe Billing subscriptions. International
cards and currency conversion add more. Treat the figure above as a floor.

## Free users (acquisition cost, not COGS)

Each sign-up gets 100 credits: at most $5 of AI, typically $3.50 to $4.50 (one app and a few edits).
At a 5% conversion to Builder, 20 free sign-ups (up to $5 of AI each, $40 to $100 in all) produce
one $20 subscriber earning $12.03 a month after costs: three to eight months to pay back.

## Not in COGS

- **Paid by the user:** their AI subscription for Pro (MCP), EAS builds (their Expo account), and
  GitHub.
- **Off for now:** ImageKit (see the caveat in [05-v1-status.md](05-v1-status.md)), and Resend
  (it has a free tier; check its pricing when email volume grows).
- **Operating costs:** support, salaries, marketing, and the Railway plan fee once usage
  exceeds it.
