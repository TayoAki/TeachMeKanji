# Unit economics (COGS)

What it costs to serve one subscriber for a month, and what's left of the price. Prices are
as of November 2026: Railway, Anthropic (Claude) and Stripe list prices. The worst-case
numbers are enforced by a test (`planMargin` in `packages/core/src/billing.ts` must stay at or
above 90% for every paid plan).

## Per subscriber, per month (worst case)

Worst case means a Pro subscriber spends every included credit on the most expensive model.

| | Studio $49 | Pro $99 |
|---|---:|---:|
| AI (included credits, all used) | $0.00 | $4.00 (80 credits × $0.05) |
| Hosting (estimate, see below) | $2.00 | $2.00 |
| Payments (2.9% + $0.30 card, 0.7% Stripe Billing) | $2.06 | $3.86 |
| **Cost of goods sold** | **$4.06** | **$9.86** |
| **Gross margin** | **91.7%** | **90.0%** |

Studio has no AI line: the subscriber's own Claude, ChatGPT or Cursor subscription does the
generation over MCP. That is why it carries the best margin at half the price.

In a typical month a Pro subscriber uses part of the credits, so the real margin is higher
(about 92% at half usage).

## The cost lines

### AI (built-in agent: Free and Pro only)

Claude Opus 5.5 costs $4 per million input tokens, $20 per million output tokens, and $0.20
per million cached input tokens. One credit is $0.05 of measured model cost, and every run
reserves a budget that the worker enforces, so no run can cost more than:

| Run | Budget (cap) | Estimated typical cost |
|---|---:|---:|
| Plan or plan revision | 6 credits = $0.30 | $0.05 to $0.30 |
| Build (plan, theme, data, about 5 screens) | 60 credits = $3.00 | $1 to $2 |
| Chat edit | 12 credits = $0.60 | $0.10 to $0.60 |

The typical figures are estimates: the Claude path has not run live yet. Every run records its
real token counts and cost (`agent_run`), so the first week of real usage replaces them.

So 80 Pro credits buy roughly two new apps and a dozen edits a month. Ways to give more for
the same margin:
- Run builds on Claude Sonnet 5.5 ($2 / $10): each credit buys twice the work.
- Run plan revisions on Claude Haiku 5.5 ($0.10 / $0.50).

### Hosting (Railway)

Railway bills per second: $20 per vCPU-month, $10 per GB of RAM per month, $0.05 per GB of
egress, $0.15 per GB-month of volume and $0.015 per GB-month of bucket storage. The plan fee
($5 Hobby, $20 Pro) is credited against usage.

**Fixed:** four services always on (web, preview, worker, Postgres) at idle use about 1 GB of
RAM and little CPU. That is roughly $10 to $15 a month, inside the Pro plan's $20 of included
usage. One Studio subscriber covers it.

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

Each sign-up gets 100 credits: at most $5 of AI, typically $2 to $3 (one app and a few edits).
At a 5% conversion to Studio, 20 free sign-ups ($40 to $100 of AI) produce one $49 subscriber
contributing about $45 a month. That pays back in one to two months. Levers if it doesn't:
- fewer starting credits
- Sonnet 5.5 for free accounts
- a cap on free builds per day

## Not in COGS

- **Paid by the user:** their AI subscription for Studio, EAS builds (their Expo account), and
  GitHub.
- **Off for now:** ImageKit (see the caveat in [05-v1-status.md](05-v1-status.md)), and Resend
  (it has a free tier; check its pricing when email volume grows).
- **Operating costs:** support, salaries, marketing, and the Railway plan fee once usage
  exceeds it.
