# AI Autoresponder Behavior (No Static Templates)

SwiftPath autoresponders now use **Anthropic (Claude)** to generate a custom reply per submission.

## Current behavior
- No fixed static body templates are used for sends.
- The function builds context from submission data (name, deal description, stage/intent) and asks Claude to generate `subject` + `html`.
- Lead submissions are treated as low-intent; application submissions are treated as high-intent.

## Required send controls
Autoresponders send when these values are present:

- `RESEND_FROM_EMAIL`
- One of: `RESEND_API_KEY`, `RESEND_API_TOKEN`, or `RESEND_TOKEN`

`AI_AUTORESPONDER_ENABLED` is **on by default** and can be disabled explicitly with `false`, `0`, `off`, or `no`.

`ANTHROPIC_API_KEY` is optional:
- If provided, Claude generates a tailored response.
- If missing (or if Claude errors), the function sends a static fallback email so leads still receive an immediate confirmation.

## Guardrails included in AI prompt
- Personalize greeting with borrower name when available.
- Identify purchase vs refinance when possible (or ask concise clarifier).
- Identify residential vs commercial when possible (or ask concise clarifier).
- High-intent application flow asks for process docs quickly.
- Do **not** mention rate calculators or discuss pricing/rates before a value conversation.
- **Never request bank statements** in the initial docs request.

## Typical docs requested for high-intent applications
- LLC docs / operating agreement (if entity borrower)
- Purchase contract (if under contract)
- Scope of work + rehab budget (if rehab)
- Rent roll / T12 (when applicable)
- Insurance declarations/quote (if available)


> Note: the API key *name* in Resend (for example `swiftpathcapital`) does not matter to the code. Only the token value matters, and it must be copied into one of the environment variables above.
