import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSource } from './db/sources.ts';
import { createTask } from './db/tasks.ts';
import type { Analyze } from './services/analyzer.ts';
import { createTestApp, type TestApp } from './testing/app.ts';
import { all, parseHtml, type DomDocument, type DomElement } from './testing/dom.ts';

/*
 * Accessible names (AC9): on every page the audit visits, each link and button has a
 * name, and each form control a label. The database holds what makes each page show its
 * controls: a task today, an overdue one, one in progress with a reminder (the mini-bar
 * and the alarm), and a photo with a draft.
 */

/** 1:36 PM on 12 Oct 2026 in Dubai. */
const NOW = '2026-10-12T09:36:00.000Z';

/** The trimmed text of an element, without what is hidden from assistive technology. */
function textName(element: DomElement): string {
  const clone = element.cloneNode(true) as DomElement;
  for (const hidden of all(clone, '[aria-hidden="true"]')) hidden.remove();
  return (clone.textContent ?? '').trim();
}

/** The text of the elements an `aria-labelledby` names, or '' when any id is missing. */
function labelledByName(element: DomElement, document: DomDocument): string {
  const ids = (element.getAttribute('aria-labelledby') ?? '').trim().split(/\s+/).filter(Boolean);
  if (ids.length === 0) return '';
  const named = ids.map((id) => document.getElementById(id));
  if (named.some((item) => item === null)) return '';
  return named
    .map((item) => textName(item as DomElement))
    .join(' ')
    .trim();
}

/** The accessible name of a link or a button: its text, else its `aria-label`, else its `aria-labelledby`. */
function nameOf(element: DomElement, document: DomDocument): string {
  return textName(element) || (element.getAttribute('aria-label') ?? '').trim() || labelledByName(element, document);
}

/**
 * Whether a form control has a label: a `label[for]` with text, a wrapping `label`, an
 * `aria-label` or an `aria-labelledby`.
 */
function hasLabel(control: DomElement, document: DomDocument): boolean {
  if (control.id !== '') {
    const labels = all(document, 'label').filter((label) => label.getAttribute('for') === control.id);
    if (labels.some((label) => textName(label) !== '')) return true;
  }
  if (control.closest('label') !== null) return true;
  if ((control.getAttribute('aria-label') ?? '').trim() !== '') return true;
  return labelledByName(control, document) !== '';
}

describe('the helpers (AC9)', () => {
  it('gives a button whose only text is hidden no name', () => {
    const document = parseHtml('<button><span aria-hidden="true">×</span></button>');
    expect(nameOf(all(document, 'button')[0], document)).toBe('');
  });

  it('finds the label of an input through label[for]', () => {
    const document = parseHtml('<label for="x">X</label><input id="x">');
    expect(hasLabel(all(document, 'input')[0], document)).toBe(true);
  });

  it('gives a link labelled by a missing element no name', () => {
    const document = parseHtml('<a aria-labelledby="missing"></a>');
    expect(nameOf(all(document, 'a')[0], document)).toBe('');
  });

  it('finds no label for a bare input', () => {
    const document = parseHtml('<input id="y"><label for="y"> </label>');
    expect(hasLabel(all(document, 'input')[0], document)).toBe(false);
  });
});

describe('accessible names on every page (AC9)', () => {
  let testApp: TestApp;
  let reviewId: number;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
    testApp = createTestApp({ analyze: vi.fn<Analyze>() });
    createTask(testApp.db, {
      title: 'Today',
      status: 'pending',
      priority: 'medium',
      estimated_minutes: 30,
      scheduled_start: '2026-10-12T11:00:00.000Z',
      scheduled_end: '2026-10-12T11:30:00.000Z',
    });
    createTask(testApp.db, {
      title: 'Overdue',
      status: 'pending',
      priority: 'low',
      estimated_minutes: 30,
      scheduled_start: '2026-10-11T05:00:00.000Z',
      scheduled_end: '2026-10-11T05:30:00.000Z',
    });
    createTask(testApp.db, {
      title: 'Running',
      status: 'in_progress',
      priority: 'urgent',
      estimated_minutes: 30,
      started_at: '2026-10-12T09:00:00.000Z',
      reminder_at: '2026-10-12T09:30:00.000Z',
    });
    const source = createSource(testApp.db, { kind: 'photo', image_path: '/uploads/a.png' });
    createTask(testApp.db, { title: 'A draft', status: 'draft', source_id: source.id, estimated_minutes: 15 });
    reviewId = source.id;
  });

  afterEach(() => {
    testApp.close();
    vi.useRealTimers();
  });

  /** Every link and button without a name, and every control without a label, as HTML. */
  function problemsOf(document: DomDocument): string[] {
    const problems: string[] = [];
    for (const element of all(document, 'a, button')) {
      if (nameOf(element, document) === '') problems.push(`no name: ${element.outerHTML}`);
    }
    for (const control of all(document, 'input:not([type="hidden"]), select, textarea')) {
      if (!hasLabel(control, document)) problems.push(`no label: ${control.outerHTML}`);
    }
    return problems;
  }

  it.each([
    '/',
    '/add',
    '/tasks',
    '/overdue',
    '/timeline',
    '/digest',
    '/settings',
    '/_styleguide',
    '/tasks/1',
    '/tasks/1/edit',
    'review',
  ])('names every control on %s', async (address) => {
    const response = await request(testApp.app).get(address === 'review' ? `/review/${reviewId}` : address);
    expect(response.status).toBe(200);
    const document = parseHtml(response.text);

    expect(all(document, 'a, button').length).toBeGreaterThan(0);
    expect(all(document, '#mini-bar, #alarm')).toHaveLength(2);
    expect(problemsOf(document), address).toEqual([]);
  });

  it('names every control on the list with the toast of a Delete', async () => {
    const deleted = await request(testApp.app).post('/tasks/2/delete');
    const response = await request(testApp.app).get(deleted.headers.location);
    const document = parseHtml(response.text);

    expect(all(document, '#live-region .toast button')).toHaveLength(1);
    expect(problemsOf(document)).toEqual([]);
  });
});
