import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPhoneForSheets,
  isLeadDuplicateOrContacted,
  buildImapFetchQuery
} from '../engine.mjs';
import { isSuppressed, addToSuppression, clearSuppressionCache } from '../src/suppression.mjs';

describe('Campaign Engine Bug Remediation Unit Tests (TDD)', () => {

  beforeEach(() => {
    clearSuppressionCache();
  });

  describe('1. In-Memory Pre-Send Lead Deduplication (BUG-02, BUG-05)', () => {
    it('detects and flags leads already marked as SENT earlier in the dataset', () => {
      const priorHistory = new Map([
        ['kamalakar.a@milieudigital.com', { status: 'sent', row: 27 }],
        ['viraj_p@siliciom.com', { status: 'sent', row: 32 }]
      ]);

      const check1 = isLeadDuplicateOrContacted('kamalakar.a@milieudigital.com', priorHistory);
      assert.strictEqual(check1.isDuplicate, true);
      assert.strictEqual(check1.reason, 'previously sent');
      assert.strictEqual(check1.priorRow, 27);

      const checkFresh = isLeadDuplicateOrContacted('fresh.lead@newcompany.com', priorHistory);
      assert.strictEqual(checkFresh.isDuplicate, false);
    });

    it('detects and flags leads that have already REPLIED earlier in the dataset', () => {
      const priorHistory = new Map([
        ['diya.chauhan@tekinspirations.com', { status: 'replied', sentiment: 'POSITIVE', row: 26177 }],
        ['sree@texplorers.com', { status: 'replied', sentiment: 'NEUTRAL', row: 21970 }]
      ]);

      const check = isLeadDuplicateOrContacted('diya.chauhan@tekinspirations.com', priorHistory);
      assert.strictEqual(check.isDuplicate, true);
      assert.strictEqual(check.reason, 'already replied');
      assert.strictEqual(check.sentiment, 'POSITIVE');
    });

    it('detects and flags leads that already BOUNCED earlier in the dataset', () => {
      const priorHistory = new Map([
        ['dead.inbox@invalidcorp.com', { status: 'bounced', row: 120 }]
      ]);

      const check = isLeadDuplicateOrContacted('dead.inbox@invalidcorp.com', priorHistory);
      assert.strictEqual(check.isDuplicate, true);
      assert.strictEqual(check.reason, 'already bounced');
    });
  });

  describe('2. IMAP Fetch Query & Flag Strategy (BUG-03)', () => {
    it('builds a date-windowed fetch query instead of strictly seen: false', () => {
      const windowDays = 14;
      const query = buildImapFetchQuery({ windowDays });
      
      // Must NOT filter by seen: false
      assert.strictEqual(query.seen, undefined, 'Must not restrict to seen: false');
      assert.ok(query.since instanceof Date, 'Query must have a since Date');
      
      const expectedMinDate = Date.now() - (windowDays + 1) * 24 * 60 * 60 * 1000;
      assert.ok(query.since.getTime() >= expectedMinDate, 'Since date should match window');
    });
  });

  describe('3. Phone Number Google Sheet Formula Protection (BUG-07)', () => {
    it('prefixes leading + with apostrophe to prevent Excel/Sheets formula calculation', () => {
      assert.strictEqual(formatPhoneForSheets('+91 7774014311'), "'+91 7774014311");
      assert.strictEqual(formatPhoneForSheets('+1 (862) 298-5454'), "'+1 (862) 298-5454");
      assert.strictEqual(formatPhoneForSheets('+91-22-41207788'), "'+91-22-41207788");
    });

    it('clears or neutralizes negative arithmetic evaluation errors from legacy sheets', () => {
      // Legacy -41207719 produced by evaluating +91-22-41207788 as arithmetic
      assert.strictEqual(formatPhoneForSheets('-41207719'), '');
      assert.strictEqual(formatPhoneForSheets('#ERROR!'), '');
      assert.strictEqual(formatPhoneForSheets('=1+2'), "'=1+2");
    });

    it('preserves existing properly quoted phone numbers without double quoting', () => {
      assert.strictEqual(formatPhoneForSheets("'+91 9427273696'"), "'+91 9427273696'");
      assert.strictEqual(formatPhoneForSheets("'9829242624'"), "'9829242624'");
    });
  });

  describe('4. Bounce-to-Suppression Tab Sync (BUG-06)', () => {
    it('records bounced emails into suppression memory cache immediately', async () => {
      let appended = false;
      const appendFn = async (email, reason, timestamp) => {
        appended = true;
      };

      await addToSuppression('hardbounce@targetcompany.com', 'Hard Bounce / Invalid Domain', appendFn);
      const suppressed = await isSuppressed('hardbounce@targetcompany.com');
      assert.strictEqual(suppressed, true, 'Bounced email must be recognized as suppressed');
      assert.strictEqual(appended, true, 'Append function should be called');
    });
  });

});
