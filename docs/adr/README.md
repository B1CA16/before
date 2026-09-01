# Architecture Decision Records

Each ADR captures one significant decision: its context, the choice, and the consequences.
ADRs are immutable once accepted; a later ADR supersedes an earlier one rather than editing it.

- [0001](0001-architecture-foundations.md) Architecture foundations (monorepo, uv workspace, stack)
- [0002](0002-schema-management.md) Database schema managed by Supabase CLI and hand-written SQL
- [0003](0003-data-driven-spot-sourcing.md) Data-driven spot sourcing, no reliance on expert annotation
- [0004](0004-keeping-the-free-tier-api-warm.md) Keeping the free-tier API warm with an external scheduler
- [0005](0005-google-sign-in-instead-of-email.md) Google sign-in instead of email, for want of a sender domain
- [0006](0006-label-design.md) Label design: 1-to-5 ratings plus tags, trained as a binary collapse
- [0007](0007-tide-ingested-not-scored.md) Tide ingested and shown, but kept out of the score
- [0008](0008-server-rendered-spot-pages.md) Server-rendered spot pages, and why SEO was a rendering problem
- [0009](0009-forecast-correction-instead-of-session-labels.md) Forecast correction instead of session labels, and a table instead of the model
