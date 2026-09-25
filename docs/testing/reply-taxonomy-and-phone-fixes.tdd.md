# TDD Evidence Report: Reply Taxonomy, Outlook Quoting & Phone Sanitization

**Date:** 2026-09-25  
**Origin Task:** Real-world inbox reply analysis on `abhishek@hireologist.co.in`, B2B taxonomy classification, and Google Sheet bug fixes.  
**Test Suite:** `test/reply_taxonomy_and_phone.test.mjs`  
**Overall Result:** ✅ 180 / 180 tests passing (52 test suites)

---

## 1. Source Plan & Objectives
- **Plan File:** [.claude/plan/reply-classification-and-sheet-fixes.md](../../.claude/plan/reply-classification-and-sheet-fixes.md)
- **Primary Goals:**
  1. Fix mathematical evaluation of phone numbers (e.g. `+91-22-41207788` -> `-41207719`).
  2. Prevent sender phone extraction by stripping Outlook markdown-bold reply headers (`*From:*`, `*Sent:*`) and implementing an internal number blacklist (`919829242624`).
  3. Clear stale formula placeholder text (`"No positive leads recorded yet"`) from phone cells.
  4. Expand B2B cold email reply taxonomy across all 10+ real-world archetypes.
  5. Prevent ghost positive leads (`SENT` leads marked `POSITIVE`) by requiring `Sent Status == replied`.

---

## 2. User Journeys Verified
- **UJ1 (Safe Phone Storage in Google Sheets):**
  - Guaranteed: Phone numbers starting with `+`, `=`, `-`, or `@` are safely prefixed with a single quote `'` in `formatPhoneForSheets()`. Google Sheets displays the literal phone number without executing arithmetic subtraction.
- **UJ2 (Outlook Quoted Thread Stripping & Sender Protection):**
  - Guaranteed: `stripQuotedReply()` cleans Outlook threads starting with `*From:*`, `From:`, `Sent:`, `To:`, `Subject:`, horizontal divider lines (`_{5,}`), and forwarded messages. Quoted footers containing the sender's phone number are stripped prior to extraction.
  - Guaranteed: Internal numbers matching `DEFAULT_INTERNAL_PHONE_BLACKLIST` (`919829242624`, etc.) are actively rejected by both regex fallback and AI phone extraction.
- **UJ3 (Placeholder & Empty Cell Sanitization):**
  - Guaranteed: `formatPhoneForSheets()` converts `"No positive leads recorded yet"` and arithmetic negative artifact numbers (`-41207719`) to `""`.
  - Guaranteed: When no phone number is present in a reply, the sheet cell is updated to clear legacy placeholder text.
- **UJ4 (B2B Reply Taxonomy):**
  - Guaranteed: Groq AI prompt and fallback logic properly classify:
    * Pricing / Quote requests -> `POSITIVE`
    * Meeting / Call requests -> `POSITIVE`
    * Job requirements / Vacancies -> `POSITIVE`
    * Sub-vendor empanelment terms -> `POSITIVE`
    * Capability inquiries (non-IT, US staffing) -> `POSITIVE`
    * Referral to HR / portal -> `NEUTRAL`
    * Direct objections / Not interested -> `NEGATIVE`
    * Out of office -> `OOO`
    * Unsubscribe / Opt-out -> `SUPPRESSED`
- **UJ5 (Positive Leads Filter Integrity):**
  - Guaranteed: The `Positive_Leads` tab formula in `auto-setup.mjs` and `apps-script/Code.gs` filters for `(Sent Status == 'replied') * (Sentiment == 'POSITIVE')`.

---

## 3. Test Specification & Guarantees

| # | What is Guaranteed | Test Target | Type | Result | Evidence Command |
|---|---|---|---|---|---|
| 1 | `stripQuotedReply` strips `*From:*` / `*Sent:*` markdown-bold Outlook headers | `test/reply_taxonomy_and_phone.test.mjs` | Unit | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |
| 2 | `stripQuotedReply` strips standard `From: ... Sent:` header blocks | `test/reply_taxonomy_and_phone.test.mjs` | Unit | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |
| 3 | `stripQuotedReply` strips horizontal rule dividers `_{5,}` and forwarded messages | `test/reply_taxonomy_and_phone.test.mjs` | Unit | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |
| 4 | `formatPhoneForSheets` prepends `'` to `+` phone numbers | `test/reply_taxonomy_and_phone.test.mjs` | Unit | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |
| 5 | `formatPhoneForSheets` clears formula placeholder text `"No positive leads recorded yet"` | `test/reply_taxonomy_and_phone.test.mjs` | Unit | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |
| 6 | `formatPhoneForSheets` clears math artifact numbers like `-41207719` | `test/reply_taxonomy_and_phone.test.mjs` | Unit | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |
| 7 | `extractPhoneNumberFallback` ignores sender team numbers in quoted text | `test/reply_taxonomy_and_phone.test.mjs` | Unit | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |
| 8 | `extractPhoneNumberFallback` rejects blacklisted internal numbers | `test/reply_taxonomy_and_phone.test.mjs` | Unit | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |
| 9 | `extractPhoneNumberFallback` extracts plain 10-digit mobile numbers (e.g. `9880082711`) | `test/reply_taxonomy_and_phone.test.mjs` | Unit | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |
| 10 | B2B Taxonomy AI Simulation: Archetype 1 (Pricing/Quote request -> `POSITIVE`) | `test/reply_taxonomy_and_phone.test.mjs` | Integration/Sim | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |
| 11 | B2B Taxonomy AI Simulation: Archetype 2 (Meeting request -> `POSITIVE` with Phone) | `test/reply_taxonomy_and_phone.test.mjs` | Integration/Sim | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |
| 12 | B2B Taxonomy AI Simulation: Archetype 3 (Job requirements shared -> `POSITIVE`) | `test/reply_taxonomy_and_phone.test.mjs` | Integration/Sim | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |
| 13 | B2B Taxonomy AI Simulation: Archetype 4 (Sub-vendor empanelment terms -> `POSITIVE`) | `test/reply_taxonomy_and_phone.test.mjs` | Integration/Sim | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |
| 14 | B2B Taxonomy AI Simulation: Archetype 5 (Scope inquiry -> `POSITIVE`) | `test/reply_taxonomy_and_phone.test.mjs` | Integration/Sim | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |
| 15 | B2B Taxonomy AI Simulation: Archetype 6 (Referral to HR -> `NEUTRAL`) | `test/reply_taxonomy_and_phone.test.mjs` | Integration/Sim | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |
| 16 | B2B Taxonomy AI Simulation: Archetype 7 (Direct objection -> `NEGATIVE`) | `test/reply_taxonomy_and_phone.test.mjs` | Integration/Sim | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |
| 17 | B2B Taxonomy AI Simulation: Archetype 8 (Out of office -> `OOO`) | `test/reply_taxonomy_and_phone.test.mjs` | Integration/Sim | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |
| 18 | B2B Taxonomy AI Simulation: Sender number blacklist suppression | `test/reply_taxonomy_and_phone.test.mjs` | Integration/Sim | PASS | `node --test test/reply_taxonomy_and_phone.test.mjs` |

---

## 4. Full Suite Verification
Executed command:
```bash
npm test
```
Result:
```text
1..29
# tests 180
# suites 52
# pass 180
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 25356.9989
```
All 180 tests across 52 test suites executed cleanly with zero failures.
