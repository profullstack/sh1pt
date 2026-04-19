export interface ClientOptions {
  apiUrl?: string;
  token?: string;
}

export class Sh1ptClient {
  constructor(private opts: ClientOptions = {}) {}

  private url(path: string): string {
    return `${this.opts.apiUrl ?? 'https://api.sh1pt.dev'}${path}`;
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method,
      headers: {
        'content-type': 'application/json',
        ...(this.opts.token ? { authorization: `Bearer ${this.opts.token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`sh1pt: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  projects = {
    list: () => this.req<{ projects: unknown[] }>('GET', '/v1/projects'),
    create: (body: { name: string }) => this.req('POST', '/v1/projects', body),
    get: (id: string) => this.req('GET', `/v1/projects/${id}`),
  };

  releases = {
    list: (projectId: string) => this.req('GET', `/v1/projects/${projectId}/releases`),
    create: (projectId: string, body: { version: string; channel: string }) =>
      this.req('POST', `/v1/projects/${projectId}/releases`, body),
    rollback: (projectId: string, releaseId: string) =>
      this.req('POST', `/v1/projects/${projectId}/releases/${releaseId}/rollback`),
  };
}
