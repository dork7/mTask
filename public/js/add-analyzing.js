/*
 * The "Analyzing..." state of the Add page. A form marked `data-analyze-form` is
 * answered only when the analyzer is done, which takes a while: when one is submitted,
 * the status is shown and the submit buttons are disabled, so the photo is not sent
 * twice. The submit itself goes on as it would without this script. Loaded with `defer`,
 * from the one page that has the status element.
 */
(function () {
  var status = document.querySelector('[data-analyzing]');
  var forms = document.querySelectorAll('[data-analyze-form]');

  /* Only the submit buttons: a disabled file input would be left out of the post. */
  function setBusy(busy) {
    var buttons = document.querySelectorAll('[data-analyze-form] [type="submit"]');
    var index;

    status.hidden = !busy;
    for (index = 0; index < buttons.length; index += 1) {
      buttons[index].disabled = busy;
    }
  }

  function showAnalyzing() {
    setBusy(true);
  }

  var index;
  for (index = 0; index < forms.length; index += 1) {
    forms[index].addEventListener('submit', showAnalyzing);
  }

  /* A browser can bring the page back as it was left, with the status still shown. */
  window.addEventListener('pageshow', function () {
    setBusy(false);
  });
})();
