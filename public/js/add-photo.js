/*
 * The photo preview of the Add page. When a photo is chosen it is shown in the page,
 * with a Retake button that empties the choice again. Loaded with `defer`, from the one
 * page that has the three elements below. Without this script the form still posts.
 */
(function () {
  var input = document.querySelector('[data-photo-input]');
  var preview = document.querySelector('[data-photo-preview]');
  var retake = document.querySelector('[data-photo-retake]');

  /* The object URL the preview shows, so it can be released when the photo changes. */
  var objectUrl = null;

  function hidePreview() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    preview.removeAttribute('src');
    preview.hidden = true;
    retake.hidden = true;
  }

  function showChosenPhoto() {
    var file = input.files[0];
    hidePreview();
    if (!file) return;

    objectUrl = URL.createObjectURL(file);
    preview.src = objectUrl;
    preview.hidden = false;
    retake.hidden = false;
  }

  input.addEventListener('change', showChosenPhoto);

  retake.addEventListener('click', function () {
    input.value = '';
    hidePreview();
    /* Retake has just been hidden: the focus goes back to where a photo is chosen. */
    input.focus();
  });

  /* A browser may bring a chosen file back when the page is reloaded. */
  showChosenPhoto();
})();
