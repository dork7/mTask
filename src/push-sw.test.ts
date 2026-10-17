import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './testing/app.ts';

/*
 * The two push handlers of the service worker (AC8). The worker runs in a browser, not
 * under Node, so the test reads its source: the lines it must carry are the handlers'
 * names and the payload they read.
 */

let testApp: TestApp;

beforeEach(() => {
  testApp = createTestApp();
});

afterEach(() => {
  testApp.close();
});

describe('the service worker push handlers (AC8)', () => {
  it('is served at /sw.js with a JavaScript content type', async () => {
    const response = await request(testApp.app).get('/sw.js');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/javascript/);
  });

  it('listens for a push and shows the payload as a notification', async () => {
    const source = (await request(testApp.app).get('/sw.js')).text;

    expect(source).toContain('self.addEventListener("push"');
    expect(source).toContain('event.data.json()');
    expect(source).toContain('self.registration.showNotification(');
  });

  it('opens the payload href when the notification is clicked', async () => {
    const source = (await request(testApp.app).get('/sw.js')).text;

    expect(source).toContain('self.addEventListener("notificationclick"');
    expect(source).toContain('notification.data.href');
    expect(source).toContain('clients.openWindow(');
  });
});
