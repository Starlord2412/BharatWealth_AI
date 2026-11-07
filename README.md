# Bharat Wealth AI – voice client assistant (full stack)
Node/Express modular monolith + PostgreSQL (Neon). Same-origin React-free PWA frontend in `public/index.html`, wired to the API.

## Run
1. `cp .env.example .env` – set `DATABASE_URL` (Neon), `JWT_SECRET`, keep `DEMO_TODAY=2026-11-07` for reproducible demo dates.
2. `npm install && npm run db:init && npm start` → http://localhost:3000 (logins `priya@demo.in` / `anil@demo.in`, password `demo123`). `public/prototype.html` is the standalone in-browser demo.
3. `npm test` – unit tests always run; API/security tests run when `DATABASE_URL` points at an initialised database.

## AI + voice (optional; app degrades gracefully)
- **Gemini** (`LLM_API_KEY`, `LLM_MODEL_ID`): schema-constrained JSON intent extraction. Output is validated (intent allowlist, ISO dates, window ≤ 92 days); invalid twice → keyword fallback. The model never sees database rows and never writes SQL. Policy gate runs before the model call.
- **Sarvam** (`SPEECH_API_KEY`): `POST /api/v1/voice/turn` (raw audio body, ≤30 s, `?language=mr|hi|en`) returns a transcript for the agent to correct; it never runs tools. `POST /api/v1/voice/speak` returns WAV. Audio is never stored. Set `VOICE_ENABLED=false` / `LLM_ENABLED=false` as kill switches; typed input and deterministic lookups keep working.
- Verify current model IDs, speakers, limits and data terms with each provider before real use (docs.sarvam.ai, ai.google.dev).

## API (/api/v1, JWT cookie or Bearer)
auth/login · auth/logout · bootstrap · clients · clients/:id/summary · sips/due · kyc/pending · policies/renewals · assistant/turn · voice/turn · voice/speak · followups (GET, POST drafts, PATCH :id edit, PATCH :id/approve {confirm:true}, PATCH :id/cancel) · audit

## Tests (tests/)
Unit: policy blocking in en/hi/mr, date ranges, intent mapping, model-output validation, fallback. Integration/security: exact SIP rows, date validation, cross-agent IDOR (404 both ways), blocked prompts never reach a tool, clarification on duplicate names, other-agent clients indistinguishable from missing, injected client notes treated as data, drafts need explicit approval, audit scoping, voice fallback.
