function toStringData(data = {}) {
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = value === null || value === undefined ? '' : String(value);
  }
  return out;
}

function buildAlertMulticast({
  tokens,
  title,
  body,
  data = {},
  channelId = 'default',
  sound = 'default',
  collapseKey,
}) {
  return {
    tokens,
    notification: {
      title: String(title || ''),
      body: String(body || ''),
    },
    data: toStringData(data),
    android: {
      priority: 'high',
      collapseKey: collapseKey || undefined,
      notification: {
        channelId,
        sound,
        priority: 'high',
        defaultSound: sound === 'default',
      },
    },
    apns: {
      headers: {
        'apns-priority': '10',
        'apns-push-type': 'alert',
      },
      payload: {
        aps: {
          sound,
          badge: 1,
        },
      },
    },
  };
}

function buildAlertSingle({
  token,
  topic,
  title,
  body,
  data = {},
  channelId = 'default',
  sound = 'default',
  collapseKey,
}) {
  return {
    ...(token ? { token } : {}),
    ...(topic ? { topic } : {}),
    notification: {
      title: String(title || ''),
      body: String(body || ''),
    },
    data: toStringData(data),
    android: {
      priority: 'high',
      collapseKey: collapseKey || undefined,
      notification: {
        channelId,
        sound,
        priority: 'high',
        defaultSound: sound === 'default',
      },
    },
    apns: {
      headers: {
        'apns-priority': '10',
        'apns-push-type': 'alert',
      },
      payload: {
        aps: {
          sound,
          badge: 1,
        },
      },
    },
  };
}

module.exports = {
  buildAlertMulticast,
  buildAlertSingle,
  toStringData,
};