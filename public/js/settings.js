/*
 * The settings page. It keeps the alarm sound choice under localStorage `alarm-sound`
 * (`on` or `off`, read by `alarm.js`), shows whether alerts are allowed, subscribes to
 * push after Allow alerts and unsubscribes on Turn off alerts, copies the feed URL, and
 * offers the browser's install prompt when the browser has one. Each part does nothing
 * when its element is missing. Loaded with `defer` by the settings page.
 */
(function () {
  var SOUND_KEY = 'alarm-sound';
  var FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };

  function post(url, body) {
    return fetch(url, { method: 'POST', headers: FORM, body: body });
  }

  /* The sound. */
  function readSound() {
    try {
      return localStorage.getItem(SOUND_KEY);
    } catch (error) {
      return null;
    }
  }

  var box = document.getElementById('alarm-sound');
  if (box) {
    box.checked = readSound() !== 'off';
    box.addEventListener('change', function () {
      try {
        localStorage.setItem(SOUND_KEY, box.checked ? 'on' : 'off');
      } catch (error) {
        /* Storage is blocked: the choice holds for this page only. */
      }
    });
  }

  /* The alerts. */
  var status = document.getElementById('notification-status');

  function statusText(permission) {
    if (permission === 'granted') return 'Alerts are on';
    if (permission === 'denied') return 'Alerts are blocked in this browser';
    return 'Alerts are off';
  }

  function showStatus(permission) {
    if (status) status.textContent = statusText(permission);
  }

  if (typeof Notification === 'undefined') {
    if (status) status.textContent = 'Alerts are not supported';
  } else {
    showStatus(Notification.permission);
  }

  function subscribe() {
    var meta = document.querySelector('meta[name="vapid-public-key"]');
    var key = meta ? meta.getAttribute('content') : null;
    if (!key) return;
    if (!navigator.serviceWorker) return;

    navigator.serviceWorker.ready
      .then(function (registration) {
        return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      })
      .then(function (subscription) {
        var keys = subscription.toJSON().keys;
        var body =
          'endpoint=' + encodeURIComponent(subscription.endpoint) +
          '&p256dh=' + encodeURIComponent(keys.p256dh) +
          '&auth=' + encodeURIComponent(keys.auth);
        return post('/push/subscribe', body);
      })
      .catch(function () {});
  }

  var allow = document.getElementById('notification-allow');
  if (allow) {
    allow.addEventListener('click', function () {
      if (typeof Notification === 'undefined') return;
      Promise.resolve(Notification.requestPermission())
        .then(function (permission) {
          showStatus(permission);
          if (permission === 'granted') subscribe();
        })
        .catch(function () {});
    });
  }

  var off = document.getElementById('notification-off');
  if (off) {
    off.addEventListener('click', function () {
      if (!navigator.serviceWorker) return;
      navigator.serviceWorker.ready
        .then(function (registration) {
          return registration.pushManager.getSubscription();
        })
        .then(function (subscription) {
          if (!subscription) return undefined;
          return post('/push/unsubscribe', 'endpoint=' + encodeURIComponent(subscription.endpoint)).then(function () {
            return subscription.unsubscribe();
          });
        })
        .catch(function () {});
    });
  }

  /* The feed URL. */
  var feed = document.getElementById('feed-url');
  var copy = document.getElementById('feed-copy');
  if (feed && copy) {
    copy.addEventListener('click', function () {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        var written = navigator.clipboard.writeText(feed.value);
        if (written && typeof written.catch === 'function') written.catch(function () {});
        return;
      }
      feed.select();
    });
  }

  /* The install prompt. */
  var install = document.getElementById('install-app');
  if (install) {
    var kept = null;
    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      kept = event;
      install.hidden = false;
    });
    install.addEventListener('click', function () {
      if (kept === null) return;
      var event = kept;
      kept = null;
      install.hidden = true;
      var shown = event.prompt();
      if (shown && typeof shown.catch === 'function') shown.catch(function () {});
    });
  }
})();
