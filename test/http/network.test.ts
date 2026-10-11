import { describe, expect, it } from 'vitest';
import { createWoodpeckerHttpClient } from '../../src/http/client.js';
import { WoodpeckerApiError } from '../../src/http/errors.js';

describe('createWoodpeckerHttpClient network failures', () => {
  it('reports the OS-level error and the base URL for a refused connection', async () => {
    const client = createWoodpeckerHttpClient({ baseUrl: 'http://127.0.0.1:54321', token: 't' });
    const error = (await client.get('/user/repos').catch((e: unknown) => e)) as WoodpeckerApiError;
    expect(error).toBeInstanceOf(WoodpeckerApiError);
    expect(error.status).toBeUndefined();
    expect(error.detail).toMatch(/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ETIMEDOUT/);
    expect(error.message).toContain('http://127.0.0.1:54321');
  });
});
