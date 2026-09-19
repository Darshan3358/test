require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { sessionContext, csrfProtection } = require('./src/middleware/auth');
const webRoutes = require('./src/routes/web');
const apiRoutes = require('./src/routes/api');
const { initSchema } = require('./src/database/db');
const SchedulerService = require('./src/services/SchedulerService');
const { connectMongo } = require('./src/database/mongo');

// Initialize Pure MongoDB Atlas connection & indexes
connectMongo().then(async () => {
  await initSchema();
  console.log('[FINVORA] Database engine active: 100% Pure MongoDB Atlas (SQLite removed)');
}).catch(err => {
  console.error('[MongoDB Atlas] Startup connection error:', err.message);
});

// Initialize Universal In-Process Scheduler (active on persistent hosts, skipped on Vercel serverless)
SchedulerService.init();

const app = express();
const PORT = process.env.PORT || 3000;

// Template engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets
app.use(express.static(path.join(__dirname, 'public')));
// Serve three.js, chart.js, and ethers from node_modules for local offline reliability
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules/chart.js/dist')));
app.use('/vendor/ethers', express.static(path.join(__dirname, 'node_modules/ethers/dist')));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Security & session context
app.use(sessionContext);
app.use(csrfProtection);

// Mount routes
app.use('/api', apiRoutes);
app.use('/api/v1', apiRoutes);
app.use('/', webRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).render('public/404', {
    title: 'Page Not Found — FINVORA'
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
  res.status(500).send('An unexpected error occurred. Please try again later.');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  FINVORA PLATFORM RUNNING AT http://localhost:${PORT}`);
    console.log(`  Environment: ${process.env.APP_ENV || 'development'}`);
    console.log(`====================================================`);
  });
}

module.exports = app;
