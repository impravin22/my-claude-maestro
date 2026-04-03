# Security Checklist — OWASP Top 10 + LLM Application Top 10

Run this checklist against every change that touches APIs, user input, database queries, LLM calls, or authentication.

---

## Injection Prevention

- [ ] **SQL injection** — all database queries use SQLAlchemy ORM or parameterised `text()`; never string concatenation
- [ ] **NoSQL injection** — query parameters validated and typed before use
- [ ] **OS command injection** — never pass user input to `subprocess`, `os.system`, or shell commands; use allowlists
- [ ] **LDAP injection** — escape special characters in LDAP queries
- [ ] **Template injection** — never render user input directly in server-side templates

## Authentication & Session Management

- [ ] **No hardcoded credentials** — all secrets in environment variables, never in code
- [ ] **Strong password policies** — enforce minimum length, complexity where applicable
- [ ] **Rate limiting** — authentication endpoints have rate limiting to prevent brute force
- [ ] **Secure session management** — HTTP-only cookies, secure flag, SameSite attribute
- [ ] **Token expiry** — JWTs and session tokens have appropriate expiry times
- [ ] **All endpoints require auth** — `RequiredAuth` on every endpoint; no unauthenticated access unless explicitly public

## Access Control

- [ ] **Least privilege** — users can only access resources they own or are authorised for
- [ ] **Ownership validation (IDOR prevention)** — validate that the authenticated user owns or has access to every resource they request
- [ ] **Deny by default** — new endpoints deny access unless explicitly granted
- [ ] **Role-based access** — check permissions via role system (`lib/roles.ts`) before rendering sensitive data or allowing actions
- [ ] **Authorisation on every request** — never cache authorisation decisions client-side as the sole check

## Sensitive Data Protection

- [ ] **Encrypt in transit** — all API calls over HTTPS
- [ ] **Encrypt at rest** — sensitive data encrypted in database
- [ ] **No PII logging** — never log emails, names, or personal data; use `user_id` or `session_id`
- [ ] **No secrets in logs** — tokens, passwords, API keys never appear in log output
- [ ] **Environment variables** — all configuration secrets via env vars, never in source code

## Input Validation & Sanitisation

- [ ] **Backend: input_sanitizer.sanitize()** — all user input sanitised before any LLM call (PII redaction)
- [ ] **Frontend: Zod schemas** — validate all user input with Zod schemas at system boundaries
- [ ] **Content sanitisation** — use `rehype-sanitize` on ALL Markdown and user-generated content rendering
- [ ] **File upload validation** — validate file type, size, and content; never trust file extensions alone
- [ ] **Authenticated API calls** — use `authFetch()` for all authenticated requests; never raw `fetch`

## Output Protection

- [ ] **Backend: output_scanner.scan()** — all LLM output scanned before returning to user (data leakage prevention)
- [ ] **XSS prevention** — sanitise and escape all user-supplied content in output; use Content Security Policy headers
- [ ] **Error messages** — never expose stack traces, SQL queries, or internal paths in production error responses
- [ ] **CORS configuration** — restrict allowed origins to known domains

## LLM-Specific Security (OWASP Top 10 for LLM Applications)

- [ ] **Prompt injection** — user input never directly interpolated into system prompts; use structured DSPy modules with typed fields
- [ ] **Sensitive information disclosure** — LLM output scanned for PII, credentials, or internal data before returning
- [ ] **Training data poisoning awareness** — validate LLM outputs against expected schemas; don't trust raw text blindly
- [ ] **Denial of service** — limit input length to LLM calls; set token limits on outputs
- [ ] **Supply chain** — LLM dependencies (DSPy, LangChain) pinned to known-good versions
- [ ] **Excessive agency** — LLM cannot execute arbitrary actions; all tool/function calls go through validation
- [ ] **Overreliance** — critical decisions include human verification; LLM suggestions are flagged as suggestions

## Dependency Security

- [ ] **No known vulnerabilities** — flag outdated or vulnerable dependencies when spotted
- [ ] **Minimal dependencies** — justify every new dependency; prefer standard library where sufficient
- [ ] **Lock files** — `uv.lock` (Python) and `package-lock.json` (Node.js) committed and up to date

## Logging & Monitoring

- [ ] **Audit logging** — security-relevant events logged (authentication, access control decisions, input validation failures)
- [ ] **No sensitive data in logs** — verified that log output contains no PII, tokens, or secrets
- [ ] **Structured logging** — use structured format (JSON) for security logs to enable automated analysis

## Frontend-Specific

- [ ] **Zod validation at boundaries** — every form, every API response parsed through Zod before use
- [ ] **rehype-sanitize** — every Markdown or user-generated HTML rendering uses sanitisation
- [ ] **authFetch()** — every authenticated API call uses the auth wrapper, never raw fetch
- [ ] **Role checks** — `lib/roles.ts` consulted before rendering admin/sensitive UI
- [ ] **useIMEComposition** — all chat textareas use the IME composition hook (CJK input safety)
- [ ] **CSP headers** — Content Security Policy configured to prevent inline scripts and untrusted sources
