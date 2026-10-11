import { describe, expect, it } from 'vitest';
import { WoodpeckerApiError, describeError, hasStatus } from '../../src/http/errors.js';

describe('WoodpeckerApiError', () => {
  it('formats an answered request with status, method and path', () => {
    const error = new WoodpeckerApiError({
      method: 'GET',
      path: '/api/repos/7/pipelines/42',
      status: 404,
      detail: 'not found',
    });
    expect(error.message).toBe('Woodpecker returned 404 for GET /api/repos/7/pipelines/42: not found');
    expect(error.name).toBe('WoodpeckerApiError');
    expect(error.status).toBe(404);
  });

  it('names the base URL when the request never arrived', () => {
    const error = new WoodpeckerApiError({
      method: 'GET',
      path: '/api/user/repos',
      detail: 'connect ECONNREFUSED 10.43.0.1:80',
      baseUrl: 'http://woodpecker-server.woodpecker.svc.cluster.local',
    });
    expect(error.message).toBe(
      'Cannot reach Woodpecker at http://woodpecker-server.woodpecker.svc.cluster.local for GET /api/user/repos: connect ECONNREFUSED 10.43.0.1:80',
    );
  });

  it('never puts credentials from the base URL into the message', () => {
    const error = new WoodpeckerApiError({
      method: 'GET',
      path: '/api/user/repos',
      detail: 'getaddrinfo ENOTFOUND wp.test',
      baseUrl: 'http://user:hunter2@wp.test',
    });
    expect(error.message).not.toContain('hunter2');
    expect(error.message).toContain('http://wp.test');
  });
});

describe('describeError', () => {
  it('uses an Error message and stringifies anything else', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
    expect(describeError('plain')).toBe('plain');
  });
});

describe('hasStatus', () => {
  it('matches only a WoodpeckerApiError with that status', () => {
    const error = new WoodpeckerApiError({ method: 'GET', path: '/api/x', status: 500, detail: 'x' });
    expect(hasStatus(error, 500)).toBe(true);
    expect(hasStatus(error, 404)).toBe(false);
    expect(hasStatus(new Error('x'), 500)).toBe(false);
  });
});
