const fs = require('fs');
const { query } = require('../database/db');
const RoiService = require('../services/RoiService');

console.log('========================================================================');
console.log('               FINVORA DAILY 2.0% MINING YIELD PROTOCOL                 ');
console.log('========================================================================');

const targetDate = process.env.TARGET_DATE || null;
const result = RoiService.processDailyRoi(targetDate);
const today = result.date;

console.log(`\n📅 Execution Date : ${result.date}`);
console.log(`⚡ Processed Nodes: ${result.processedCount}`);
console.log(`⏭️  Skipped Nodes  : ${result.skippedCount} (Already processed or capped today)`);
console.log(`💰 Total Net ROI  : $${result.totalNetRoi.toFixed(2)}\n`);

// Determine the list of recipients to display
let displayList = [];

if (result.recipients && result.recipients.length > 0) {
  displayList = result.recipients;
} else if (result.skippedCount > 0) {
  // If already processed today, fetch today's ledger entries with user codes and usernames
  displayList = query(`
    SELECT 
      dl.net_amount as netRoi,
      dl.base_amount as amount,
      u.user_code as userCode,
      u.username,
      inv.package_code as packageCode,
      inv.package_name as packageName
    FROM daily_roi_ledger dl
    JOIN users u ON u.id = dl.user_id
    JOIN investments inv ON inv.id = dl.investment_id
    WHERE dl.roi_date = ?
    ORDER BY dl.id ASC
  `, [today]);
}

if (displayList.length > 0) {
  console.log('------------------------------------------------------------------------');
  console.log('RECIPIENT NODES (USERS WHO RECEIVED DAILY ROI):');
  console.log('------------------------------------------------------------------------');
  console.log(
    'USER CODE'.padEnd(12) + ' | ' +
    'USERNAME'.padEnd(16) + ' | ' +
    'PACKAGE'.padEnd(14) + ' | ' +
    'INVESTED'.padEnd(12) + ' | ' +
    'NET ROI CREDITED'
  );
  console.log('------------------------------------------------------------------------');

  displayList.forEach((r, idx) => {
    console.log(
      String(r.userCode || 'N/A').padEnd(12) + ' | ' +
      String(r.username || 'N/A').padEnd(16) + ' | ' +
      String(r.packageName || r.packageCode || 'Mining Tier').padEnd(14) + ' | ' +
      `$${Number(r.amount || 0).toFixed(2)}`.padEnd(12) + ' | ' +
      `+$${Number(r.netRoi || 0).toFixed(2)}`
    );
  });
  console.log('========================================================================\n');
} else {
  console.log('ℹ️ No active investment nodes were eligible for ROI distribution today.\n');
}

// Write to GitHub Step Summary if running inside GitHub Actions
if (process.env.GITHUB_STEP_SUMMARY) {
  try {
    let md = `### ⚡ FINVORA Daily ROI Execution Report (${today})\n\n`;
    md += `- **Execution Date:** \`${today}\`\n`;
    md += `- **Processed Active Contracts:** \`${result.processedCount}\`\n`;
    md += `- **Skipped Contracts (Already Processed):** \`${result.skippedCount}\`\n`;
    md += `- **Total Net Yield Distributed:** \`$${result.totalNetRoi.toFixed(2)}\`\n\n`;

    if (displayList.length > 0) {
      md += `#### 📋 Qualified User Accounts & ROI Payouts\n\n`;
      md += `| User Referral ID | Username | Mining Package | Invested Capital | Net Daily ROI | Status |\n`;
      md += `| :--- | :--- | :--- | :---: | :---: | :---: |\n`;
      displayList.forEach(r => {
        md += `| **\`${r.userCode || 'N/A'}\`** | **@${r.username}** | ${r.packageName || 'Mining Contract'} | $${Number(r.amount || 0).toFixed(2)} | **+$${Number(r.netRoi || 0).toFixed(2)}** | ✅ Credited |\n`;
      });
      md += `\n`;
    }

    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  } catch (err) {
    console.error('Failed to append to GITHUB_STEP_SUMMARY:', err.message);
  }
}

process.exit(0);
