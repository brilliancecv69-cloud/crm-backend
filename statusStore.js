// backend/statusStore.js
// مسار الحفظ: backend/statusStore.js
// بعد إنشاء الـ client في server.js استدعي: 
//   const statusStore = require('./statusStore');
//   statusStore.attachClientListeners(client);

const status = {
  state: 'unknown',    // e.g. 'unknown','qr','authenticated','ready','disconnected','auth_failure'
  ready: false,
  user: null,          // pushname if available
  qr: null,            // last QR string (if generating)
  lastEvent: null,     // raw last event / reason
  lastUpdated: new Date().toISOString()
};

function touch() {
  status.lastUpdated = new Date().toISOString();
}

function attachClientListeners(client) {
  if (!client || typeof client.on !== 'function') return;

  client.on('qr', (qr) => {
    status.qr = qr;
    status.state = 'qr';
    status.ready = false;
    status.lastEvent = 'qr';
    touch();
    console.log('[statusStore] qr received');
  });

  client.on('authenticated', () => {
    status.qr = null;
    status.state = 'authenticated';
    status.ready = false;
    status.lastEvent = 'authenticated';
    touch();
    console.log('[statusStore] authenticated');
  });

  client.on('ready', () => {
    try { status.user = client.info?.pushname || client.info?.me || status.user; } catch(e){}
    status.qr = null;
    status.state = 'ready';
    status.ready = true;
    status.lastEvent = 'ready';
    touch();
    console.log('[statusStore] ready');
  });

  client.on('auth_failure', (msg) => {
    status.state = 'auth_failure';
    status.ready = false;
    status.lastEvent = typeof msg === 'string' ? msg : JSON.stringify(msg || {});
    touch();
    console.log('[statusStore] auth_failure', status.lastEvent);
  });

  client.on('disconnected', (reason) => {
    status.state = 'disconnected';
    status.ready = false;
    status.lastEvent = reason || 'disconnected';
    touch();
    console.log('[statusStore] disconnected', reason);
  });

  // some versions emit change_state / state_changed
  client.on('change_state', (newState) => {
    status.state = newState || status.state;
    status.ready = (newState === 'CONNECTED' || newState === 'CONNECTED' );
    status.lastEvent = 'change_state:' + newState;
    touch();
    console.log('[statusStore] change_state', newState);
  });

  // optional: clear QR on session established
  client.on('session_created', () => {
    status.qr = null;
    touch();
  });

  // populate initial info if available
  try {
    if (client.info) {
      status.user = client.info.pushname || client.info.me || status.user;
      touch();
    }
  } catch(e){}

  return status;
}

module.exports = {
  status,
  attachClientListeners
};
