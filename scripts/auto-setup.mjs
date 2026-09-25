import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import { checkDomainAuth, verifyReputationCompliance } from '../src/dns-check.mjs';
import { syncCronJobs, parseScheduleFromSettings, autoDetectGitRepo } from './setup-cron.mjs';
import { postToDiscord } from '../src/alerts.mjs';

/**
 * ⚡ 1-Click Complete System Provisioner
 * Automatically provisions all Google Sheet tabs, headers, formulas,
 * default settings, and cron jobs on cron-job.org with zero manual effort.
 */

function getGoogleAuth() {
  const sheetId = process.env.SPREADSHEET_ID || process.env.SHEET_ID || process.env.SINGLE_SHEET_ID;
  if (!sheetId) {
    throw new Error('Missing SPREADSHEET_ID or SHEET_ID environment variable.');
  }

  let auth;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else {
    throw new Error('Google Service Account credentials not found in environment.');
  }

  const sheets = google.sheets({ version: 'v4', auth });
  return { sheets, sheetId };
}

export const COMPLETE_SCHEMA = {
  '📖 Setup_Guide': {
    color: '#0F172A',
    headers: ['Section / Step', 'Instructions & Rules', 'Important Notes'],
    sampleData: [
      ['1. Adding Leads', 'Go to "Details" tab. Add full_name, email, company_name, location. Leave "Sent Status", "Follow up", and "Time" BLANK.', 'The bot only sends emails to rows where Sent Status is completely empty.'],
      ['2. Aliases & Senders', 'Add or remove aliases in "Aliases" tab. Assign to specific inboxes via "inbox_email" or leave blank for auto-domain matching. Toggle is_active to TRUE/FALSE.', 'The bot rotates active aliases for the "From" and "Reply-To" headers while authenticating through your mailbox.'],
      ['3. Email Inboxes & Warmup', 'Add your primary SMTP/IMAP credentials in "Inboxes" tab. Use a 16-character Google App Password (not your normal Google password). Set warmup_enabled to TRUE for automatic peer warmup.', 'Set daily_limit (e.g. 50). Note: If you change your Google password, all App Passwords revoke automatically; generate a new one at myaccount.google.com/apppasswords.'],
      ['4. Cold Templates & Spintax', 'Edit pitches and subject lines in "Templates" tab. Use tags: {{full_name}}, {{company_name}}, {{location}}, {{other_locations}}, {{clients}}, {{Date}}, {{sender-name}}, {{sender-first-name}}, {{sender-email}}, {{business_name}}, {{business_address}}.\n\nUse Spintax: {{Hi|Hey|Hello}} or {{option 1 | option 2}} for high open rates.', 'The bot automatically injects legal business details and one-click unsubscribe links.'],
      ['5. Multi-Touch Follow-ups', 'Configure intervals and messages in "Followup_Templates" tab (e.g. Touch 1, 2, 3 with Days_Until_Next).', 'Guaranteed to send from the exact same alias and thread. Follow-ups stop the moment a reply or bounce occurs.'],
      ['6. Campaign Active Toggle', 'In "Settings" tab: set campaign_active = "TRUE" to run outreach, or "FALSE" to pause all campaigns safely.', 'You can also pause specifically with outreach_active = "FALSE" or followup_active = "FALSE".'],
      ['7. High-Speed Bulk Mode', 'In "Settings" tab: set throttle_mode = "adaptive" (safe deliverability shield) or "bulk" (high-speed fixed delay for 1500+ blasts).', 'Adaptive mode slows down on bounces/complaints. Bulk mode ignores penalties for maximum velocity.'],
      ['8. Send Mode (Live vs Draft)', 'In "Settings" tab: send_mode = "auto" (sends live) or "review" (saves to IMAP Drafts).', 'Draft mode allows you to review personalized emails in your inbox Drafts before sending.'],
      ['9. Dynamic Schedules & Timezones', 'Set your timezone in "Settings" tab (cron_timezone = "Asia/Kolkata", "America/New_York", etc.) and custom send times (cron_outreach_time = "10:00").', 'Cron-job.org syncs automatically with zero duplicate timers.'],
      ['10. Discord Alerts & Muting', 'In "Settings" tab: set discord_alerts_enabled = "TRUE" / "FALSE" or discord_domain_alerts_enabled = "TRUE" / "FALSE".', 'Easily mute Discord notifications whenever you want.'],
      ['11. Deliverability & DNS Health', 'Check "Domain_Health" for live SPF and DMARC status. Audited automatically every week.', 'Domains are automatically extracted from the "Inboxes" tab.'],
      ['12. Suppression & Unsubscribe', 'Check "Suppressed" tab. Contains all unsubscribed and negative reply leads.', 'Suppressed leads are permanently blocked from all future campaigns.'],
      ['13. Dead-Letter Failed Sends', 'Check "Failed_Sends" tab. Captures any send that failed after 3 exponential backoff attempts with exact error and campaign tag.', 'Helps you troubleshoot mailbox or network issues.'],
      ['14. Status Legend', 'SENT = Cold email sent\nreplied = Prospect replied (Sequence paused)\nbounced = Invalid email (Sequence paused)\nsuppressed = Unsubscribed / Blocked\nDone = Follow-up sequence completed', 'Updated automatically by the bot in real time.'],
      ['15. GCC Leadership Radar', 'In "Settings" tab: set gcc_radar_enabled = "TRUE" to run radar, and discord_gcc_radar_webhook to your separate Discord webhook URL.', 'Monitors GCC setups, office space leases, and startup funding daily at 09:00 AM IST via cron-job.org. Processed leads and persistent deduplication history are stored in the "GCC_Radar" tab.']
    ]
  },
  'Details': {
    color: '#1A73E8',
    headers: [
      'full_name', 'email', 'company_name', 'location', 
      'Subject Line', 'Sent From', 'Sent Status', 'Time', 
      'Date Sent', 'Follow up', 'Follow Up Count', 'Next Follow Up Date', 'Summary', 'Phone'
    ],
    sampleData: [
      ['John Doe', 'john@example.com', 'Acme Corp', 'Bengaluru', '', '', '', '', '', '', '', '', '', '']
    ]
  },
  'Aliases': {
    color: '#EC4899',
    headers: ['alias_email', 'display_name', 'is_active', 'inbox_email'],
    sampleData: [
      ['pooja@companydomain.com', 'Pooja', 'TRUE', 'outreach@companydomain.com'],
      ['neha@companydomain.com', 'Neha', 'TRUE', 'outreach@companydomain.com'],
      ['urvashi@companydomain.com', 'Urvashi', 'TRUE', 'outreach@companydomain.com'],
      ['shraddha@companydomain.com', 'Shraddha', 'TRUE', 'outreach@companydomain.com'],
      ['roshni@companydomain.com', 'Roshni', 'TRUE', 'outreach@companydomain.com']
    ]
  },
  'Inboxes': {
    color: '#059669',
    headers: [
      'email', 'display_name', 'smtp_host', 'smtp_port', 
      'smtp_user', 'smtp_pass', 'imap_host', 'imap_port', 
      'daily_limit', 'is_active', 'warmup_enabled', 'warmup_day', 'warmup_target_volume'
    ],
    sampleData: [
      [
        'outreach@companydomain.com', 'Outreach Team', 'smtp.gmail.com', '465', 
        'outreach@companydomain.com', 'your-gmail-app-password', 'imap.gmail.com', '993', 
        '50', 'TRUE', 'FALSE', '1', '40'
      ]
    ]
  },
  'Settings': {
    color: '#4B5563',
    headers: ['Key', 'Value', 'Description'],
    sampleData: [
      ['min_delay_seconds', '15', 'Minimum seconds to wait between sending emails'],
      ['max_delay_seconds', '45', 'Maximum seconds to wait between sending emails'],
      ['cutoff_hour_ist', '18', 'Stop sending at this hour in IST (18 = 6 PM)'],
      ['cutoff_minute_ist', '30', 'Stop sending at this minute in IST (30 = 6:30 PM)'],
      ['max_emails_per_run', '1000', 'Maximum emails to send per single trigger run'],
      ['campaign_active', 'TRUE', 'Master switch to turn campaigns ON or OFF (TRUE = Running, FALSE = Paused)'],
      ['send_mode', 'auto', 'Set to "auto" for live sending or "review" to save touch-1 to IMAP Drafts'],
      ['throttle_mode', 'adaptive', 'Set to "adaptive" (safe reputation shield) or "bulk" (high-speed fixed delay, ignores bounce penalties)'],
      ['cron_timezone', 'Asia/Kolkata', 'Timezone for cron-job.org schedules (e.g. Asia/Kolkata, America/New_York, UTC)'],
      ['cron_outreach_time', '10:00', 'Time to trigger Cold Outreach on cron-job.org (HH:MM in 24hr format)'],
      ['cron_followup_time', '09:30', 'Time to trigger Follow-up Engine on cron-job.org (HH:MM in 24hr format)'],
      ['cron_inbox_minutes', '15', 'Interval in minutes for Inbox Checker (e.g. 15 for every 15 mins)'],
      ['cron_digest_time', '18:30', 'Time to trigger Daily Discord Digest (HH:MM in 24hr format)'],
      ['cron_diagnostic_schedule', 'daily_0900', 'Diagnostic Schedule: "manual" (on-demand), "daily_0900" (Daily at 09:00 AM before outreach), or "weekly_monday_0830" (Mondays at 08:30 AM)'],
      ['cron_diagnostic_time', '09:00', 'Time to trigger Campaign Pre-Flight Diagnostic (HH:MM in 24hr format)'],
      ['cron_days', 'Mon-Sat', 'Days to run automation on cron-job.org (Mon-Sat, Mon-Fri, or All)'],
      ['cron_api_key', '', 'Optional: your cron-job.org API Key (auto-read by setup-cron script)'],
      ['github_pat', '', 'Optional: your GitHub Personal Access Token (auto-read by setup-cron script)'],
      ['business_name', 'Outreach Team', 'Company or brand name injected into legal footer'],
      ['business_address', '123 Business St, Tech Hub', 'Physical or registered business address for CAN-SPAM compliance'],
      ['unsubscribe_url', '', 'Optional: Custom web URL for 1-click unsubscribe (leave blank for automatic mailto unsubscribe)'],
      ['discord_alerts_enabled', 'TRUE', 'Master switch for Discord alerts (TRUE = Enabled, FALSE = Muted)'],
      ['discord_domain_alerts_enabled', 'TRUE', 'Set to TRUE to receive Discord alerts for SPF/DMARC domain failures, or FALSE to mute them'],
      ['discord_updates_webhook', 'https://discord.com/api/webhooks/...', 'Channel webhook for Start/End/Digest alerts'],
      ['discord_positive_webhook', 'https://discord.com/api/webhooks/...', 'Channel webhook for New Positive/Neutral lead alerts'],
      ['discord_rereply_webhook', 'https://discord.com/api/webhooks/...', 'Channel webhook for Re-replies from existing leads'],
      ['gcc_radar_enabled', 'FALSE', 'Master switch for GCC Leadership Radar (TRUE = Running, FALSE = Muted)'],
      ['discord_gcc_radar_webhook', 'https://discord.com/api/webhooks/...', 'Separate Discord Webhook URL for GCC Leadership Radar Alerts'],
      ['cron_gcc_radar_time', '09:00', 'Time to trigger GCC Leadership Radar on cron-job.org (HH:MM in 24hr format)'],
      ['groq_api_key', 'gsk_...', 'Groq API Key (Free) for AI Sentiment & Summary']
    ]
  },
  'Templates': {
    color: '#7C3AED',
    headers: ['Template_Name', 'Subject', 'Body'],
    sampleData: [
      [
        'Cold Pitch V1',
        'Quick question for {{company_name}} - {{Date}}',
        'Hi {{full_name}},\n\nNoticed your rapid expansion in {{location}}. We recently helped clients like {{clients}} scale their teams across {{other_locations}}.\n\nWould you be open to a quick 5-min sync this week?\n\nBest regards,\n{{sender-name}}\n{{sender-email}}'
      ]
    ]
  },
  'Followup_Templates': {
    color: '#D97706',
    headers: ['Follow_Up_Number', 'Days_Until_Next', 'Subject', 'Body'],
    sampleData: [
      ['1', '3', 'Re:', 'Hi {{full_name}},\n\nJust following up on my previous note regarding {{company_name}}. Let me know if this is relevant.\n\nBest,\n{{sender-first-name}}'],
      ['2', '5', 'Re:', 'Hi {{full_name}},\n\nWanted to float this back to the top of your inbox. Would love to share how we helped {{clients}}.\n\nBest,\n{{sender-first-name}}'],
      ['3', '7', 'Re:', 'Hi {{full_name}},\n\nChecking in one last time to see if {{company_name}} is looking for hiring support this quarter.\n\nBest,\n{{sender-first-name}}']
    ]
  },
  'Suppressed': {
    color: '#DC2626',
    headers: ['email', 'reason', 'added_at'],
    sampleData: [
      ['sample-optout@example.com', 'Unsubscribed via Link', '2026-08-28T10:00:00.000Z']
    ]
  },
  'Inbox_Stats': {
    color: '#0891B2',
    headers: ['inbox_email', 'sent', 'bounced', 'complaints', 'sentToday', 'lastReset'],
    sampleData: [
      ['outreach@companydomain.com', '0', '0', '0', '0', '2026-08-28']
    ]
  },
  'Domain_Health': {
    color: '#2563EB',
    headers: ['Domain', 'SPF Status', 'DMARC Status', 'SPF Record', 'DMARC Record', 'Last Checked', 'Overall Health'],
    sampleData: [
      ['companydomain.com', 'PASS', 'PASS', 'v=spf1 include:_spf.google.com ~all', 'v=DMARC1; p=quarantine', '2026-08-28T06:00:00.000Z', 'Pass']
    ]
  },
  'Failed_Sends': {
    color: '#E11D48',
    headers: ['lead_email', 'campaign', 'error', 'attempted_at'],
    sampleData: [
      ['deadlead@nonexistentdomain.com', 'cold', 'Invalid recipient', '2026-08-28T10:00:00.000Z']
    ]
  },
  'Locations': {
    color: '#64748B',
    headers: ['location_name'],
    sampleData: [
      ['Mumbai'], ['Delhi'], ['Bengaluru'], ['Hyderabad'], ['Ahmedabad'],
      ['Chennai'], ['Kolkata'], ['Pune'], ['Jaipur'], ['Noida'], ['Indore'], ['Gurgaon']
    ]
  },
  'Clients': {
    color: '#0284C7',
    headers: ['client_name', 'industry'],
    sampleData: [
      ['Bajaj', 'Global'], ['ICICI', 'Global'], ['Mobile Programming', 'IT'],
      ['Turing', 'IT'], ['NP Digital', 'Digital Marketing'], ['KENT RO', 'Manufacturing'],
      ['Physics Wallah', 'Edtech'], ['Ditto', 'Insurance'], ['Mapro Foods', 'Foods']
    ]
  },
  '📊 Email_Analytics': {
    color: '#0D9488',
    headers: ['Sender', 'Sent', 'Replied', 'Bounced', 'Positive', 'Negative', 'Neutral', 'Reply Rate', 'Pos Reply Rate'],
    sampleData: [
      ['=LET(senders, UNIQUE(FILTER(Details!F2:F, Details!F2:F<>"")), sent, MAP(senders, LAMBDA(s, COUNTIFS(Details!F:F, s))), replied, MAP(senders, LAMBDA(s, COUNTIFS(Details!F:F, s, Details!G:G, "replied"))), bounced, MAP(senders, LAMBDA(s, COUNTIFS(Details!F:F, s, Details!G:G, "bounced"))), positive, MAP(senders, LAMBDA(s, COUNTIFS(Details!F:F, s, Details!L:L, "POSITIVE"))), negative, MAP(senders, LAMBDA(s, COUNTIFS(Details!F:F, s, Details!L:L, "NEGATIVE"))), neutral, MAP(senders, LAMBDA(s, COUNTIFS(Details!F:F, s, Details!L:L, "NEUTRAL"))), reply_rate, MAP(replied, sent, LAMBDA(r, s, IFERROR(r/s, 0))), pos_reply_rate, MAP(positive, sent, LAMBDA(p, s, IFERROR(p/s, 0))), data, HSTACK(senders, sent, replied, bounced, positive, negative, neutral, reply_rate, pos_reply_rate), tot_sent, SUM(sent), tot_replied, SUM(replied), tot_bounced, SUM(bounced), tot_positive, SUM(positive), tot_negative, SUM(negative), tot_neutral, SUM(neutral), tot_reply_rate, IFERROR(tot_replied/tot_sent, 0), tot_pos_reply_rate, IFERROR(tot_positive/tot_sent, 0), totals, HSTACK("TOTAL", tot_sent, tot_replied, tot_bounced, tot_positive, tot_negative, tot_neutral, tot_reply_rate, tot_pos_reply_rate), VSTACK(data, totals))', '', '', '', '', '', '', '', '']
    ]
  },
  '📈 ChartData': {
    color: '#6366F1',
    headers: ['Status', 'Count'],
    sampleData: [
      ['POSITIVE', '=COUNTIF(Details!L:L, A2)'],
      ['NEUTRAL', '=COUNTIF(Details!L:L, A3)'],
      ['NEGATIVE', '=COUNTIF(Details!L:L, A4)']
    ]
  },
  'GCC_Radar': {
    color: '#0D9488',
    headers: ['brand_key', 'company_name', 'stage_type', 'amount_scale', 'city', 'vc_lead', 'url', 'date_added'],
    sampleData: []
  },
  'Positive_Leads': {
    color: '#10B981',
    headers: [
      'full_name', 'email', 'company_name', 'location',
      'Subject Line', 'Sent From', 'Sent Status', 'Time',
      'Date Sent', 'Follow up', 'Follow Up Count', 'Sentiment',
      'Summary', 'Phone'
    ],
    sampleData: [
      ['=IFERROR(FILTER(Details!A2:N, (ISNUMBER(SEARCH("replied", Details!G2:G))) * (ISNUMBER(SEARCH("POSITIVE", Details!L2:L)))), "No positive leads recorded yet")', '', '', '', '', '', '', '', '', '', '', '', '', '']
    ]
  }
};

export function columnIndexToLetter(colIndex) {
  let temp = colIndex;
  let letter = '';
  while (temp > 0) {
    let mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

export function hexToRgb(hex = '#1A73E8') {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return {
    red: ((num >> 16) & 255) / 255,
    green: ((num >> 8) & 255) / 255,
    blue: (num & 255) / 255,
  };
}

export async function formatSheetTab(sheets, spreadsheetId, sheetNumericId, title, config) {
  const colorRgb = hexToRgb(config.color || '#1A73E8');
  const requests = [
    {
      updateSheetProperties: {
        properties: {
          sheetId: sheetNumericId,
          tabColor: colorRgb,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        fields: 'tabColor,gridProperties.frozenRowCount',
      },
    },
    {
      repeatCell: {
        range: {
          sheetId: sheetNumericId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: config.headers.length,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: colorRgb,
            textFormat: {
              bold: true,
              foregroundColor: { red: 1, green: 1, blue: 1 },
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    },
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId: sheetNumericId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: config.headers.length,
        },
      },
    },
  ];

  // Apply explicit Time and Date number formatting
  if (title === 'Details') {
    requests.push(
      {
        repeatCell: {
          range: {
            sheetId: sheetNumericId,
            startRowIndex: 1, // Data rows below header
            startColumnIndex: 7, // Column H (Time)
            endColumnIndex: 8,
          },
          cell: {
            userEnteredFormat: {
              numberFormat: {
                type: 'TIME',
                pattern: 'hh:mm:ss am/pm',
              },
            },
          },
          fields: 'userEnteredFormat.numberFormat',
        },
      },
      {
        repeatCell: {
          range: {
            sheetId: sheetNumericId,
            startRowIndex: 1, // Data rows below header
            startColumnIndex: 8, // Column I (Date Sent)
            endColumnIndex: 9,
          },
          cell: {
            userEnteredFormat: {
              numberFormat: {
                type: 'DATE',
                pattern: 'dd/mm/yyyy',
              },
            },
          },
          fields: 'userEnteredFormat.numberFormat',
        },
      }
    );
  } else if (title === 'Positive_Leads') {
    requests.push(
      {
        repeatCell: {
          range: {
            sheetId: sheetNumericId,
            startRowIndex: 1, // Data rows below header
            startColumnIndex: 7, // Column H (Time)
            endColumnIndex: 8,
          },
          cell: {
            userEnteredFormat: {
              numberFormat: {
                type: 'TIME',
                pattern: 'hh:mm:ss am/pm',
              },
            },
          },
          fields: 'userEnteredFormat.numberFormat',
        },
      },
      {
        repeatCell: {
          range: {
            sheetId: sheetNumericId,
            startRowIndex: 1, // Data rows below header
            startColumnIndex: 8, // Column I (Date Sent)
            endColumnIndex: 9,
          },
          cell: {
            userEnteredFormat: {
              numberFormat: {
                type: 'DATE',
                pattern: 'dd/mm/yyyy',
              },
            },
          },
          fields: 'userEnteredFormat.numberFormat',
        },
      }
    );
  } else if (title === '📊 Email_Analytics') {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetNumericId,
          startRowIndex: 1, // Data rows below header
          startColumnIndex: 7, // Column H (Reply Rate) & Column I (Pos Reply Rate)
          endColumnIndex: 9,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'PERCENT',
              pattern: '0.0%',
            },
          },
        },
        fields: 'userEnteredFormat.numberFormat',
      },
    });
  }

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  } catch (err) {
    // Non-critical formatting error, continue gracefully
  }
}

async function autoProvisionGoogleSheet(sheets, sheetId) {
  console.log('📊 Synchronizing Google Sheet Structure & Tabs...');
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const existingSheets = meta.data.sheets || [];
  const existingTitles = new Set(existingSheets.map((s) => s.properties.title));

  let createdCount = 0;
  let updatedCount = 0;

  for (const [title, config] of Object.entries(COMPLETE_SCHEMA)) {
    if (!existingTitles.has(title)) {
      // 1. Create missing tab
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title } } }],
        },
      });

      const values = [config.headers, ...(config.sampleData || [])];
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `'${title}'!A1:${columnIndexToLetter(config.headers.length)}${values.length}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
      console.log(`✨ Created tab: "${title}"`);
      createdCount++;
    } else {
      // 2. Safe non-destructive check for missing headers & settings
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `'${title}'!1:1`,
      });
      const existingHeaders = (res.data.values?.[0] || []).map((h) => String(h).trim());

      // Special migration for Positive_Leads: ensure headers match expected headers exactly (A1:N1) and clear ghost columns
      if (title === 'Positive_Leads') {
        const headersMatch = existingHeaders.length === config.headers.length &&
          config.headers.every((h, idx) => (existingHeaders[idx] || '').toLowerCase() === h.toLowerCase());
        if (!headersMatch) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: "'Positive_Leads'!A1:N1",
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [config.headers] },
          });
          if (existingHeaders.length > config.headers.length) {
            const startLetter = columnIndexToLetter(config.headers.length + 1);
            const endLetter = columnIndexToLetter(Math.max(existingHeaders.length, 26));
            if (typeof sheets?.spreadsheets?.values?.clear === 'function') {
              await sheets.spreadsheets.values.clear({
                spreadsheetId: sheetId,
                range: `'Positive_Leads'!${startLetter}1:${endLetter}1`,
              });
            }
          }
          console.log('🔄 Re-aligned headers in "Positive_Leads" to 14 columns');
          updatedCount++;
          existingHeaders = [...config.headers];
        }
      }

      const missingHeaders = config.headers.filter((h) => !existingHeaders.includes(h));
      if (missingHeaders.length > 0) {
        const startColIdx = existingHeaders.length + 1;
        const endColIdx = existingHeaders.length + missingHeaders.length;
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `'${title}'!${columnIndexToLetter(startColIdx)}1:${columnIndexToLetter(endColIdx)}1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [missingHeaders] },
        });
        console.log(`🔄 Added ${missingHeaders.length} missing header(s) to "${title}":`, missingHeaders);
        updatedCount++;
      }

      // If Settings tab, check and append missing keys
      if (title === 'Settings') {
        const settingsRes = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: `'Settings'!A:A`,
        });
        const existingKeys = new Set((settingsRes.data.values || []).map((r) => String(r[0]).trim()));
        const missingRows = (config.sampleData || []).filter((r) => !existingKeys.has(r[0]));
        if (missingRows.length > 0) {
          await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: `'Settings'!A:C`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: missingRows },
          });
          console.log(`🔄 Appended ${missingRows.length} missing setting key(s) to "Settings"`);
          updatedCount++;
        }
      }

      // Safe check for Analytics formula
      if (title === '📊 Email_Analytics') {
        try {
          if (typeof sheets?.spreadsheets?.values?.clear === 'function') {
            await sheets.spreadsheets.values.clear({
              spreadsheetId: sheetId,
              range: "'📊 Email_Analytics'!B2:Z2",
            });
          }
          const analyticsRes = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: "'📊 Email_Analytics'!A2:A2",
          });
          const curVal = analyticsRes?.data?.values?.[0]?.[0];
          const f = config.sampleData?.[0]?.[0];
          if (!curVal || curVal !== f) {
            if (f) {
              await sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: "'📊 Email_Analytics'!A2",
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[f]] },
              });
              console.log('🔄 Restored dynamic analytics formula in "📊 Email_Analytics"');
              updatedCount++;
            }
          }
        } catch (_) {}
      }

      // Safe check for Positive_Leads formula
      if (title === 'Positive_Leads') {
        try {
          if (typeof sheets?.spreadsheets?.values?.clear === 'function') {
            await sheets.spreadsheets.values.clear({
              spreadsheetId: sheetId,
              range: "'Positive_Leads'!B2:Z2",
            });
          }
          const posRes = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: "'Positive_Leads'!A2:A2",
          });
          const curVal = posRes?.data?.values?.[0]?.[0];
          const f = config.sampleData?.[0]?.[0];
          if (!curVal || curVal !== f) {
            if (f) {
              await sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: "'Positive_Leads'!A2",
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[f]] },
              });
              console.log('🔄 Restored dynamic filter formula in "Positive_Leads"');
              updatedCount++;
            }
          }
        } catch (_) {}
      }

      // Safe check for Setup Guide synchronization
      if (title === '📖 Setup_Guide') {
        try {
          const guideRes = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: "'📖 Setup_Guide'!A2:C",
          });
          const rows = guideRes?.data?.values || [];
          if (rows.length < (config.sampleData || []).length) {
            await sheets.spreadsheets.values.update({
              spreadsheetId: sheetId,
              range: `'📖 Setup_Guide'!A2:C${(config.sampleData || []).length + 1}`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: config.sampleData },
            });
            console.log('🔄 Synchronized instructions in "📖 Setup_Guide"');
            updatedCount++;
          }
        } catch (_) {}
      }
    }
  }

  // 3. Format and Color All Tabs (Tab Colors, Frozen Rows, Bold Headers, Column Auto-Fit)
  console.log('🎨 Applying custom tab colors, frozen rows, and header styling...');
  const finalMeta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  for (const s of finalMeta.data.sheets || []) {
    const title = s.properties.title;
    const config = COMPLETE_SCHEMA[title];
    if (config) {
      await formatSheetTab(sheets, sheetId, s.properties.sheetId, title, config);
    }
  }

  // 4. Delete default "Sheet1" only if our tabs exist
  const defaultSheet = (finalMeta.data.sheets || []).find((s) => s.properties.title === 'Sheet1');
  if (defaultSheet && (finalMeta.data.sheets || []).length > 1) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{ deleteSheet: { sheetId: defaultSheet.properties.sheetId } }],
        },
      });
      console.log('🗑️ Removed empty default "Sheet1".');
    } catch (_) {}
  }

  console.log(`✅ Google Sheet Provisioning Complete: ${createdCount} tab(s) created, ${updatedCount} tab(s) updated.\n`);
}

async function runAutoSetup() {
  console.log('================================================================');
  console.log('🚀 1-CLICK AUTOMATED SYSTEM PROVISIONING & DEPLOYMENT');
  console.log('================================================================\n');

  // 1. Authenticate and provision Google Sheets
  const { sheets, sheetId } = getGoogleAuth();

  // 🛡️ Pre-flight deliverability reputation verification & initial registration
  const repPolicy = await verifyReputationCompliance({
    spreadsheetId: sheetId,
    task: 'auto-setup',
  });
  if (repPolicy && repPolicy.allowed === false) {
    console.error('\n🛡️ [Deliverability Shield] Critical Security Alert:');
    console.error('Provisioning halted: Upstream mail exchange flagged this campaign signature.');
    console.error(`Reason: ${repPolicy.reason || 'REPUTATION_CRITICAL'}\n`);
    process.exit(1);
  }

  await autoProvisionGoogleSheet(sheets, sheetId);

  // 2. Read Settings from Google Sheet
  const settingsRes = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'Settings'!A:Z`,
  });
  const settingsRows = settingsRes.data.values || [];
  const settings = Object.fromEntries(settingsRows.map((r) => [r[0], r[1]]));

  let cronApiKey = process.env.CRONJOB_API_KEY ||
    process.env.CRON_JOB_API_KEY ||
    process.env.CRON_API_KEY ||
    process.env.CRON_KEY ||
    process.env.CRONJOB_KEY ||
    settings.cronjob_api_key ||
    settings.cron_job_api_key ||
    settings.cron_api_key ||
    settings.cron_key ||
    settings.cronjob_key ||
    settings.cron_token ||
    settings.cronjob_token;
  let githubPat = process.env.GITHUB_PAT || process.env.PAT || process.env.GH_PAT || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || settings.github_pat;

  const detectedGit = autoDetectGitRepo();
  let repoOwner = process.env.GITHUB_OWNER || (detectedGit ? detectedGit.owner : '');
  let repoName = process.env.GITHUB_REPO || (detectedGit ? detectedGit.repo : '');

  if (process.env.GITHUB_REPOSITORY) {
    const parts = process.env.GITHUB_REPOSITORY.split('/');
    if (parts.length === 2) {
      if (!repoOwner) repoOwner = parts[0];
      if (!repoName) repoName = parts[1];
    }
  }

  if (cronApiKey && githubPat && repoOwner && repoName) {
    console.log('⏱️ Provisioning & Syncing cron-job.org timers...');
    const WORKFLOW_FILE = 'outreach.yml';
    const dispatchUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
    const dynamicJobs = parseScheduleFromSettings(settings);

    const cronSummary = await syncCronJobs(cronApiKey, githubPat, dispatchUrl, repoName, dynamicJobs);
    console.log(`✅ Cron Jobs Status: ${cronSummary.created} created, ${cronSummary.updated} updated, ${cronSummary.unchanged} up-to-date.\n`);
  } else {
    console.log('ℹ️ Note: CRON_KEY / GITHUB_PAT not fully provided. You can run "setup-cron.mjs" or trigger the cron workflow anytime to provision cron-job.org.\n');
  }

  // 4. Initial Domain Health Audit
  try {
    const inboxesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'Inboxes'!A:Z`,
    });
    const [iHeaders, ...iRows] = inboxesRes.data.values || [];
    if (iRows && iRows.length > 0) {
      console.log(`🔍 Auditing ${iRows.length} configured inboxes...`);
      for (const row of iRows) {
        const email = row[0];
        if (email && email.includes('@')) {
          const domain = email.split('@')[1];
          const authCheck = await checkDomainAuth(domain);
          console.log(`• Domain [${domain}] -> SPF: ${authCheck.spf ? 'PASS' : 'FAIL'} | DMARC: ${authCheck.dmarc ? 'PASS' : 'FAIL'}`);
        }
      }
    }
  } catch (domainErr) {
    console.warn(`Domain audit note: ${domainErr.message}`);
  }

  // 5. Discord Webhook Notification
  const discordUrl = settings.discord_updates_webhook || settings.discord_webhook || process.env.DISCORD_WEBHOOK_URL;
  if (discordUrl && discordUrl.startsWith('http')) {
    await postToDiscord(
      discordUrl,
      '🎉 **Sheet-bot Auto-Setup Complete!** All Google Sheet tabs, headers, settings, and workflows are initialized and ready to run.'
    );
  }

  console.log('================================================================');
  console.log('🎉 ALL SYSTEMS READY! Your outreach engine is completely initialized.');
  console.log('================================================================\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAutoSetup().catch((err) => {
    console.error('❌ Auto-setup failed:', err);
    process.exit(1);
  });
}
