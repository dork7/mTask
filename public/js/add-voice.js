/*
 * The voice input of the Add page. In a browser with the Web Speech API the Voice form
 * gets its record button: a click starts a recognition, and what is heard is written
 * into the text box after the text that was there, until the recognition ends or fails.
 * The text stays editable and is sent as typed text is; no audio leaves the page. In a
 * browser without that API the Voice tab is hidden, and a page that opened on it shows
 * the Type tab instead. Loaded with `defer`, from the one page that has the elements
 * below. Without this script the Voice form is a text box that still posts.
 */
(function () {
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var voiceTab = document.getElementById('tab-voice');
  var typeTab = document.getElementById('tab-text');
  var voicePanel = document.getElementById('panel-voice');
  var typePanel = document.getElementById('panel-text');
  var unavailable = document.querySelector('[data-voice-unavailable]');
  var record = document.querySelector('[data-voice-record]');
  var voiceText = document.querySelector('[data-voice-text]');
  var typeText = document.querySelector('[data-type-text]');
  var failure = document.querySelector('[data-voice-error]');

  /* The recognition that is recording, or null. */
  var current = null;
  /* What the text box held when that recording began. */
  var base = '';

  /* No Web Speech API: the Voice tab goes, and a page that opened on it shows Type. */
  if (!Recognition) {
    voiceTab.hidden = true;
    if (voiceTab.getAttribute('aria-selected') === 'true') {
      voiceTab.setAttribute('aria-selected', 'false');
      typeTab.setAttribute('aria-selected', 'true');
      voicePanel.hidden = true;
      typePanel.hidden = false;
      unavailable.hidden = false;
      if (typeText.value === '') typeText.value = voiceText.value;
    }
    return;
  }

  function setRecording(on) {
    record.textContent = on ? 'Stop recording' : 'Start recording';
    record.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  /* An event of a recognition that is no longer the current one changes nothing. */
  function finish(recognition, failed) {
    if (recognition !== current) return;
    current = null;
    setRecording(false);
    if (failed) failure.hidden = false;
  }

  /* The first alternative of every result, final or not, as one line of text. */
  function spokenOf(results) {
    var parts = [];
    var index;
    for (index = 0; index < results.length; index += 1) {
      parts.push(results[index][0].transcript);
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function start() {
    var recognition;

    failure.hidden = true;
    base = voiceText.value;
    try {
      recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = function (event) {
        var spoken;
        if (recognition !== current) return;
        spoken = spokenOf(event.results);
        if (spoken === '') voiceText.value = base;
        else voiceText.value = base === '' ? spoken : base + ' ' + spoken;
      };
      recognition.onend = function () {
        finish(recognition, false);
      };
      recognition.onerror = function () {
        finish(recognition, true);
      };
      current = recognition;
      recognition.start();
    } catch (error) {
      current = null;
      setRecording(false);
      failure.hidden = false;
      return;
    }
    setRecording(true);
  }

  record.hidden = false;
  record.addEventListener('click', function () {
    if (current) current.stop();
    else start();
  });

  /* The microphone is not left on while the page waits for the analyzer. */
  voiceText.form.addEventListener('submit', function () {
    if (current) current.stop();
  });
})();
