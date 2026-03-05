# AI Autoresponder Behavior (No Static Templates)

SwiftPath autoresponders now use **Anthropic (Claude)** to generate a custom reply per submission.

## Current behavior
- No fixed static body templates are used for sends.
- The function builds context from submission data (name, deal description, stage/intent) and asks Claude to generate `subject` + `html`.
- Lead submissions are treated as low-intent; application submissions are treated as high-intent.

## Required send controls
Autoresponders send only when all required values are present:

- `AI_AUTORESPONDER_ENABLED=true`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

## Guardrails included in AI prompt
- Personalize greeting with borrower name when available.
- Identify purchase vs refinance when possible (or ask concise clarifier).
- Identify residential vs commercial when possible (or ask concise clarifier).
- High-intent application flow asks for process docs quickly.
- **Never request bank statements** in the initial docs request.

## Typical docs requested for high-intent applications
- LLC docs / operating agreement (if entity borrower)
- Purchase contract (if under contract)
- Scope of work + rehab budget (if rehab)
- Rent roll / T12 (when applicable)
- Insurance declarations/quote (if available)
