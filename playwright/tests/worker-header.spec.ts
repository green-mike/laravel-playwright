/**
 * Integration tests for the worker header injection fixture.
 *
 * Uses our custom `test` export so the context.route('**\/*') interceptor
 * is active. A mock HTTP server captures actual network requests to verify
 * that X-Playwright-Worker is present on every request the browser makes.
 *
 * Note: Only `{ page }` is destructured — the `laravel` fixture is lazy and
 * will NOT initialise (no tearDown call to a non-existent Laravel backend).
 */
import { test } from '../src/index';
import { expect } from '@playwright/test';
import { MockServer } from './helpers/mock-server';

let mock: MockServer;

test.beforeAll(async () => {
  mock = new MockServer();
  await mock.start();
  // Default: return a minimal HTML page
  mock.setDefaultResponse(
    200,
    '<html><head></head><body>ok</body></html>',
    'text/html',
  );
});

test.afterAll(async () => {
  await mock.stop();
});

test.beforeEach(() => {
  mock.reset();
  mock.setDefaultResponse(
    200,
    '<html><head></head><body>ok</body></html>',
    'text/html',
  );
});

// ---------------------------------------------------------------------------
// Header presence
// ---------------------------------------------------------------------------

test.describe('Worker Header Injection via context.route', () => {
  test('page.goto adds X-Playwright-Worker header', async ({ page }) => {
    await page.goto(`${mock.baseUrl}/page`);

    const req = mock.findRequest('/page');
    expect(req).toBeDefined();
    expect(req!.headers['x-playwright-worker']).toBeDefined();
    expect(req!.headers['x-playwright-worker']).toMatch(/^\d+$/);
  });

  test('worker header value is a non-negative integer', async ({ page }) => {
    await page.goto(`${mock.baseUrl}/check`);

    const value = mock.findRequest('/check')!.headers['x-playwright-worker'] as string;
    const workerId = parseInt(value, 10);
    expect(workerId).toBeGreaterThanOrEqual(0);
  });

  test('consecutive navigations use the same worker ID', async ({ page }) => {
    mock.setRoute('/p1', 200, '<html><body>1</body></html>', 'text/html');
    mock.setRoute('/p2', 200, '<html><body>2</body></html>', 'text/html');

    await page.goto(`${mock.baseUrl}/p1`);
    await page.goto(`${mock.baseUrl}/p2`);

    const id1 = mock.findRequest('/p1')!.headers['x-playwright-worker'];
    const id2 = mock.findRequest('/p2')!.headers['x-playwright-worker'];
    expect(id1).toBe(id2);
  });

  test('sub-resource requests also carry the worker header', async ({ page }) => {
    // Serve a page that loads a script from the mock server
    mock.setRoute(
      '/with-script',
      200,
      '<html><head><script src="/script.js"></script></head><body></body></html>',
      'text/html',
    );
    mock.setRoute('/script.js', 200, '/* noop */', 'application/javascript');

    await page.goto(`${mock.baseUrl}/with-script`);
    // Wait a moment for sub-resource to load
    await page.waitForLoadState('load');

    const scriptReq = mock.findRequest('/script.js');
    expect(scriptReq).toBeDefined();
    expect(scriptReq!.headers['x-playwright-worker']).toBeDefined();
  });

  test('fetch() from page includes worker header', async ({ page }) => {
    mock.setRoute('/app', 200, '<html><body></body></html>', 'text/html');
    mock.setRoute('/api/data', 200, { result: 'ok' });

    await page.goto(`${mock.baseUrl}/app`);

    // Clear earlier requests so we can isolate the fetch
    const countBefore = mock.requests.length;

    // Execute fetch inside the browser context
    await page.evaluate(async (base: string) => {
      await fetch(`${base}/api/data`);
    }, mock.baseUrl);

    const apiReq = mock.requests
      .slice(countBefore)
      .find((r) => r.url.includes('/api/data'));
    expect(apiReq).toBeDefined();
    expect(apiReq!.headers['x-playwright-worker']).toBeDefined();
  });

  test('XMLHttpRequest from page includes worker header', async ({ page }) => {
    mock.setRoute('/app2', 200, '<html><body></body></html>', 'text/html');
    mock.setRoute('/api/xhr', 200, { ok: true });

    await page.goto(`${mock.baseUrl}/app2`);
    const countBefore = mock.requests.length;

    await page.evaluate(async (base: string) => {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', `${base}/api/xhr`);
        xhr.onload = () => resolve();
        xhr.onerror = () => reject(new Error('XHR failed'));
        xhr.send();
      });
    }, mock.baseUrl);

    const xhrReq = mock.requests
      .slice(countBefore)
      .find((r) => r.url.includes('/api/xhr'));
    expect(xhrReq).toBeDefined();
    expect(xhrReq!.headers['x-playwright-worker']).toBeDefined();
  });
});
