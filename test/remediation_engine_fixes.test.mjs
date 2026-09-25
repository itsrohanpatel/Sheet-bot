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

  describe('5. Follow-Up Delay Config Alignment (Fix #11)', () => {
    it('applies randomized jitter delay from min_delay_seconds and max_delay_seconds settings', async () => {
      const { calculateFollowupDelay } = await import('../engine.mjs');
      
      const settingsAdaptive = {
        throttle_mode: 'adaptive',
        min_delay_seconds: '45',
        max_delay_seconds: '90'
      };
      
      const delay = calculateFollowupDelay(settingsAdaptive);
      assert.ok(delay >= 45000, `Delay (${delay}ms) should be >= min 45000ms`);
      assert.ok(delay <= 90000, `Delay (${delay}ms) should be <= max 90000ms`);
    });

    it('falls back to safe defaults (15s - 30s) if settings are absent in non-bulk mode', async () => {
      const { calculateFollowupDelay } = await import('../engine.mjs');
      const delay = calculateFollowupDelay({});
      assert.ok(delay >= 15000, `Default delay (${delay}ms) should be >= 15000ms`);
      assert.ok(delay <= 30000, `Default delay (${delay}ms) should be <= 30000ms`);
    });

    it('respects bulk/turbo mode low delays when configured', async () => {
      const { calculateFollowupDelay } = await import('../engine.mjs');
      const settingsBulk = {
        throttle_mode: 'bulk',
        min_delay_seconds: '1',
        max_delay_seconds: '3'
      };
      const delay = calculateFollowupDelay(settingsBulk);
      assert.ok(delay >= 1000, `Bulk delay (${delay}ms) should be >= 1000ms`);
      assert.ok(delay <= 3000, `Bulk delay (${delay}ms) should be <= 3000ms`);
    });
  });

  describe('6. In-Flight Pre-Send Status Verification (Fix #2 Race Condition)', () => {
    it('detects when a lead status changed to replied or suppressed in sheet during long run', async () => {
      const { shouldSkipLeadDueToStatusChange } = await import('../engine.mjs');

      // Lead replied concurrently while outreach was processing earlier rows
      const freshRowData = ['Lead Name', 'lead@client.com', '', '', '', '', 'replied', '', '', '', '', 'POSITIVE', '', '+91 9999999999'];
      const headers = ['full_name', 'email', 'company_name', 'location', 'phone', 'website', 'Sent Status', 'Sent From', 'Subject Line', 'Time', 'Date Sent', 'Sentiment', 'Follow Up Count', 'Phone', 'Follow up'];
      
      const skipCheck = shouldSkipLeadDueToStatusChange(freshRowData, headers, 'outreach');
      assert.strictEqual(skipCheck.shouldSkip, true);
      assert.strictEqual(skipCheck.reason, 'already replied');

      // Lead is still unsent / fresh for cold outreach
      const unsentRowData = ['Lead Name', 'lead@client.com', '', '', '', '', '', '', '', '', '', '', '', '', ''];
      const freshCheck = shouldSkipLeadDueToStatusChange(unsentRowData, headers, 'outreach');
      assert.strictEqual(freshCheck.shouldSkip, false);

      // Follow-up context: Lead has status 'sent' - must NOT be skipped (it is eligible for follow-up!)
      const sentFollowupRow = ['Lead Name', 'lead@client.com', '', '', '', '', 'sent', '', '', '', '', '', '1', '', ''];
      const followupCheck = shouldSkipLeadDueToStatusChange(sentFollowupRow, headers, 'followup');
      assert.strictEqual(followupCheck.shouldSkip, false, 'Eligible sent lead should NOT be skipped in followup');

      // Follow-up context: Lead marked 'Done' in Follow up column - MUST be skipped
      const doneFollowupRow = ['Lead Name', 'lead@client.com', '', '', '', '', 'sent', '', '', '', '', '', '3', '', 'Done'];
      const doneCheck = shouldSkipLeadDueToStatusChange(doneFollowupRow, headers, 'followup');
      assert.strictEqual(doneCheck.shouldSkip, true);
      assert.strictEqual(doneCheck.reason, 'followup already completed');
    });

    it('prevents overwriting Phone or Sentiment when updating outreach/followup sent status', async () => {
      const { mergeOutreachUpdatePreservingData } = await import('../engine.mjs');

      // Stale in-memory row had blank phone and sentiment
      const memoryRow = ['John', 'john@test.com', 'Acme', 'Delhi', '', '', '', '', '', '', '', '', '0', ''];
      // Live row in sheet received phone and positive sentiment from inbox checker
      const liveRow = ['John', 'john@test.com', 'Acme', 'Delhi', '', '', 'replied', '', '', '', '', 'POSITIVE', '0', "'+91 9876543210"];
      const headers = ['full_name', 'email', 'company_name', 'location', 'other_col', 'website', 'Sent Status', 'Sent From', 'Subject Line', 'Time', 'Date Sent', 'Sentiment', 'Follow Up Count', 'Phone'];
      
      const merged = mergeOutreachUpdatePreservingData(memoryRow, liveRow, headers, {
        'Sent Status': 'SENT',
        'Sent From': 'outreach@sender.com',
        'Subject Line': 'Quick Question'
      });

      const col = Object.fromEntries(headers.map((h, i) => [h, i]));
      assert.strictEqual(merged[col['Phone']], "'+91 9876543210", 'Phone number must be preserved from live row');
      assert.strictEqual(merged[col['Sentiment']], 'POSITIVE', 'Sentiment must be preserved from live row');
    });
  });

  describe('7. Inbox Checker Re-reply & Duplicate Message Handling (Fix #1)', () => {
    it('deduplicates multiple emails from the same sender in a single inbox pass', async () => {
      const { shouldProcessInboxMessage } = await import('../engine.mjs');

      const processedFromAddrs = new Set();
      const msg1 = { uid: 101, flags: new Set() };
      const check1 = shouldProcessInboxMessage(msg1, 'lead@client.com', false, processedFromAddrs);
      assert.strictEqual(check1.shouldProcess, true);

      // Same sender in same pass
      const msg2 = { uid: 102, flags: new Set() };
      const check2 = shouldProcessInboxMessage(msg2, 'lead@client.com', false, processedFromAddrs);
      assert.strictEqual(check2.shouldProcess, false);
      assert.strictEqual(check2.reason, 'duplicate sender in current batch');
    });

    it('skips re-notifying if an already seen message belongs to an already recorded replied lead', async () => {
      const { shouldProcessInboxMessage } = await import('../engine.mjs');

      const processedFromAddrs = new Set();
      // Message has already been seen (marked \Seen in previous cron runs)
      const msgAlreadySeen = { uid: 88, flags: new Set(['\\Seen']) };
      const isExistingLead = true; // Lead already has status 'replied' in sheet

      const check = shouldProcessInboxMessage(msgAlreadySeen, 'oldlead@client.com', isExistingLead, processedFromAddrs);
      assert.strictEqual(check.shouldProcess, false);
      assert.strictEqual(check.reason, 'already seen and lead already recorded as replied');
    });

    it('processes message if it is new/unseen even if lead was previously replied (genuine new incoming touch)', async () => {
      const { shouldProcessInboxMessage } = await import('../engine.mjs');

      const processedFromAddrs = new Set();
      // New incoming reply that is unread / unseen
      const msgUnseen = { uid: 150, flags: new Set() };
      const isExistingLead = true;

      const check = shouldProcessInboxMessage(msgUnseen, 'engagedlead@client.com', isExistingLead, processedFromAddrs);
      assert.strictEqual(check.shouldProcess, true);
    });
  });

});
