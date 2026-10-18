/*
 * The in-page alarm. It polls `/reminders` when it loads and every 30 seconds after, and
 * shows the full-screen alarm of the first marked task: the title, a looping sound,
 * Snooze 5, 10 and 15 minutes, and Dismiss. Where the page has the Notifications API it
 * also raises a system notification, and asks for permission when the user allows it.
 * Loaded with `defer` by the layout on a page with a reminder. Its only clock is the
 * interval. It plays the sound unless localStorage `alarm-sound` is `off` (022).
 */
(function () {
  var POLL_MS = 30000;

  var overlay = document.getElementById('alarm');
  if (!overlay) return;

  var title = overlay.querySelector('.alarm__title');
  var sound = overlay.querySelector('.alarm__sound');
  var permission = overlay.querySelector('.alarm__permission');
  var blocked = overlay.querySelector('.alarm__blocked');
  var current = null;

  function announce(text) {
    if (typeof Notification === 'undefined') {
      if (blocked) blocked.hidden = false;
      return;
    }
    if (Notification.permission === 'granted') {
      new Notification(text);
      return;
    }
    if (Notification.permission === 'denied') {
      if (blocked) blocked.hidden = false;
      return;
    }
    if (permission) permission.hidden = false;
  }

  /* The choice of the settings page. Blocked storage counts as no choice: the sound plays. */
  function soundOn() {
    try {
      return localStorage.getItem('alarm-sound') !== 'off';
    } catch (error) {
      return true;
    }
  }

  function show(alarm) {
    current = alarm;
    title.textContent = alarm.title;
    overlay.hidden = false;
    if (sound && soundOn()) {
      var playing = sound.play();
      if (playing && typeof playing.catch === 'function') playing.catch(function () {});
    }
    announce(alarm.title);
  }

  function hide() {
    overlay.hidden = true;
    if (sound) sound.pause();
  }

  function post(url, body) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body,
    });
  }

  var snoozes = overlay.querySelectorAll('[data-minutes]');
  var index;
  for (index = 0; index < snoozes.length; index += 1) {
    (function (button) {
      button.addEventListener('click', function () {
        if (current === null) return;
        post(current.snooze, 'minutes=' + button.getAttribute('data-minutes'));
        hide();
      });
    })(snoozes[index]);
  }

  var dismiss = overlay.querySelector('[data-alarm-dismiss]');
  if (dismiss) {
    dismiss.addEventListener('click', function () {
      if (current === null) return;
      post(current.dismiss, '');
      hide();
    });
  }

  var ask = overlay.querySelector('[data-alarm-permission]');
  if (ask) {
    ask.addEventListener('click', function () {
      if (typeof Notification === 'undefined') return;
      Notification.requestPermission();
    });
  }

  function poll() {
    fetch('/reminders')
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (data.alarms && data.alarms.length > 0) show(data.alarms[0]);
      });
  }

  poll();
  setInterval(poll, POLL_MS);
})();
