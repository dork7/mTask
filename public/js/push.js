(function () {
  var meta = document.querySelector('meta[name="vapid-public-key"]');
  if (!meta) return;
  var key = meta.getAttribute('content');
  if (!key) return;

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
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
      return fetch('/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body,
      });
    })
    .catch(function () {});
})();
