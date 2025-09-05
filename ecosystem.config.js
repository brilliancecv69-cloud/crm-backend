// crm-frontend/backend/ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'api-server',
      script: 'server.js', // هذا الخادم سيقوم بكل شيء: API, WhatsApp Listener, Message Consumer
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
  ],
};