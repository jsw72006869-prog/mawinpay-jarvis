# MAWINPAY JARVIS Security Debt

Last updated: 2026-06-06

## npm audit --omit=dev

Status: PARTIAL

`npm audit fix --omit=dev` was applied safely and removed the high severity `tmp` production finding.

Remaining production audit finding:

- `uuid <11.1.1` via `exceljs >=3.5.0`
- Severity: moderate
- npm proposed fix: `npm audit fix --force`
- Risk: the force fix downgrades `exceljs` to `3.4.0`, which is a breaking change for the purchase-order XLSX export flow.

Decision:

- Do not apply `--force` automatically.
- Keep `exceljs@4.4.0` until XLSX export can be regression-tested against a safe replacement or upstream dependency update.

## Sensitive Data Handling

- UI, logs, Telegram, and voice must not expose customer names, phone numbers, addresses, raw supplier emails, tokens, API keys, env values, proxy URLs, or attachment base64.
- Raw customer delivery fields may exist only inside approved private XLSX exports or server-side execution paths.
- Supplier email raw values may be used server-side only; UI/reporting must use masked values.
