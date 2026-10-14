/*
 * The running timers. Every element with `data-started-at` shows the time since that
 * instant, `m:ss` under an hour and `h:mm:ss` from an hour on, as the server wrote it.
 * This brings each one up to date when it loads and once a second after. Loaded with
 * `defer` by the layout on a page with a task in progress. Its only clock is
 * `Date.now()`.
 */
(function () {
  var timers = document.querySelectorAll('[data-started-at]');
  if (timers.length === 0) return;

  function twoDigits(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function label(milliseconds) {
    var total = Math.max(0, Math.floor(milliseconds / 1000));
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var seconds = twoDigits(total % 60);
    return hours > 0 ? hours + ':' + twoDigits(minutes) + ':' + seconds : minutes + ':' + seconds;
  }

  function update() {
    var now = Date.now();
    var index;
    var startedAt;
    for (index = 0; index < timers.length; index += 1) {
      startedAt = Date.parse(timers[index].getAttribute('data-started-at'));
      if (!isNaN(startedAt)) timers[index].textContent = label(now - startedAt);
    }
  }

  update();
  setInterval(update, 1000);
})();
