/*
 * The minutes stepper of the Review page. The − and + buttons beside the minutes of a
 * card are served hidden; this shows them and makes each change that card's minutes by
 * 5, never below 1 or above 1440. Loaded with `defer`, from the review page when it has
 * cards. Without this script the number can still be typed.
 */
(function () {
  var MIN_MINUTES = 1;
  var MAX_MINUTES = 1440;

  var buttons = document.querySelectorAll('[data-minutes-step]');

  /* A blank field, or one that holds no number, counts as 0. */
  function step(button) {
    var input = button.closest('[data-stepper]').querySelector('[data-minutes]');
    var current = Number(input.value);
    var next;

    if (input.value === '' || !isFinite(current)) current = 0;
    next = Math.round(current) + Number(button.getAttribute('data-minutes-step'));
    input.value = String(Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, next)));
  }

  function onClick(event) {
    step(event.currentTarget);
  }

  var index;
  for (index = 0; index < buttons.length; index += 1) {
    buttons[index].hidden = false;
    buttons[index].addEventListener('click', onClick);
  }
})();
