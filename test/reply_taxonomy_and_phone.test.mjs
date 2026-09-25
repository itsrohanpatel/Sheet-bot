import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { stripQuotedReply } from '../src/suppression.mjs';
import {
  extractPhoneNumberFallback,
  formatPhoneForSheets,
  classifyEmailWithAi
} from '../engine.mjs';

describe('Reply Taxonomy, Outlook Quoting, & Phone Sanitization Tests (TDD)', () => {

  describe('1. stripQuotedReply() Outlook & Client Delimiters', () => {
    test('strips Outlook headers with markdown bold (*From:* / *Sent:*)', () => {
      const email = `Hi Urvashi,
Please share your brochure and commercial terms for our review.

*From:* Roshni <roshni@hireologist.co.in>
*Sent:* Wednesday, September 16, 2026 2:15 PM
*To:* Catherine Rodricks <catherine.rodricks@lighthouse-learning.com>
*Subject:* Recruitment proposal

Hireologist Talent Partner
Phone: +91 9829242624`;

      const stripped = stripQuotedReply(email);
      assert.strictEqual(
        stripped,
        'Hi Urvashi,\nPlease share your brochure and commercial terms for our review.'
      );
      assert.ok(!stripped.includes('9829242624'), 'Must not contain quoted sender phone');
    });

    test('strips standard Outlook header block (From: ... Sent: ...)', () => {
      const email = `We are interested in discussing. Please call me tomorrow.

From: Urvashi <urvashi@hireologist.co.in>
Sent: 25 September 2026 17:15
To: Manish Singh <manager@greedys.com>
Subject: Re: Recruitment proposal

Hireologist Team
+91 9829242624`;

      const stripped = stripQuotedReply(email);
      assert.strictEqual(stripped, 'We are interested in discussing. Please call me tomorrow.');
      assert.ok(!stripped.includes('9829242624'));
    });

    test('strips Outlook horizontal rule line and original message header', () => {
      const email = `Yes, please send across the proposal details.
________________________________
From: Pooja <pooja@hireologist.co.in>
Sent: Monday, August 24, 2026
Subject: Hiring proposal`;

      const stripped = stripQuotedReply(email);
      assert.strictEqual(stripped, 'Yes, please send across the proposal details.');
    });

    test('strips Apple Mail / mobile forwarded message delimiters', () => {
      const email = `Can we connect on Monday?

Begin forwarded message:
From: Shraddha <Shraddha@hireologist.co.in>
Date: 27 August 2026`;

      const stripped = stripQuotedReply(email);
      assert.strictEqual(stripped, 'Can we connect on Monday?');
    });
  });

  describe('2. formatPhoneForSheets() Mathematical & Placeholder Protection', () => {
    test('prepends apostrophe to phone numbers starting with + to prevent Google Sheets math subtraction', () => {
      // "+91-22-41207788" without apostrophe calculates to "-41207719" in Google Sheets USER_ENTERED mode!
      assert.strictEqual(formatPhoneForSheets('+91-22-41207788'), "'+91-22-41207788");
      assert.strictEqual(formatPhoneForSheets('+1 (415) 555-2671'), "'+1 (415) 555-2671");
      assert.strictEqual(formatPhoneForSheets('+91 98800 82711'), "'+91 98800 82711");
    });

    test('prepends apostrophe to numbers starting with =, -, or @ to prevent formula injection', () => {
      assert.strictEqual(formatPhoneForSheets('=1+2'), "'=1+2");
      assert.strictEqual(formatPhoneForSheets('@import'), "'@import");
    });

    test('leaves already escaped numbers intact', () => {
      assert.strictEqual(formatPhoneForSheets("'+91-22-41207788"), "'+91-22-41207788");
    });

    test('clears formula placeholder text "No positive leads recorded yet"', () => {
      assert.strictEqual(formatPhoneForSheets('No positive leads recorded yet'), '');
      assert.strictEqual(formatPhoneForSheets('no positive leads recorded yet'), '');
    });

    test('clears previous math result artifacts like -41207719', () => {
      assert.strictEqual(formatPhoneForSheets('-41207719'), '');
    });

    test('returns empty string for null, undefined, or empty phone', () => {
      assert.strictEqual(formatPhoneForSheets(''), '');
      assert.strictEqual(formatPhoneForSheets(null), '');
      assert.strictEqual(formatPhoneForSheets(undefined), '');
    });

    test('preserves plain domestic phone numbers cleanly', () => {
      assert.strictEqual(formatPhoneForSheets('9880082711'), '9880082711');
      assert.strictEqual(formatPhoneForSheets('(980) 737-1890'), '(980) 737-1890');
    });
  });

  describe('3. extractPhoneNumberFallback() with Sender Protection & Blacklist', () => {
    test('never extracts sender team phone number even if present in body', () => {
      const email = `Thanks for writing in. We need 2 developers.
Regards,
Alex
From: Outreach <outreach@hireologist.co.in>
Phone: +91 9829242624`;

      const extracted = extractPhoneNumberFallback(email);
      assert.strictEqual(extracted, '');
    });

    test('rejects blacklisted internal numbers passed via options', () => {
      const email = `Please call our office at +91 9829242624 to discuss.`;
      const extracted = extractPhoneNumberFallback(email, {
        blacklistNumbers: ['919829242624', '9829242624']
      });
      assert.strictEqual(extracted, '', 'Should reject known internal sender phone');
    });

    test('extracts genuine prospect phone number when present', () => {
      const email = `Hi Urvashi,
We are open to discussing. Please call me at 9880082711 tomorrow at 2 PM.
Thanks,
HR Team`;
      const extracted = extractPhoneNumberFallback(email);
      assert.strictEqual(extracted, '9880082711');
    });

    test('extracts US phone with extension or standard formatting', () => {
      const email = `Reach out to our hiring desk at (980) 737-1890 to coordinate.`;
      const extracted = extractPhoneNumberFallback(email);
      assert.strictEqual(extracted, '(980) 737-1890');
    });
  });

  describe('4. B2B Reply Taxonomy AI Simulation Tests', () => {
    const createMockGroq = (simulatedResponse) => ({
      chat: {
        completions: {
          create: async () => ({
            choices: [{
              message: {
                content: JSON.stringify(simulatedResponse)
              }
            }]
          })
        }
      }
    });

    test('Archetype 1: Quote / Pricing / Commercials Request -> POSITIVE', async () => {
      const mockGroq = createMockGroq({
        sentiment: 'POSITIVE',
        summary: 'Manish requests a quote for the recruitment proposal.',
        phone: ''
      });
      const res = await classifyEmailWithAi(mockGroq, 'Please share your charges and standard quotation for our review.');
      assert.strictEqual(res.sentiment, 'POSITIVE');
      assert.ok(res.summary.includes('quote'));
      assert.strictEqual(res.phone, '');
    });

    test('Archetype 2: Meeting / Call Scheduling Request -> POSITIVE with Phone', async () => {
      const mockGroq = createMockGroq({
        sentiment: 'POSITIVE',
        summary: 'Lead wants to connect tomorrow between 12pm and 1pm.',
        phone: '9116592910'
      });
      const res = await classifyEmailWithAi(mockGroq, 'Happy to connect. Please call me at 9116592910 tomorrow between 12pm and 1pm.');
      assert.strictEqual(res.sentiment, 'POSITIVE');
      assert.strictEqual(res.phone, '9116592910');
    });

    test('Archetype 3: Direct Requirement / Job Description Shared -> POSITIVE', async () => {
      const mockGroq = createMockGroq({
        sentiment: 'POSITIVE',
        summary: 'Lead shares requirement for 2 Full Stack Developers and asks for hiring plan.',
        phone: ''
      });
      const res = await classifyEmailWithAi(mockGroq, 'We are currently hiring 2 Full Stack Developers. Send profiles.');
      assert.strictEqual(res.sentiment, 'POSITIVE');
    });

    test('Archetype 4: Sub-Vendor / Empanelment Agreement Proposal -> POSITIVE', async () => {
      const mockGroq = createMockGroq({
        sentiment: 'POSITIVE',
        summary: 'Lead shares sub-vendor terms with 4% fee and 90-day clawback period.',
        phone: ''
      });
      const res = await classifyEmailWithAi(mockGroq, 'We work with sub-vendors on a 4% fee with 90 days replacement.');
      assert.strictEqual(res.sentiment, 'POSITIVE');
    });

    test('Archetype 5: Capability / Scope Inquiry (Non-IT, US Staffing) -> POSITIVE', async () => {
      const mockGroq = createMockGroq({
        sentiment: 'POSITIVE',
        summary: 'Lead inquires if service supports non-IT sales roles or US staffing.',
        phone: ''
      });
      const res = await classifyEmailWithAi(mockGroq, 'Do you support non-IT onsite hiring for BDE/BDM roles?');
      assert.strictEqual(res.sentiment, 'POSITIVE');
    });

    test('Archetype 6: Referral to Colleague / Careers Portal -> NEUTRAL', async () => {
      const mockGroq = createMockGroq({
        sentiment: 'NEUTRAL',
        summary: 'Lead asks to reach out to their HR department or portal.',
        phone: ''
      });
      const res = await classifyEmailWithAi(mockGroq, 'Please reach out directly to our HR team at hr@company.com.');
      assert.strictEqual(res.sentiment, 'NEUTRAL');
    });

    test('Archetype 7: Direct Objection / Not Interested -> NEGATIVE', async () => {
      const mockGroq = createMockGroq({
        sentiment: 'NEGATIVE',
        summary: 'Lead states they are not interested and do not need external support.',
        phone: ''
      });
      const res = await classifyEmailWithAi(mockGroq, 'We are not looking for any recruitment support at this time. Not interested.');
      assert.strictEqual(res.sentiment, 'NEGATIVE');
    });

    test('Archetype 8: Out of Office Auto-responder -> OOO', async () => {
      const mockGroq = createMockGroq({
        sentiment: 'OOO',
        summary: 'Auto-reply: Out of office until next Monday.',
        phone: ''
      });
      const res = await classifyEmailWithAi(mockGroq, 'Thank you for contacting me. I am currently out of office returning Monday.');
      assert.strictEqual(res.sentiment, 'OOO');
    });

    test('AI Phone Extraction rejects internal blacklist numbers', async () => {
      const mockGroq = createMockGroq({
        sentiment: 'POSITIVE',
        summary: 'Lead asks for details.',
        phone: '+91 9829242624' // AI mistakenly pulled Hireologist number
      });
      const res = await classifyEmailWithAi(mockGroq, 'Please send details.', {
        blacklistNumbers: ['919829242624', '9829242624']
      });
      // The internal number must be sanitized out
      assert.strictEqual(res.phone, '', 'Must not retain blacklisted sender phone number');
    });
  });
});
