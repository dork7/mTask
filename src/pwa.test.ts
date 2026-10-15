import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './testing/app.ts';
import { one, parseHtml } from './testing/dom.ts';

/** The shape of a manifest icon entry. */
interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
}

/** The shape of the web app manifest. */
interface WebAppManifest {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: ManifestIcon[];
}

let testApp: TestApp;

beforeEach(() => {
  testApp = createTestApp();
});

afterEach(() => {
  testApp.close();
});

describe('manifest (AC1)', () => {
  it('is served at /manifest.webmanifest with the right content type', async () => {
    const response = await request(testApp.app).get('/manifest.webmanifest');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/manifest+json');
  });

  it('parses as a JSON object with the declared fields', async () => {
    const response = await request(testApp.app).get('/manifest.webmanifest');
    const manifest: WebAppManifest = JSON.parse(response.text);

    expect(manifest.name).toBe('Task Image AI');
    expect(manifest.short_name).toBe('Task Image AI');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('lists at least one icon with src, sizes and type', async () => {
    const response = await request(testApp.app).get('/manifest.webmanifest');
    const manifest: WebAppManifest = JSON.parse(response.text);

    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      expect(icon).toHaveProperty('src');
      expect(icon).toHaveProperty('sizes');
      expect(icon).toHaveProperty('type');
    }
  });
});

describe('icons (AC2)', () => {
  it('serves every declared icon with the declared content type', async () => {
    const manifestResponse = await request(testApp.app).get('/manifest.webmanifest');
    const manifest: WebAppManifest = JSON.parse(manifestResponse.text);

    for (const icon of manifest.icons) {
      const iconResponse = await request(testApp.app).get(icon.src);
      expect(iconResponse.status, `GET ${icon.src}`).toBe(200);
      expect(iconResponse.headers['content-type'], `GET ${icon.src}`).toContain(icon.type);
    }
  });
});

describe('service worker (AC3)', () => {
  it('is served at /sw.js with the right content type', async () => {
    const response = await request(testApp.app).get('/sw.js');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/javascript/);
  });

  it('has install and fetch listeners and caches the app shell', async () => {
    const response = await request(testApp.app).get('/sw.js');
    const source = response.text;

    expect(source).toContain('self.addEventListener("install"');
    expect(source).toContain('self.addEventListener("fetch"');
    expect(source).toContain('"/"');
    expect(source).toContain('"/manifest.webmanifest"');
    expect(source).toContain('"/css/base.css"');
    expect(source).toContain('"/offline.html"');
    expect(source).toContain('"/icons/icon.svg"');
  });
});

describe('layout registration (AC4)', () => {
  it('links the manifest and declares the theme color', async () => {
    const response = await request(testApp.app).get('/');
    const document = parseHtml(response.text);

    const manifestLink = one(document, 'link[rel="manifest"]');
    expect(manifestLink.getAttribute('href')).toBe('/manifest.webmanifest');

    const themeColor = one(document, 'meta[name="theme-color"]');
    expect(themeColor.getAttribute('content')).toBe('#4f46e5');
  });

  it('registers the service worker', async () => {
    const response = await request(testApp.app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('navigator.serviceWorker.register("/sw.js")');
    expect(response.text).toContain("if ('serviceWorker' in navigator)");
  });
});

describe('offline page (AC5)', () => {
  it('is served at /offline.html with the right content type', async () => {
    const response = await request(testApp.app).get('/offline.html');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Offline');
  });
});
