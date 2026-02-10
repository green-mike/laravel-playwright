import * as http from 'http';

export interface CapturedRequest {
  url: string;
  method: string;
  headers: http.IncomingHttpHeaders;
  body: any;
}

/**
 * Lightweight mock HTTP server for testing.
 * Captures incoming requests and returns configurable responses.
 */
export class MockServer {
  private server: http.Server;
  requests: CapturedRequest[] = [];
  private routes = new Map<string, { status: number; body: any; contentType: string }>();
  private defaultResponse = { status: 200, body: {} as any, contentType: 'application/json' };
  private _port = 0;

  constructor() {
    this.server = http.createServer((req, res) => {
      let rawBody = '';
      req.on('data', (chunk: Buffer) => (rawBody += chunk.toString()));
      req.on('end', () => {
        let parsedBody: any = null;
        if (rawBody) {
          try {
            parsedBody = JSON.parse(rawBody);
          } catch {
            parsedBody = rawBody;
          }
        }

        this.requests.push({
          url: req.url || '',
          method: req.method || '',
          headers: req.headers,
          body: parsedBody,
        });

        const route = this.routes.get(req.url || '');
        const resp = route || this.defaultResponse;

        res.writeHead(resp.status, { 'Content-Type': resp.contentType });
        res.end(
          resp.contentType.includes('json')
            ? JSON.stringify(resp.body)
            : String(resp.body)
        );
      });
    });
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this._port}`;
  }

  setRoute(path: string, status: number, body: any, contentType = 'application/json'): void {
    this.routes.set(path, { status, body, contentType });
  }

  setDefaultResponse(status: number, body: any, contentType = 'application/json'): void {
    this.defaultResponse = { status, body, contentType };
  }

  reset(): void {
    this.requests = [];
    this.routes.clear();
    this.defaultResponse = { status: 200, body: {}, contentType: 'application/json' };
  }

  lastRequest(): CapturedRequest | undefined {
    return this.requests[this.requests.length - 1];
  }

  findRequest(urlSubstring: string): CapturedRequest | undefined {
    return this.requests.find((r) => r.url.includes(urlSubstring));
  }

  findRequests(urlSubstring: string): CapturedRequest[] {
    return this.requests.filter((r) => r.url.includes(urlSubstring));
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server.address();
        if (typeof addr === 'object' && addr) {
          this._port = addr.port;
          resolve(addr.port);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}
