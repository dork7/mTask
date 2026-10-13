import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publicDir } from './paths.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import {
  all,
  isShown,
  one,
  openPage,
  parseHtml,
  resultEvent,
  scriptErrors,
  stubObjectUrls,
  stubSpeechRecognition,
  textOf,
  type DomDocument,
  type DomElement,
  type DomInput,
  type DomWindow,
  type SpeechStub,
  type SpokenResult,
} from './testing/dom.ts';
import { runLinkedScripts } from './testing/page.ts';

/*
 * The voice input of the Add page: what `public/js/add-voice.js` does in a window that
 * has the Web Speech API, under either of its two names, and in one that has not. The
 * only recognition a test meets is the stub the test itself puts on the window; jsdom
 * has none, and no microphone.
 */

const SCRIPTS = ['/js/add-photo.js', '/js/add-analyzing.js', '/js/add-voice.js'];

const VOICE_FAILED = 'Voice input stopped working. Try again, or type your tasks here.';
const VOICE_UNAVAILABLE = 'Voice input is not available in this browser. Type your tasks instead.';
const TEXT_NOT_ANALYZED = 'The text could not be analyzed.';

const TAB_ADDRESSES = ['/add?tab=photo', '/add?tab=voice', '/add?tab=text'];

/** What a window has of the Web Speech API: one of the two constructors, both, or neither. */
type Speech = 'SpeechRecognition' | 'webkitSpeechRecognition' | 'both' | 'none';

/** An Add page opened as a browser would, with its scripts run, and the handles the tests use. */
interface OpenVoice {
  window: DomWindow;
  document: DomDocument;
  /** The stub the page records from: `SpeechRecognition` when the window has it, else the other. */
  stub: SpeechStub;
  /** The stub under `webkitSpeechRecognition` when the window has both. */
  webkitStub: SpeechStub;
  record: DomElement;
  voiceText: DomInput;
  typeText: DomInput;
  /** What the record button reads and its `aria-pressed`. */
  state(): [string, string | null];
}

let testApp: TestApp;
let analyze: ReturnType<typeof vi.fn<Analyze>>;
const opened: DomWindow[] = [];

beforeEach(() => {
  analyze = vi.fn<Analyze>();
  testApp = createTestApp({ analyze });
});

// A script that throws, on load or in a listener, fails the test that opened the page.
afterEach(() => {
  testApp.close();
  vi.restoreAllMocks();
  for (const window of opened.splice(0)) {
    const errors = scriptErrors(window);
    window.close();
    expect(errors).toEqual([]);
  }
});

async function getHtml(address: string): Promise<string> {
  const response = await request(testApp.app).get(address);
  expect(response.status).toBe(200);
  return response.text;
}

/** The Add page as it answers a text from the Voice tab that could not be analyzed. */
async function voiceFailureHtml(): Promise<string> {
  analyze.mockResolvedValueOnce({ tasks: [], fallback: true });
  const response = await request(testApp.app).post('/add/voice').type('form').send({ text: 'buy milk' });
  expect(response.status).toBe(502);
  return response.text;
}

/**
 * Opens a served Add page in a window with this much of the Web Speech API and runs its
 * scripts. `prepare` runs after the page is parsed and before its scripts, which is when
 * a browser has put back what the user had typed.
 */
async function openHtml(
  html: string,
  speech: Speech,
  prepare: (document: DomDocument) => void = () => {},
): Promise<OpenVoice> {
  const window = openPage(html);
  opened.push(window);
  stubObjectUrls(window);

  const none: SpeechStub = { instances: [], startError: null };
  let stub = none;
  let webkitStub = none;
  if (speech === 'SpeechRecognition' || speech === 'both') stub = stubSpeechRecognition(window);
  if (speech === 'webkitSpeechRecognition') stub = stubSpeechRecognition(window, 'webkitSpeechRecognition');
  if (speech === 'both') webkitStub = stubSpeechRecognition(window, 'webkitSpeechRecognition');

  const { document } = window;
  prepare(document);
  await expect(runLinkedScripts(testApp.app, window)).resolves.toEqual(SCRIPTS);

  const record = one(document, '[data-voice-record]');
  return {
    window,
    document,
    stub,
    webkitStub,
    record,
    voiceText: one(document, '[data-voice-text]') as DomInput,
    typeText: one(document, '[data-type-text]') as DomInput,
    state: () => [textOf(record), record.getAttribute('aria-pressed')],
  };
}

/** The Voice tab of the Add page, opened in a window with this much of the Web Speech API. */
async function openVoice(speech: Speech = 'SpeechRecognition'): Promise<OpenVoice> {
  return openHtml(await getHtml('/add?tab=voice'), speech);
}

function final(transcript: string): SpokenResult {
  return { transcript, isFinal: true };
}

function interim(transcript: string): SpokenResult {
  return { transcript, isFinal: false };
}

/** Submits a form as a browser does, up to the navigation. `true` when no listener stopped it. */
function submit(window: DomWindow, form: DomElement): boolean {
  return form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

function tabOf(document: DomDocument, id: string): DomElement {
  return one(document, `#tab-${id}`);
}

/** The `aria-selected` of the three tabs, in the order Photo, Voice, Type. */
function selection(document: DomDocument): (string | null)[] {
  return ['photo', 'voice', 'text'].map((id) => tabOf(document, id).getAttribute('aria-selected'));
}

/** The ids of the tab panels that are not hidden. */
function shownPanels(document: DomDocument): string[] {
  return all(document, '[role="tabpanel"]')
    .filter((panel) => !panel.hasAttribute('hidden'))
    .map((panel) => panel.id);
}

function shownAlerts(document: DomDocument): string[] {
  return all(document, '[role="alert"]').filter(isShown).map(textOf);
}

function shownStatuses(document: DomDocument): string[] {
  return all(document, '[role="status"]').filter(isShown).map(textOf);
}

/** Where the forms that are shown post, in the order of the page. */
function shownForms(document: DomDocument): (string | null)[] {
  return all(document, 'main form')
    .filter(isShown)
    .map((form) => form.getAttribute('action'));
}

describe('the record button in a browser with voice input (AC10)', () => {
  it('comes with its script, deferred, which the app serves as JavaScript', async () => {
    const document = parseHtml(await getHtml('/add?tab=voice'));
    const scripts = all(document, 'script[src]');

    expect(scripts.map((script) => script.getAttribute('src'))).toEqual(SCRIPTS);
    expect(scripts.every((script) => script.hasAttribute('defer'))).toBe(true);

    const response = await request(testApp.app).get('/js/add-voice.js');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/javascript/);
  });

  it.each(['SpeechRecognition', 'webkitSpeechRecognition'] as const)(
    'is shown when the window has only %s, and nothing is recorded yet',
    async (name) => {
      const { document, record, stub, state } = await openVoice(name);

      expect(record.hasAttribute('hidden')).toBe(false);
      expect(isShown(record)).toBe(true);
      expect(tabOf(document, 'voice').hasAttribute('hidden')).toBe(false);
      expect(selection(document)).toEqual(['false', 'true', 'false']);
      expect(stub.instances).toEqual([]);
      expect(state()).toEqual(['Start recording', 'false']);
    },
  );

  it('records with webkitSpeechRecognition when the window has only that', async () => {
    const { record, stub, state } = await openVoice('webkitSpeechRecognition');

    record.click();

    expect(stub.instances).toHaveLength(1);
    expect(stub.instances[0].startCalls).toBe(1);
    expect(state()).toEqual(['Stop recording', 'true']);
  });

  it('records with SpeechRecognition, not the other one, when the window has both', async () => {
    const { record, stub, webkitStub } = await openVoice('both');

    record.click();

    expect(stub.instances).toHaveLength(1);
    expect(webkitStub.instances).toEqual([]);
  });

  it('stays hidden when the window has neither', async () => {
    const { record } = await openVoice('none');

    expect(record.hasAttribute('hidden')).toBe(true);
  });

  describe.each(TAB_ADDRESSES)('the scripts of %s', (address) => {
    it.each(['SpeechRecognition', 'webkitSpeechRecognition', 'none'] as const)(
      'load without an error in a window with %s',
      async (speech) => {
        // `openHtml` asserts that the three scripts ran; `afterEach` that none of them threw.
        const { window } = await openHtml(await getHtml(address), speech);

        expect(scriptErrors(window)).toEqual([]);
      },
    );
  });
});

describe('a recording (AC11)', () => {
  it('starts one continuous recognition with interim results on a click, and the button says so', async () => {
    const { window, record, stub, voiceText, state } = await openVoice();
    let submits = 0;
    one(window.document, 'main form[action="/add/voice"]').addEventListener('submit', () => {
      submits += 1;
    });

    record.click();

    expect(stub.instances).toHaveLength(1);
    expect(stub.instances[0].continuous).toBe(true);
    expect(stub.instances[0].interimResults).toBe(true);
    expect(stub.instances[0].startCalls).toBe(1);
    expect(stub.instances[0].stopCalls).toBe(0);
    expect(state()).toEqual(['Stop recording', 'true']);

    expect(voiceText.hasAttribute('disabled')).toBe(false);
    expect(voiceText.hasAttribute('readonly')).toBe(false);
    expect(submits).toBe(0);
  });

  it('writes the first alternative of every result, final or not, after the text that was there', async () => {
    const { record, stub, voiceText } = await openVoice();
    voiceText.value = 'call mum';
    record.click();

    stub.instances[0].fire('result', resultEvent([final('buy milk'), interim(' and finish the login bug')]));

    expect(voiceText.value).toBe('call mum buy milk and finish the login bug');
    expect(voiceText.hasAttribute('disabled')).toBe(false);
    expect(voiceText.hasAttribute('readonly')).toBe(false);
  });

  it('puts no space in front of the transcript when the box was empty', async () => {
    const { record, stub, voiceText } = await openVoice();
    record.click();

    stub.instances[0].fire('result', resultEvent([final('buy milk'), interim(' and finish the login bug')]));

    expect(voiceText.value).toBe('buy milk and finish the login bug');
  });

  it('replaces what the last event wrote, so the text never doubles', async () => {
    const { record, stub, voiceText } = await openVoice();
    voiceText.value = 'call mum';
    record.click();
    const [recognition] = stub.instances;

    recognition.fire('result', resultEvent([interim('buy')]));
    expect(voiceText.value).toBe('call mum buy');

    recognition.fire('result', resultEvent([interim('buy milk')]));
    expect(voiceText.value).toBe('call mum buy milk');

    recognition.fire('result', resultEvent([final('buy milk'), interim(' and eggs')]));
    expect(voiceText.value).toBe('call mum buy milk and eggs');
  });

  it('collapses the white space of the transcript to single spaces and trims it', async () => {
    const { record, stub, voiceText } = await openVoice();
    record.click();

    stub.instances[0].fire('result', resultEvent([final('  buy \n milk '), final('and   eggs ')]));

    expect(voiceText.value).toBe('buy milk and eggs');
  });

  it('joins two results with a space when neither brings one, as an engine other than Chrome may', async () => {
    const { record, stub, voiceText } = await openVoice();
    record.click();

    stub.instances[0].fire('result', resultEvent([final('buy milk'), interim('and eggs')]));

    expect(voiceText.value).toBe('buy milk and eggs');
  });

  it('keeps the earlier text exactly, its line breaks included', async () => {
    const { record, stub, voiceText } = await openVoice();
    voiceText.value = 'call mum\nwater plants';
    record.click();

    stub.instances[0].fire('result', resultEvent([final('buy milk')]));

    expect(voiceText.value).toBe('call mum\nwater plants buy milk');
  });

  it.each([
    ['no result', []],
    ['a blank transcript only', [final('  \n ')]],
  ])('leaves the box at the earlier text, with no space added, on an event with %s', async (_name, results) => {
    const { record, stub, voiceText } = await openVoice();
    voiceText.value = 'call mum';
    record.click();
    stub.instances[0].fire('result', resultEvent([interim('buy')]));

    stub.instances[0].fire('result', resultEvent(results));

    expect(voiceText.value).toBe('call mum');
  });
});

describe('the end of a recording (AC12)', () => {
  it('stops the recognition on a click, and resets the button only when it has ended', async () => {
    const { document, record, stub, voiceText, state } = await openVoice();
    voiceText.value = 'call mum';
    record.click();
    stub.instances[0].fire('result', resultEvent([final('buy milk')]));

    record.click();

    expect(stub.instances).toHaveLength(1);
    expect(stub.instances[0].stopCalls).toBe(1);
    expect(stub.instances[0].startCalls).toBe(1);
    expect(state()).toEqual(['Stop recording', 'true']);

    stub.instances[0].fire('end');

    expect(state()).toEqual(['Start recording', 'false']);
    expect(voiceText.value).toBe('call mum buy milk');
    expect(shownAlerts(document)).toEqual([]);
  });

  it('resets the button when the browser ends the recognition by itself', async () => {
    const { document, record, stub, voiceText, state } = await openVoice();
    record.click();
    stub.instances[0].fire('result', resultEvent([final('buy milk')]));

    stub.instances[0].fire('end');

    expect(stub.instances[0].stopCalls).toBe(0);
    expect(state()).toEqual(['Start recording', 'false']);
    expect(voiceText.value).toBe('buy milk');
    expect(shownAlerts(document)).toEqual([]);
  });

  it('adds a second recording to the text as it is then, edits included', async () => {
    const { record, stub, voiceText, state } = await openVoice();
    voiceText.value = 'call mum';
    record.click();
    stub.instances[0].fire('result', resultEvent([final('buy milk')]));
    stub.instances[0].fire('end');
    expect(voiceText.value).toBe('call mum buy milk');

    voiceText.value = 'call mum buy milk today';
    record.click();
    stub.instances[1].fire('result', resultEvent([final('pay rent')]));

    expect(stub.instances).toHaveLength(2);
    expect(stub.instances[1].startCalls).toBe(1);
    expect(state()).toEqual(['Stop recording', 'true']);
    expect(voiceText.value).toBe('call mum buy milk today pay rent');
  });

  it('ignores a late event of a recognition that is no longer the current one', async () => {
    const { document, record, stub, voiceText, state } = await openVoice();
    record.click();
    stub.instances[0].fire('result', resultEvent([final('buy milk')]));
    stub.instances[0].fire('end');
    record.click();
    stub.instances[1].fire('result', resultEvent([final('pay rent')]));
    expect(voiceText.value).toBe('buy milk pay rent');

    stub.instances[0].fire('result', resultEvent([final('something said long ago')]));
    stub.instances[0].fire('end');
    stub.instances[0].fire('error', { error: 'aborted' });

    expect(voiceText.value).toBe('buy milk pay rent');
    expect(state()).toEqual(['Stop recording', 'true']);
    expect(shownAlerts(document)).toEqual([]);
  });

  it('stops a running recording when the Voice form is submitted, without stopping the submit', async () => {
    const { window, document, record, stub } = await openVoice();
    const form = one(document, 'main form[action="/add/voice"]');
    record.click();

    const wentOn = submit(window, form);

    expect(wentOn).toBe(true);
    expect(stub.instances[0].stopCalls).toBe(1);
  });

  it('calls nothing when the Voice form is submitted while nothing is recorded', async () => {
    const { window, document, record, stub } = await openVoice();
    const form = one(document, 'main form[action="/add/voice"]');
    record.click();
    stub.instances[0].fire('end');

    const wentOn = submit(window, form);

    expect(wentOn).toBe(true);
    expect(stub.instances).toHaveLength(1);
    expect(stub.instances[0].stopCalls).toBe(0);
    expect(stub.instances[0].startCalls).toBe(1);
  });
});

describe('a recording that fails (AC13)', () => {
  it.each(TAB_ADDRESSES)('has its message at %s as a hidden alert in the Voice panel', async (address) => {
    const document = parseHtml(await getHtml(address));
    const failure = one(document, '[data-voice-error]');

    expect(one(document, '#panel-voice').contains(failure)).toBe(true);
    expect(failure.getAttribute('role')).toBe('alert');
    expect(failure.hasAttribute('hidden')).toBe(true);
    expect(textOf(failure)).toBe(VOICE_FAILED);
  });

  it.each(['not-allowed', 'no-speech', 'network', 'audio-capture', 'aborted'])(
    'resets the button, keeps the text and shows the one message on the error %s',
    async (kind) => {
      const { document, record, stub, voiceText, state } = await openVoice();
      voiceText.value = 'call mum';
      record.click();
      stub.instances[0].fire('result', resultEvent([final('buy milk')]));
      expect(shownAlerts(document)).toEqual([]);

      stub.instances[0].fire('error', { error: kind });

      expect(state()).toEqual(['Start recording', 'false']);
      expect(voiceText.value).toBe('call mum buy milk');
      expect(shownAlerts(document)).toEqual([VOICE_FAILED]);
    },
  );

  it('shows the message once when the error is followed by the end, as Chrome fires them', async () => {
    const { document, record, stub, voiceText, state } = await openVoice();
    record.click();
    stub.instances[0].fire('result', resultEvent([final('buy milk')]));

    stub.instances[0].fire('error', { error: 'not-allowed' });
    stub.instances[0].fire('end');

    expect(state()).toEqual(['Start recording', 'false']);
    expect(voiceText.value).toBe('buy milk');
    expect(shownAlerts(document)).toEqual([VOICE_FAILED]);
  });

  it('treats a start that throws as an error, and raises no script error', async () => {
    const { window, document, record, stub, voiceText, state } = await openVoice();
    voiceText.value = 'call mum';
    stub.startError = new Error('not now');

    record.click();

    expect(stub.instances).toHaveLength(1);
    expect(state()).toEqual(['Start recording', 'false']);
    expect(voiceText.value).toBe('call mum');
    expect(shownAlerts(document)).toEqual([VOICE_FAILED]);
    expect(scriptErrors(window)).toEqual([]);
  });

  it('hides the message and records again on the next click', async () => {
    const { document, record, stub, voiceText, state } = await openVoice();
    voiceText.value = 'call mum';
    record.click();
    stub.instances[0].fire('error', { error: 'no-speech' });
    expect(shownAlerts(document)).toEqual([VOICE_FAILED]);

    record.click();

    expect(shownAlerts(document)).toEqual([]);
    expect(stub.instances).toHaveLength(2);
    expect(state()).toEqual(['Stop recording', 'true']);

    stub.instances[1].fire('result', resultEvent([final('buy milk')]));

    expect(voiceText.value).toBe('call mum buy milk');
  });
});

describe('a browser without voice input (AC14)', () => {
  it('moves a page that opened on the Voice tab to the Type tab, and says why', async () => {
    const { document } = await openVoice('none');

    expect(tabOf(document, 'voice').hasAttribute('hidden')).toBe(true);
    expect(tabOf(document, 'photo').hasAttribute('hidden')).toBe(false);
    expect(tabOf(document, 'text').hasAttribute('hidden')).toBe(false);
    expect(selection(document)).toEqual(['false', 'false', 'true']);

    expect(one(document, '#panel-text').hasAttribute('hidden')).toBe(false);
    expect(one(document, '#panel-voice').hasAttribute('hidden')).toBe(true);
    expect(one(document, '#panel-photo').hasAttribute('hidden')).toBe(true);

    expect(shownStatuses(document)).toEqual([VOICE_UNAVAILABLE]);
    expect(shownForms(document)).toEqual(['/add/text']);
  });

  it.each([
    ['/add', ['true', 'false', 'false'], 'panel-photo', '/add/photo'],
    ['/add?tab=text', ['false', 'false', 'true'], 'panel-text', '/add/text'],
  ])('only hides the Voice tab at %s', async (address, selected, panel, action) => {
    const { document } = await openHtml(await getHtml(address), 'none');

    expect(tabOf(document, 'voice').hasAttribute('hidden')).toBe(true);
    expect(tabOf(document, 'photo').hasAttribute('hidden')).toBe(false);
    expect(tabOf(document, 'text').hasAttribute('hidden')).toBe(false);
    expect(selection(document)).toEqual(selected);
    expect(shownPanels(document)).toEqual([panel]);
    expect(shownForms(document)).toEqual([action]);
    expect(shownStatuses(document)).toEqual([]);
  });

  it('leaves the Voice tab as it was served in a browser that has voice input', async () => {
    const { document } = await openVoice('SpeechRecognition');

    expect(tabOf(document, 'voice').hasAttribute('hidden')).toBe(false);
    expect(selection(document)).toEqual(['false', 'true', 'false']);
    expect(shownPanels(document)).toEqual(['panel-voice']);
    expect(shownForms(document)).toEqual(['/add/voice']);
    expect(shownStatuses(document)).toEqual([]);
  });

  it('takes the text and the message of a failed analysis along to the Type tab', async () => {
    const { document, typeText } = await openHtml(await voiceFailureHtml(), 'none');

    expect(typeText.value).toBe('buy milk');
    expect(shownAlerts(document)).toEqual([TEXT_NOT_ANALYZED]);
    expect(shownStatuses(document)).toEqual([VOICE_UNAVAILABLE]);
    expect(shownForms(document)).toEqual(['/review/1/analyze', '/add/text']);
  });

  it('keeps a text the Type box already holds when the scripts run', async () => {
    const { typeText } = await openHtml(await voiceFailureHtml(), 'none', (document) => {
      (one(document, '[data-type-text]') as DomInput).value = 'what the browser put back';
    });

    expect(typeText.value).toBe('what the browser put back');
  });

  it('loads no page, sends nothing and stops no submit: the script has none of those calls', () => {
    const script = readFileSync(path.join(publicDir, 'js', 'add-voice.js'), 'utf8');

    for (const call of ['location', 'fetch(', 'XMLHttpRequest', 'setTimeout', 'setInterval', 'preventDefault']) {
      expect(script, call).not.toContain(call);
    }
  });
});
