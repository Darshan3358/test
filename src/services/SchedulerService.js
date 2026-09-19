const RoiService = require('./RoiService');
const SalaryService = require('./SalaryService');

/**
 * Universal In-Process Scheduler Service
 * Provides automated scheduled execution for persistent hosting (Antideploy, Docker, Render, Railway, VPS, Local).
 * In Vercel serverless deployments, automation is handled natively via vercel.json cron jobs.
 */
class SchedulerService {
  static timer = null;
  static isRunning = false;
  static lastDailyRoiDate = null;
  static lastWeeklySalaryDate = null;

  static init() {
    if (this.isRunning) return;

    // Check if running in a serverless environment like Vercel
    const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    if (isServerless) {
      console.log('[Scheduler] Vercel serverless environment detected. Automated crons are managed via vercel.json.');
      return;
    }

    if (process.env.ENABLE_INTERNAL_SCHEDULER === 'false') {
      console.log('[Scheduler] Internal scheduler disabled via ENABLE_INTERNAL_SCHEDULER=false.');
      return;
    }

    this.isRunning = true;
    console.log('[Scheduler] Initializing Universal In-Process Scheduler (Active for persistent/antideploy hosting)...');

    // Run check ticker every 60 seconds
    this.timer = setInterval(() => {
      this.checkAndRun();
    }, 60000);

    // Unref so the interval doesn't hold the process open during shutdown
    if (this.timer.unref) {
      this.timer.unref();
    }

    // Run an initial quick health check on startup
    setTimeout(() => {
      this.checkAndRun();
    }, 5000);
  }

  /**
   * Evaluate whether scheduled tasks need to run based on current UTC time
   */
  static async checkAndRun() {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const utcDay = now.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

    // Check 1: Daily ROI (Scheduled at 00:00 UTC daily)
    // Run if it's 00:00 UTC, or if today's date has changed and hasn't been run yet in this process
    if (utcHours === 0 && utcMinutes === 0 && this.lastDailyRoiDate !== todayStr) {
      this.lastDailyRoiDate = todayStr;
      console.log(`[Scheduler] Triggering scheduled Daily ROI for ${todayStr} at 00:00 UTC...`);
      try {
        const result = RoiService.processDailyRoi(todayStr);
        console.log(`[Scheduler] Daily ROI completed for ${todayStr}:`, result);
      } catch (err) {
        console.error(`[Scheduler] Error running Daily ROI for ${todayStr}:`, err.message);
      }
    }

    // Check 2: Weekly Leadership Salary (Scheduled at 00:00 UTC every Monday)
    if (utcHours === 0 && utcMinutes === 0 && utcDay === 1 && this.lastWeeklySalaryDate !== todayStr) {
      this.lastWeeklySalaryDate = todayStr;
      console.log(`[Scheduler] Triggering scheduled Weekly Salary for Monday ${todayStr} at 00:00 UTC...`);
      try {
        const result = SalaryService.processWeeklySalary();
        console.log(`[Scheduler] Weekly Salary completed for ${todayStr}:`, result);
      } catch (err) {
        console.error(`[Scheduler] Error running Weekly Salary for ${todayStr}:`, err.message);
      }
    }
  }

  /**
   * Programmatic manual triggers
   */
  static runDailyRoiNow(targetDate = null) {
    return RoiService.processDailyRoi(targetDate);
  }

  static runWeeklySalaryNow() {
    return SalaryService.processWeeklySalary();
  }

  static stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('[Scheduler] In-Process Scheduler stopped.');
  }
}

module.exports = SchedulerService;
