/**
 * 🚀 UNIVERSAL OUTREACH BOT - GOOGLE APPS SCRIPT
 * Non-destructive sheet syncer & builder.
 * Safely adds new columns/settings/tabs without overwriting existing data.
 */

function createOutreachSystem(forceReset = false) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const schema = {
    '📖 Setup_Guide': {
      color: '#0F172A',
      headers: ['Section / Step', 'Instructions & Rules', 'Important Notes'],
      sampleData: [
        ['1. Adding Leads', 'Go to "Details" tab. Add full_name, email, company_name, location. Leave "Sent Status", "Follow up", and "Time" BLANK.', 'The bot only sends emails to rows where Sent Status is completely empty.'],
        ['2. Aliases & Senders', 'Add or remove aliases in "Aliases" tab. Assign to specific inboxes via "inbox_email" or leave blank for auto-domain matching. Toggle is_active to TRUE/FALSE.', 'The bot rotates active aliases for the "From" and "Reply-To" headers while authenticating through your mailbox.'],
        ['3. Email Inboxes & Warmup', 'Add your primary SMTP/IMAP credentials in "Inboxes" tab. Set warmup_enabled to TRUE for automatic peer warmup.', 'Set daily_limit (e.g. 50). The bot will never exceed this number per inbox per day.'],
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
        ['15. GCC Leadership Radar', 'In "Settings" tab: set gcc_radar_enabled = "TRUE" to run radar, and discord_gcc_radar_webhook to your separate Discord webhook URL.', 'Monitors GCC setups, office space leases, and startup funding daily at 09:00 AM IST via cron-job.org.']
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
        ['discord_gcc_radar_webhook', 'https://discord.com/api/webhooks/...', 'Channel webhook for GCC Leadership Radar alerts'],
        ['gcc_radar_enabled', 'FALSE', 'Set to TRUE to run GCC Leadership Radar daily, or FALSE/OFF to mute'],
        ['cron_gcc_radar_time', '09:00', 'Time to trigger GCC Leadership Radar on cron-job.org (HH:MM in 24hr IST format)'],
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
      color: '#4F46E5',
      headers: ['Domain', 'SPF Status', 'DMARC Status', 'SPF Record', 'DMARC Record', 'Last Checked', 'Overall Health'],
      sampleData: [
        ['companydomain.com', 'PASS', 'PASS', 'v=spf1 include:_spf.google.com ~all', 'v=DMARC1; p=quarantine', '2026-08-28T06:00:00.000Z', 'Pass']
      ]
    },
    'Failed_Sends': {
      color: '#B91C1C',
      headers: ['lead_email', 'campaign', 'error', 'attempted_at'],
      sampleData: [
        ['deadlead@nonexistentdomain.com', 'cold', 'Invalid recipient', '2026-08-28T10:00:00.000Z']
      ]
    },
    'Locations': {
      color: '#2563EB',
      headers: ['location_name'],
      sampleData: [
        ['Mumbai'], ['Delhi'], ['Bengaluru'], ['Hyderabad'], ['Ahmedabad'],
        ['Chennai'], ['Kolkata'], ['Pune'], ['Jaipur'], ['Noida'], ['Indore'], ['Gurgaon']
      ]
    },
    'Clients': {
      color: '#EA580C',
      headers: ['client_name', 'industry'],
      sampleData: [
        ['Bajaj', 'Global'], ['ICICI', 'Global'], ['Mobile Programming', 'IT'],
        ['Turing', 'IT'], ['NP Digital', 'Digital Marketing'], ['KENT RO', 'Manufacturing'],
        ['Physics Wallah', 'Edtech'], ['Ditto', 'Insurance'], ['Mapro Foods', 'Foods']
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

  let updatedSheetsCount = 0;
  let newSheetsCount = 0;
  let newColumnsCount = 0;
  let newSettingsCount = 0;

  Object.keys(schema).forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    const { headers, sampleData, color } = schema[sheetName];

    if (!sheet) {
      // 1. Create completely new sheet if missing
      sheet = ss.insertSheet(sheetName);
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setValues([headers]);
      headerRange.setFontWeight('bold');
      headerRange.setFontColor('#FFFFFF');
      headerRange.setBackground(color);
      headerRange.setHorizontalAlignment('center');

      if (sampleData && sampleData.length > 0) {
        sheet.getRange(2, 1, sampleData.length, sampleData[0].length).setValues(sampleData);
      }
      sheet.setFrozenRows(1);
      for (let c = 1; c <= headers.length; c++) sheet.autoResizeColumn(c);
      
      // Auto-format Time and Date columns
      if (sheetName === 'Details' || sheetName === 'Positive_Leads') {
        sheet.getRange('H2:H').setNumberFormat('hh:mm:ss am/pm');
        sheet.getRange('I2:I').setNumberFormat('dd/mm/yyyy');
      }
      newSheetsCount++;
    } else if (forceReset) {
      // 2. Hard reset only if explicitly requested
      sheet.clear();
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setValues([headers]);
      headerRange.setFontWeight('bold');
      headerRange.setFontColor('#FFFFFF');
      headerRange.setBackground(color);
      headerRange.setHorizontalAlignment('center');

      if (sampleData && sampleData.length > 0) {
        sheet.getRange(2, 1, sampleData.length, sampleData[0].length).setValues(sampleData);
      }
      sheet.setFrozenRows(1);
      for (let c = 1; c <= headers.length; c++) sheet.autoResizeColumn(c);

      if (sheetName === 'Details' || sheetName === 'Positive_Leads') {
        sheet.getRange('H2:H').setNumberFormat('hh:mm:ss am/pm');
        sheet.getRange('I2:I').setNumberFormat('dd/mm/yyyy');
      }
      updatedSheetsCount++;
    } else {
      // 3. 🛡️ SMART NON-DESTRUCTIVE SYNC: Keep all existing data and append only missing columns/keys!
      const lastCol = Math.max(sheet.getLastColumn(), 1);
      const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => (h || '').toString().trim());

      // A. Check and append any missing header columns
      headers.forEach(expectedHeader => {
        if (!existingHeaders.includes(expectedHeader)) {
          const newColIdx = sheet.getLastColumn() + 1;
          const cell = sheet.getRange(1, newColIdx);
          cell.setValue(expectedHeader);
          cell.setFontWeight('bold');
          cell.setFontColor('#FFFFFF');
          cell.setBackground(color);
          cell.setHorizontalAlignment('center');
          sheet.autoResizeColumn(newColIdx);
          newColumnsCount++;
        }
      });

      // B. Smart Settings Sync: Add missing setting keys without touching user-configured values
      if (sheetName === 'Settings') {
        const lastRow = Math.max(sheet.getLastRow(), 1);
        let existingKeys = [];
        if (lastRow > 1) {
          existingKeys = sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(r => (r[0] || '').toString().trim());
        }

        sampleData.forEach(([key, defaultValue, description]) => {
          if (!existingKeys.includes(key)) {
            sheet.appendRow([key, defaultValue, description]);
            newSettingsCount++;
          }
        });
      }

      // C. Update Setup Guide content safely
      if (sheetName === '📖 Setup_Guide') {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(2, 1, sampleData.length, sampleData[0].length).setValues(sampleData);
      }

      // D. Safe check for Positive_Leads formula and header
      if (sheetName === 'Positive_Leads') {
        sheet.getRange('B2:Z2').clearContent();
        const formulaCell = sheet.getRange(2, 1);
        const expectedFormula = '=IFERROR(FILTER(Details!A2:N, (ISNUMBER(SEARCH("replied", Details!G2:G))) * (ISNUMBER(SEARCH("POSITIVE", Details!L2:L)))), "No positive leads recorded yet")';
        if (formulaCell.getFormula() !== expectedFormula) {
          formulaCell.setFormula(expectedFormula);
        }
        const l1Cell = sheet.getRange(1, 12);
        if (String(l1Cell.getValue()).trim().toLowerCase() !== 'sentiment') {
          l1Cell.setValue('Sentiment');
        }
        const o1Cell = sheet.getRange(1, 15);
        if (o1Cell.getValue()) {
          sheet.getRange('O1:Z1').clearContent();
        }
      }

      // Ensure Time and Date formatting on Details & Positive_Leads
      if (sheetName === 'Details') {
        sheet.getRange('H2:H').setNumberFormat('hh:mm:ss am/pm');
        sheet.getRange('I2:I').setNumberFormat('dd/mm/yyyy');
      } else if (sheetName === 'Positive_Leads') {
        sheet.getRange('H2:H').setNumberFormat('hh:mm:ss am/pm');
        sheet.getRange('I2:I').setNumberFormat('dd/mm/yyyy');
      }

      sheet.setFrozenRows(1);
      updatedSheetsCount++;
    }
  });

  // ==========================================
  // 📊 1. EMAIL ANALYTICS SHEET
  // ==========================================
  let analyticsSheet = ss.getSheetByName('📊 Email_Analytics');
  if (!analyticsSheet) analyticsSheet = ss.insertSheet('📊 Email_Analytics');
  else if (forceReset) analyticsSheet.clear();

  const analyticsHeaders = ['Sender', 'Sent', 'Replied', 'Bounced', 'Positive', 'Negative', 'Neutral', 'Reply Rate', 'Pos Reply Rate'];
  const analyticsHeaderRange = analyticsSheet.getRange(1, 1, 1, analyticsHeaders.length);
  analyticsHeaderRange.setValues([analyticsHeaders]);
  analyticsHeaderRange.setFontWeight('bold');
  analyticsHeaderRange.setFontColor('#FFFFFF');
  analyticsHeaderRange.setBackground('#0D9488');
  analyticsHeaderRange.setHorizontalAlignment('center');

  const analyticsFormula = `=LET(senders, UNIQUE(FILTER(Details!F2:F, Details!F2:F<>"")), sent, MAP(senders, LAMBDA(s, COUNTIFS(Details!F:F, s))), replied, MAP(senders, LAMBDA(s, COUNTIFS(Details!F:F, s, Details!G:G, "replied"))), bounced, MAP(senders, LAMBDA(s, COUNTIFS(Details!F:F, s, Details!G:G, "bounced"))), positive, MAP(senders, LAMBDA(s, COUNTIFS(Details!F:F, s, Details!L:L, "POSITIVE"))), negative, MAP(senders, LAMBDA(s, COUNTIFS(Details!F:F, s, Details!L:L, "NEGATIVE"))), neutral, MAP(senders, LAMBDA(s, COUNTIFS(Details!F:F, s, Details!L:L, "NEUTRAL"))), reply_rate, MAP(replied, sent, LAMBDA(r, s, IFERROR(r/s, 0))), pos_reply_rate, MAP(positive, sent, LAMBDA(p, s, IFERROR(p/s, 0))), data, HSTACK(senders, sent, replied, bounced, positive, negative, neutral, reply_rate, pos_reply_rate), tot_sent, SUM(sent), tot_replied, SUM(replied), tot_bounced, SUM(bounced), tot_positive, SUM(positive), tot_negative, SUM(negative), tot_neutral, SUM(neutral), tot_reply_rate, IFERROR(tot_replied/tot_sent, 0), tot_pos_reply_rate, IFERROR(tot_positive/tot_sent, 0), totals, HSTACK("TOTAL", tot_sent, tot_replied, tot_bounced, tot_positive, tot_negative, tot_neutral, tot_reply_rate, tot_pos_reply_rate), VSTACK(data, totals))`;
  analyticsSheet.getRange(2, 1).setValue(analyticsFormula);
  analyticsSheet.setFrozenRows(1);
  analyticsSheet.getRange('H:I').setNumberFormat('0.0%');
  for (let c = 1; c <= analyticsHeaders.length; c++) analyticsSheet.autoResizeColumn(c);

  // ==========================================
  // 📈 2. CHART DATA SHEET
  // ==========================================
  let chartDataSheet = ss.getSheetByName('📈 ChartData');
  if (!chartDataSheet) chartDataSheet = ss.insertSheet('📈 ChartData');
  else if (forceReset) chartDataSheet.clear();

  // Sentiment Table
  const sentimentHeaders = ['Status', 'Count'];
  const sHeaderRange = chartDataSheet.getRange(1, 1, 1, sentimentHeaders.length);
  sHeaderRange.setValues([sentimentHeaders]);
  sHeaderRange.setFontWeight('bold');
  sHeaderRange.setFontColor('#FFFFFF');
  sHeaderRange.setBackground('#6366F1');
  sHeaderRange.setHorizontalAlignment('center');

  chartDataSheet.getRange(2, 1, 3, 2).setValues([
    ['POSITIVE', '=COUNTIF(Details!L:L, A2)'],
    ['NEUTRAL', '=COUNTIF(Details!L:L, A3)'],
    ['NEGATIVE', '=COUNTIF(Details!L:L, A4)']
  ]);

  // Sent Status Table
  const statusHeaders = ['Sent Status', 'Count'];
  const stHeaderRange = chartDataSheet.getRange(7, 1, 1, statusHeaders.length);
  stHeaderRange.setValues([statusHeaders]);
  stHeaderRange.setFontWeight('bold');
  stHeaderRange.setFontColor('#FFFFFF');
  stHeaderRange.setBackground('#8B5CF6');
  stHeaderRange.setHorizontalAlignment('center');

  chartDataSheet.getRange(8, 1, 4, 2).setValues([
    ['replied', '=COUNTIF(Details!G:G, "replied")'],
    ['bounced', '=COUNTIF(Details!G:G, "bounced")'],
    ['SENT', '=COUNTIF(Details!G:G, "SENT")'],
    ['Total', '=SUM(B8:B10)']
  ]);

  chartDataSheet.setFrozenRows(1);
  chartDataSheet.autoResizeColumn(1);
  chartDataSheet.autoResizeColumn(2);

  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);

  ss.getSheetByName('📖 Setup_Guide')?.activate();

  if (forceReset) {
    SpreadsheetApp.getUi().alert('⚠️ All sheets have been reset and rebuilt to fresh defaults.');
  } else {
    const summaryMsg = `✅ Smart Sync Complete!\n\n` +
      `• Sheets Verified: ${Object.keys(schema).length}\n` +
      `• New Sheets Added: ${newSheetsCount}\n` +
      `• New Columns Added: ${newColumnsCount}\n` +
      `• New Settings Keys Added: ${newSettingsCount}\n\n` +
      `🛡️ All your existing leads, inboxes, and settings were preserved safely.`;
    SpreadsheetApp.getUi().alert(summaryMsg);
  }
}

/**
 * 🔄 Safe Sync (Default) - Adds missing columns/settings/tabs without overwriting existing data.
 */
function syncOutreachSystem() {
  createOutreachSystem(false);
}

/**
 * ⚠️ Hard Reset - Clears and rebuilds all sheets from scratch with confirmation prompt.
 */
function resetAllSheetsWithWarning() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '⚠️ Confirmation Required',
    'Are you sure you want to completely RESET and CLEAR all tabs? This will ERASE all leads, inboxes, and custom settings!',
    ui.ButtonSet.YES_NO
  );
  if (response === ui.Button.YES) {
    createOutreachSystem(true);
  }
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚡ Outreach Bot')
    .addItem('🔄 Sync & Add Missing Columns/Settings (Safe)', 'syncOutreachSystem')
    .addSeparator()
    .addItem('⚠️ Hard Reset / Rebuild All (Wipes Data)', 'resetAllSheetsWithWarning')
    .addToUi();
}
