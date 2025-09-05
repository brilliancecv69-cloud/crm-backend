// backend/routes/status.js
// مسار الحفظ: backend/routes/status.js
// كيفية التركيب في server.js:
// const statusRouter = require('./routes/status')(statusStore);
// app.use('/api', statusRouter);

const express = require('express');

module.exports = function(statusStore) {
  const router = express.Router();

  router.get('/whatsapp/status', (req, res) => {
    try {
      if (!statusStore || !statusStore.status) {
        return res.json({ ok: false, msg: 'statusStore not attached' });
      }
      // لا تُعيد الـqr كـdata-uri هنا — هي نص الـQR (يمكن تحويله في الواجهة)
      return res.json({ ok: true, status: statusStore.status });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // health بسيط
  router.get('/health', (req, res) => {
    res.json({
      ok: true,
      version: process.env.npm_package_version || '0.0.0',
      env: process.env.NODE_ENV || 'development',
      time: new Date().toISOString()
    });
  });

  return router;
};
