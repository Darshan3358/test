const { query } = require('../database/db');

class PublicController {
  static home(req, res) {
    const packages = query("SELECT * FROM packages WHERE status = 'ACTIVE' ORDER BY price ASC");
    res.render('public/home', {
      title: 'FINVORA — Next-Gen MLM & FinTech Investment Ecosystem',
      packages
    });
  }

  static about(req, res) {
    res.render('public/about', { title: 'About Us — FINVORA' });
  }

  static packages(req, res) {
    const packages = query("SELECT * FROM packages WHERE status = 'ACTIVE' ORDER BY price ASC");
    res.render('public/packages', { title: 'Investment Packages — FINVORA', packages });
  }

  static howItWorks(req, res) {
    res.render('public/how-it-works', { title: 'How It Works — FINVORA' });
  }

  static incomePlan(req, res) {
    res.render('public/income-plan', { title: 'Compensation & Income Plan — FINVORA' });
  }

  static salaryPlan(req, res) {
    const salaryTargets = query("SELECT * FROM salary_targets WHERE status = 'ACTIVE' ORDER BY required_direct_business ASC");
    res.render('public/salary-plan', { title: 'Weekly Salary Leadership Plan — FINVORA', salaryTargets });
  }

  static faq(req, res) {
    res.render('public/faq', { title: 'Frequently Asked Questions — FINVORA' });
  }

  static contact(req, res) {
    res.render('public/contact', { title: 'Contact Support — FINVORA' });
  }

  static terms(req, res) {
    res.render('public/terms', { title: 'Terms of Service — FINVORA' });
  }

  static privacy(req, res) {
    res.render('public/privacy', { title: 'Privacy Policy — FINVORA' });
  }

  static riskDisclosure(req, res) {
    res.render('public/risk-disclosure', { title: 'Risk Disclosure & Disclaimer — FINVORA' });
  }
}

module.exports = PublicController;
