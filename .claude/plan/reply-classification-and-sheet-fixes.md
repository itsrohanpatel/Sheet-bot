# Implementation Plan: Reply Classification, Taxonomy & Sheet Bug Fixes

## Problem Statement & Context
Real-world inbox analysis on `abhishek@hireologist.co.in` and Google Sheet audit revealed 4 critical anomalies:
1. **Mathematical Formula Evaluation**: Phone numbers starting with `+` (e.g. `+91-22-41207788`) were evaluated as arithmetic expressions in `USER_ENTERED` mode, resulting in `-41207719`.
2. **Internal Sender Phone Theft**: Outlook-style reply headers (`*From:*`, `*Sent:*`) were not stripped by `stripQuotedReply()`, causing AI & regex fallback to extract Hireologist's own phone number (`919829242624`) from quoted footers.
3. **Placeholder Text Leakage**: The formula placeholder `"No positive leads recorded yet"` leaked into Column N (`Phone`) and was never cleared when replies had no phone number.
4. **Taxonomy & Ghost Positives**: Diverse B2B reply types (Pricing requests, Meeting requests, Job openings, Capability inquiries, Sub-vendor proposals, Zero-cost objections, Referrals, Objections) need clear classification rules and tests, ensuring `SENT` leads never inherit `POSITIVE` sentiment.

---

## User Journeys
- **UJ1 (Safe Phone Storage)**: As a sales operator, when a lead provides a phone number formatted with `+` or hyphens, it must be stored in Google Sheets as text without mathematical calculation.
- **UJ2 (Outlook Thread Stripping & Sender Blacklist)**: As an outreach agent, when a lead replies via Outlook/Apple Mail quoting our outgoing email, our internal signature and phone numbers must never be extracted.
- **UJ3 (Placeholder & Empty Cell Sanitization)**: If no phone number is found, or if a cell contains legacy placeholder text like `"No positive leads recorded yet"`, it must be cleared to an empty string.
- **UJ4 (Comprehensive Reply Taxonomy)**: All incoming emails must be categorized according to standard B2B taxonomy:
  - `POSITIVE`: Pricing/Quote request, Call/Meeting scheduling, Job opening/JD details, Scope/Sector inquiry, Sub-vendor/Empanelment proposal.
  - `NEUTRAL`: Referral to colleague/career portal, Check back next quarter, Zero-cost proposal inquiries without rejection.
  - `NEGATIVE`: Not interested, Unqualified objection, Rejection.
  - `OOO`: Out of office / Vacation auto-responder.
  - `SUPPRESSED`: Explicit unsubscribe / opt-out request.
  - `BOUNCED`: Mailer-daemon / Delivery failure.

---

## Test-Driven Development Plan

### Phase 1: Test Specification (RED Gate)
Create `test/reply_taxonomy_and_phone.test.mjs`:
1. `stripQuotedReply()` Outlook tests:
   - Strips `*From:*` / `*Sent:*` markdown-bold Outlook headers.
   - Strips standard `From: ... Sent: ... To: ... Subject:` Outlook headers.
   - Strips `-----Original Message-----` and `________________________________` delimiters.
2. `extractPhoneNumberFallback()` tests:
   - Rejects blacklisted sender phone numbers (`919829242624`, `+91 9829242624`).
   - Extracts domestic and international lead phone numbers accurately.
   - Returns empty string when only sender's number is present in quoted text.
3. `formatPhoneForSheets()` tests:
   - Prefixes `+` phone numbers with `'` (`'+91-22-41207788'`).
   - Handles standard phone formats cleanly.
   - Clears `"No positive leads recorded yet"`.
4. Reply taxonomy classification simulation tests:
   - Tests all 10+ real-world archetypes from user inbox dump (Pricing request, Meeting schedule, JD details, Sub-vendor terms, Zero-cost inquiry, Referral, Direct rejection, OOO).

### Phase 2: Implementation (GREEN Gate)
1. In `src/suppression.mjs`:
   - Expand `quoteMarkers` in `stripQuotedReply()` for Outlook, Apple Mail, bolded `*From:*`, horizontal rule markers.
2. In `engine.mjs`:
   - Add `formatPhoneForSheets(phone)` helper.
   - Update `extractPhoneNumberFallback(text, options)` with sender blacklist check.
   - Update `classifyEmailWithAi()` prompt and phone sanitization with internal blacklist.
   - In `runInboxChecker()`, update phone column assignment to use `formatPhoneForSheets()` and ensure empty phone clears any existing placeholder.
   - Ensure sentiment is only assigned on valid replies.

### Phase 3: Verification & Evidence
- Run full test suite: `npm test`.
- Verify 100% pass across all test suites.
- Write TDD evidence report in `docs/testing/reply-taxonomy-and-phone-fixes.tdd.md`.

### Phase 4: Git Checkpoints & Push
- Commit test additions & implementation fixes.
- Push to GitHub.
