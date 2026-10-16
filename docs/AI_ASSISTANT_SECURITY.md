# Assistant security

Pixelcare AI and ISMS Assist share one company switch. A company admin turns them on in Company settings. Until that switch is on, neither assistant calls a provider, runs tools, or runs automations.

## What leaves this app

Chat and briefing text is sent to the provider configured for that assistant:

- Pixelcare AI uses the Qwen endpoint from `QWEN_API_KEY`, optional `QWEN_BASE_URL`, and optional `QWEN_MODEL`.
- ISMS Assist uses OpenAI from `OPENAI_API_KEY` and optional `AI_MODEL`.

Those keys stay in server environment variables. This app does not keep a copy of the provider account settings. How long that provider stores prompts, and whether those prompts are used for training, depends on the Qwen or OpenAI account. This app does not verify those settings. Do not assume the text stays only on our server.

## What this app enforces

- No company policy row, a disabled row, or a failed policy read means the assistant is off.
- The model sees stored conversation text for that person, not a client-supplied thread.
- Read tools stay on an allowlist. The model cannot create an order. Confirm order is a button bound to one proposal and the lines the person reviewed.
- Branch, order, and return lookups stay inside the signed-in person's existing access.
- Customer names, email, phone, address, and secret-like fields are removed before a payload is sent.
- On one server without Redis, the assistant still answers and keeps the same per-person and per-company request ceilings in that server's memory. When Redis is configured, a failed or timed-out Redis call still refuses the request. Sign-in rate limits are separate and still allow the attempt when Redis is down.
- Audit rows record ids, tool name, allow or deny, confirmation result, and token counts. They follow the existing audit archive (90 days unless `AUDIT_LOG_HOT_DAYS` is changed).

## Required configuration

- Company settings: turn the assistant on for each company.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` when several servers must share those ceilings. One server can run without them.
- `QWEN_API_KEY` for Pixelcare AI and/or `OPENAI_API_KEY` for ISMS Assist.

Provider retention and training remain unresolved until someone checks the Qwen and OpenAI account settings.
