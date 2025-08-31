// crm-frontend/backend/ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'api-server',
      script: 'server.js', // ملف سيرفر الـ API الرئيسي (وهو يعالج الرسائل أيضًا)
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G', // إعادة التشغيل إذا تجاوز 1 جيجا بايت
    },
    {
      name: 'whatsapp-listener',
      script: 'listener.js', // ملف المستمع الذي يتصل بواتساب
      instances: 1,
      autorestart: true,
      watch: false,
    },
    // { // <-- تم تعطيل هذا القسم بالكامل
    //   name: 'whatsapp-worker',
    //   script: 'worker.js', // ملف العامل الذي يعالج الرسائل
    //   instances: 1, 
    //   autorestart: true,
    //   watch: false,
    // },
  ],
};