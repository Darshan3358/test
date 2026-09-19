const app = require('../server');

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[FINVORA] Server listening on port ${PORT}`);
  });
}

module.exports = app;
