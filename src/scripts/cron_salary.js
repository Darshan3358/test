const fs = require('fs');
const { query } = require('../database/db');
const SalaryService = require('../services/SalaryService');

console.log('========================================================================');
console.log('            FINVORA WEEKLY 25-WEEK LEADERSHIP SALARY PROTOCOL           ');
console.log('========================================================================');

const result = SalaryService.processWeeklySalary();
const today = result.date;

console.log(`\n📅 Execution Date : ${result.date}`);
console.log(`👑 Processed Ranks: ${result.processedCount}`);
console.log(`💰 Total Salary   : $${result.totalPayout.toFixed(2)}\n`);

let displayList = [];

if (result.recipients && result.recipients.length > 0) {
  displayList = result.recipients;
} else {
  // If already processed today or checking today's payouts from database
  displayList = query(`
    SELECT 
      sp.amount as netPayout,
      sp.week_number as weekNumber,
      u.user_code as userCode,
      u.username,
      usl.target_name as targetName,
      usl.duration_weeks as durationWeeks
    FROM salary_payouts sp
    JOIN users u ON u.id = sp.user_id
    JOIN user_salary_levels usl ON usl.id = sp.user_salary_id
    WHERE sp.payout_date = ?
    ORDER BY sp.id ASC
  `, [today]);
}

if (displayList.length > 0) {
  console.log('------------------------------------------------------------------------');
  console.log('RECIPIENT LEADERS (USERS WHO RECEIVED WEEKLY SALARY):');
  console.log('------------------------------------------------------------------------');
  console.log(
    'USER CODE'.padEnd(12) + ' | ' +
    'USERNAME'.padEnd(16) + ' | ' +
    'LEADERSHIP RANK'.padEnd(20) + ' | ' +
    'CYCLE WEEK'.padEnd(12) + ' | ' +
    'NET SALARY CREDITED'
  );
  console.log('------------------------------------------------------------------------');

  displayList.forEach(r => {
    console.log(
      String(r.userCode || 'N/A').padEnd(12) + ' | ' +
      String(r.username || 'N/A').padEnd(16) + ' | ' +
      String(r.targetName || 'Leader Tier').padEnd(20) + ' | ' +
      `Wk ${r.weekNumber || 1}/${r.durationWeeks || 25}`.padEnd(12) + ' | ' +
      `+$${Number(r.netPayout || 0).toFixed(2)}`
    );
  });
  console.log('========================================================================\n');
} else {
  console.log('ℹ️ No qualifying leadership salary contracts were eligible for weekly payout today.\n');
}

// Write to GitHub Step Summary if running inside GitHub Actions
if (process.env.GITHUB_STEP_SUMMARY) {
  try {
    let md = `### 👑 FINVORA Weekly Leadership Salary Report (${today})\n\n`;
    md += `- **Execution Date:** \`${today}\`\n`;
    md += `- **Processed Active Contracts:** \`${result.processedCount}\`\n`;
    md += `- **Total Salary Disbursed:** \`$${result.totalPayout.toFixed(2)}\`\n\n`;

    if (displayList.length > 0) {
      md += `#### 📋 Qualified Leaders & Salary Payouts\n\n`;
      md += `| User Referral ID | Username | Leadership Rank | Cycle Week | Weekly Payout | Status |\n`;
      md += `| :--- | :--- | :--- | :---: | :---: | :---: |\n`;
      displayList.forEach(r => {
        md += `| **\`${r.userCode || 'N/A'}\`** | **@${r.username}** | ${r.targetName || 'Leadership Tier'} | Wk ${r.weekNumber || 1}/${r.durationWeeks || 25} | **+$${Number(r.netPayout || 0).toFixed(2)}** | ✅ Disbursed |\n`;
      });
      md += `\n`;
    }

    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  } catch (err) {
    console.error('Failed to append to GITHUB_STEP_SUMMARY:', err.message);
  }
}

process.exit(0);
