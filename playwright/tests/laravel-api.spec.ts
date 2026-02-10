/**
 * Unit tests for the Laravel class.
 *
 * Uses a mock HTTP server instead of a real Laravel backend.
 * Tests URL construction, headers, payload format, and error handling
 * for every public method on the Laravel API client.
 */
import { test, expect } from '@playwright/test';
import { Laravel } from '../src/index';
import { MockServer } from './helpers/mock-server';

let mock: MockServer;

test.beforeAll(async () => {
  mock = new MockServer();
  await mock.start();
});

test.afterAll(async () => {
  await mock.stop();
});

test.beforeEach(() => {
  mock.reset();
});

// ---------------------------------------------------------------------------
// URL & Headers
// ---------------------------------------------------------------------------

test.describe('URL construction', () => {
  test('constructs URL from baseUrl + endpoint', async ({ request }) => {
    const laravel = new Laravel(mock.baseUrl, request);
    await laravel.artisan('test');

    const req = mock.findRequest('/artisan');
    expect(req).toBeDefined();
    expect(req!.url).toBe('/artisan');
  });

  test('strips trailing slash from baseUrl', async ({ request }) => {
    const laravel = new Laravel(mock.baseUrl + '/', request);
    await laravel.artisan('test');

    const req = mock.findRequest('/artisan');
    expect(req!.url).toBe('/artisan');
  });
});

test.describe('request headers', () => {
  test('sends Content-Type and Accept as application/json', async ({ request }) => {
    const laravel = new Laravel(mock.baseUrl, request);
    await laravel.artisan('test');

    const req = mock.lastRequest()!;
    expect(req.headers['content-type']).toContain('application/json');
    expect(req.headers['accept']).toBe('application/json');
  });

  test('includes X-Playwright-Worker when workerId is set', async ({ request }) => {
    const laravel = new Laravel(mock.baseUrl, request, 7);
    await laravel.artisan('test');

    expect(mock.lastRequest()!.headers['x-playwright-worker']).toBe('7');
  });

  test('omits X-Playwright-Worker when workerId is undefined', async ({ request }) => {
    const laravel = new Laravel(mock.baseUrl, request);
    await laravel.artisan('test');

    expect(mock.lastRequest()!.headers['x-playwright-worker']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// API methods – payload verification
// ---------------------------------------------------------------------------

test.describe('artisan', () => {
  test('sends command and parameters', async ({ request }) => {
    mock.setRoute('/artisan', 200, { code: 0, output: 'done' });
    const laravel = new Laravel(mock.baseUrl, request);

    const result = await laravel.artisan('migrate', ['--seed']);

    const req = mock.findRequest('/artisan')!;
    expect(req.method).toBe('POST');
    expect(req.body).toEqual({ command: 'migrate', parameters: ['--seed'] });
    expect(result).toEqual({ code: 0, output: 'done' });
  });

  test('defaults parameters to empty array', async ({ request }) => {
    const laravel = new Laravel(mock.baseUrl, request);
    await laravel.artisan('config:cache');

    expect(mock.lastRequest()!.body.parameters).toEqual([]);
  });
});

test.describe('truncate', () => {
  test('sends connections array', async ({ request }) => {
    const laravel = new Laravel(mock.baseUrl, request);
    await laravel.truncate(['mysql', null]);

    expect(mock.findRequest('/truncate')!.body).toEqual({
      connections: ['mysql', null],
    });
  });

  test('defaults connections to empty array', async ({ request }) => {
    const laravel = new Laravel(mock.baseUrl, request);
    await laravel.truncate();

    expect(mock.findRequest('/truncate')!.body).toEqual({ connections: [] });
  });
});

test.describe('factory', () => {
  test('sends model and attrs', async ({ request }) => {
    mock.setRoute('/factory', 200, { id: 1, name: 'Alice' });
    const laravel = new Laravel(mock.baseUrl, request);

    const result = await laravel.factory('User', { name: 'Alice' });

    expect(mock.findRequest('/factory')!.body).toEqual({
      model: 'User',
      count: undefined,
      attrs: { name: 'Alice' },
    });
    expect(result).toEqual({ id: 1, name: 'Alice' });
  });

  test('sends count when provided', async ({ request }) => {
    mock.setRoute('/factory', 200, [{ id: 1 }, { id: 2 }]);
    const laravel = new Laravel(mock.baseUrl, request);

    const result = await laravel.factory('User', {}, 2);

    expect(mock.findRequest('/factory')!.body.count).toBe(2);
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });
});

test.describe('query', () => {
  test('sends query with bindings and connection', async ({ request }) => {
    mock.setRoute('/query', 200, { success: true });
    const laravel = new Laravel(mock.baseUrl, request);

    const result = await laravel.query(
      'INSERT INTO users (name) VALUES (?)',
      ['Test'],
      { connection: 'mysql' },
    );

    expect(mock.findRequest('/query')!.body).toEqual({
      query: 'INSERT INTO users (name) VALUES (?)',
      bindings: ['Test'],
      connection: 'mysql',
      unprepared: false,
    });
    expect(result.success).toBe(true);
  });

  test('sends unprepared flag', async ({ request }) => {
    mock.setRoute('/query', 200, { success: true });
    const laravel = new Laravel(mock.baseUrl, request);

    await laravel.query('SET FOREIGN_KEY_CHECKS = 0', [], { unprepared: true });

    expect(mock.findRequest('/query')!.body.unprepared).toBe(true);
  });

  test('throws when unprepared is used with bindings', async ({ request }) => {
    const laravel = new Laravel(mock.baseUrl, request);

    await expect(
      laravel.query('SELECT ?', ['val'], { unprepared: true }),
    ).rejects.toThrow('Cannot use unprepared with bindings');
  });

  test('defaults to null connection and no unprepared', async ({ request }) => {
    mock.setRoute('/query', 200, { success: true });
    const laravel = new Laravel(mock.baseUrl, request);

    await laravel.query('CREATE TABLE t (id INT)');

    const body = mock.findRequest('/query')!.body;
    expect(body.connection).toBeNull();
    expect(body.unprepared).toBe(false);
    expect(body.bindings).toEqual([]);
  });
});

test.describe('select', () => {
  test('sends query, bindings and connection', async ({ request }) => {
    mock.setRoute('/select', 200, [{ id: 1, name: 'Alice' }]);
    const laravel = new Laravel(mock.baseUrl, request);

    const result = await laravel.select(
      'SELECT * FROM users WHERE id = :id',
      { id: 1 },
      { connection: 'pgsql' },
    );

    expect(mock.findRequest('/select')!.body).toEqual({
      query: 'SELECT * FROM users WHERE id = :id',
      bindings: { id: 1 },
      connection: 'pgsql',
    });
    expect(result).toEqual([{ id: 1, name: 'Alice' }]);
  });
});

test.describe('callFunction', () => {
  test('sends function name and args', async ({ request }) => {
    mock.setRoute('/function', 200, { ok: true });
    const laravel = new Laravel(mock.baseUrl, request);

    await laravel.callFunction('App\\Helpers::run', ['a', 'b']);

    expect(mock.findRequest('/function')!.body).toEqual({
      function: 'App\\Helpers::run',
      args: ['a', 'b'],
    });
  });
});

test.describe('config', () => {
  test('sends key and value', async ({ request }) => {
    const laravel = new Laravel(mock.baseUrl, request);
    await laravel.config('app.debug', true);

    expect(mock.findRequest('/dynamicConfig')!.body).toEqual({
      key: 'app.debug',
      value: true,
    });
  });
});

test.describe('travel', () => {
  test('sends date string', async ({ request }) => {
    const laravel = new Laravel(mock.baseUrl, request);
    await laravel.travel('2024-06-15 12:00:00');

    expect(mock.findRequest('/travel')!.body).toEqual({
      to: '2024-06-15 12:00:00',
    });
  });
});

test.describe('registerBootFunction', () => {
  test('sends function name', async ({ request }) => {
    const laravel = new Laravel(mock.baseUrl, request);
    await laravel.registerBootFunction('App\\Boot::init');

    expect(mock.findRequest('/registerBootFunction')!.body).toEqual({
      function: 'App\\Boot::init',
    });
  });
});

test.describe('tearDown', () => {
  test('sends POST to /tearDown', async ({ request }) => {
    const laravel = new Laravel(mock.baseUrl, request);
    await laravel.tearDown();

    const req = mock.findRequest('/tearDown')!;
    expect(req.method).toBe('POST');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

test.describe('error handling', () => {
  test('throws on 500 response with endpoint info', async ({ request }) => {
    mock.setDefaultResponse(500, { error: 'Internal Server Error' });
    const laravel = new Laravel(mock.baseUrl, request);

    await expect(laravel.artisan('fail')).rejects.toThrow(
      /Failed to call Laravel \/artisan/,
    );
  });

  test('throws on 422 response with status code', async ({ request }) => {
    mock.setDefaultResponse(422, { message: 'Validation failed' });
    const laravel = new Laravel(mock.baseUrl, request);

    await expect(laravel.factory('Bad')).rejects.toThrow(/422/);
  });

  test('includes response body in error message', async ({ request }) => {
    mock.setDefaultResponse(400, { message: 'Bad request data' });
    const laravel = new Laravel(mock.baseUrl, request);

    await expect(laravel.config('x', 'y')).rejects.toThrow(/Bad request data/);
  });
});
