# 🧪 TDD Evidence Report: Campaign Engine & Sheet Remediation

**Date:** 2026-09-25  
**PRD Reference:** [`.claude/prds/campaign-engine-remediation.prd.md`](file:///d:/Codinf%20projets/Sheet-bot/.claude/prds/campaign-engine-remediation.prd.md)  
**Implementation Plan:** [`implementation_plan.md`](file:///C:/Users/rohan/.gemini/antigravity-ide/brain/dc0ec246-c90d-42aa-8487-96aa780f4d27/implementation_plan.md)  
**Target Files:** [`engine.mjs`](file:///d:/Codinf%20projets/Sheet-bot/engine.mjs), [`bulk-campain.xlsx`](file:///d:/Codinf%20projets/Sheet-bot/bulk-campain.xlsx)  
**Test Suite:** [`test/remediation_engine_fixes.test.mjs`](file:///d:/Codinf%20projets/Sheet-bot/test/remediation_engine_fixes.test.mjs)

---

## 1. User Journeys Tested
1. **UJ1 (Pre-Send Deduplication)**: As an outreach automation manager, when the engine iterates over unsent leads, it must check if the email address was already contacted, replied, or bounced anywhere in earlier rows and skip them without sending duplicate emails.
2. **UJ2 (IMAP Reliability & Windowing)**: As an outreach agent, when prospects reply, the IMAP receiver must scan recent messages by time window instead of skipping read emails (`seen: false`), and only flag messages as `\Seen` after processing.
3. **UJ3 (Phone Formula Protection)**: As a sales rep, phone numbers formatted with leading `+` must be safely prepended with `'` so Google Sheets never calculates them as formulas or produces `#ERROR!`.
4. **UJ4 (Bounce-to-Suppression Tab Sync)**: As an admin, hard bounces detected in the inbox must automatically synchronize to the `Suppressed` tab to protect sender reputation across future campaigns.

---

## 2. Test Specification & Guarantees

| # | What is Guaranteed | Test Target | Test Type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | Flags leads already marked as `sent` earlier | `isLeadDuplicateOrContacted` | Unit | PASS | `ok 1 - detects and flags leads already marked as SENT earlier` |
| 2 | Flags leads that already `replied` earlier | `isLeadDuplicateOrContacted` | Unit | PASS | `ok 2 - detects and flags leads that have already REPLIED earlier` |
| 3 | Flags leads that already `bounced` earlier | `isLeadDuplicateOrContacted` | Unit | PASS | `ok 3 - detects and flags leads that already BOUNCED earlier` |
| 4 | Date-windowed query avoids `seen: false` blind spot | `buildImapFetchQuery` | Unit | PASS | `ok 1 - builds a date-windowed fetch query instead of strictly seen: false` |
| 5 | Prefixes leading `+` phone with `'` for Sheets | `formatPhoneForSheets` | Unit | PASS | `ok 1 - prefixes leading + with apostrophe to prevent Excel/Sheets formula calculation` |
| 6 | Clears negative math artifacts (`-41207719`) and `#ERROR!` | `formatPhoneForSheets` | Unit | PASS | `ok 2 - clears or neutralizes negative arithmetic evaluation errors` |
| 7 | Preserves already-quoted numbers without duplicate `'` | `formatPhoneForSheets` | Unit | PASS | `ok 3 - preserves existing properly quoted phone numbers` |
| 8 | Bounces append to suppression list and update memory cache | `addToSuppression` | Integration | PASS | `ok 1 - records bounced emails into suppression memory cache immediately` |

---

## 3. TDD Progression Evidence

### RED Gate Execution
Command: `node --test test/remediation_engine_fixes.test.mjs`
```text
SyntaxError: The requested module '../engine.mjs' does not provide an export named 'buildImapFetchQuery'
    at ModuleJob._instantiate (node:internal/modules/esm/module_job:180:21)
# tests 1
# pass 0
# fail 1
```

### GREEN Gate Execution
Command: `node --test test/remediation_engine_fixes.test.mjs`
```text
ok 1 - Campaign Engine Bug Remediation Unit Tests (TDD)
# tests 8
# suites 5
# pass 8
# fail 0
```

### Full Regression Suite
Command: `npm test`
```text
# tests 188
# suites 57
# pass 188
# fail 0
# duration_ms 20203.4786
```

---

## 4. Sheet Data Remediation Results
Executed `scripts/remediate_campaign_sheet.py`:
- **Safety Backup**: Created at `bulk-campain.backup-20260925.xlsx`.
- **Hot Leads Rescued**:
  - Row 29118 (`amar@cleanergy.co.in`): `replied`, `POSITIVE`, phone: `'+91 7774014311`.
  - Row 32087 (`diya.thaker@ibsforyou.in`): `replied`, `POSITIVE`.
  - Row 17221 (`ankit@onusmed.com`): `replied`, `POSITIVE`, phone: `'+91 9427273696`.
  - Row 25842 (`ashwin.d@clevanoollc.com`): `suppressed`, `SUPPRESSED`.
- **Queue Deduplication**: 340 duplicates isolated (`duplicate — already sent`: 335, `bounced`: 2, `replied`: 3).
- **Suppression Sync**: 1,260 historical bounced emails appended to `Suppressed` tab (total rows now 1,291).
- **Formula Fix**: Updated `Positive_Leads!A2` to `Details!A2:N55000` (286 positive leads visible).
- **Phone Formatting**: 20 formula/#ERROR! cells cleaned; arithmetic `-41207719` fixed to `'+91-22-41207788`.
