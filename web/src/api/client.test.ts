import { describe, expect, it } from 'vitest';
import { mockFetch } from '../test/fetchMock';
import { request } from './client';

describe('client', () => {
  // POST y PATCH mandan Content-Type: application/json y el body como JSON (R-07); GET no lleva body.
  it('test_client_patch_envia_json_con_content_type', async () => {
    const fetchMock = mockFetch({
      'PATCH /api/cosas/1': { status: 200, body: { ok: 'patch' } },
      'POST /api/cosas': { status: 201, body: { ok: 'post' } },
      'GET /api/cosas': { status: 200, body: { ok: 'get' } },
    });

    await expect(request<{ ok: string }>('/api/cosas/1', { method: 'PATCH', body: { name: 'Eva' } })).resolves.toEqual({
      ok: 'patch',
    });
    await expect(request<{ ok: string }>('/api/cosas', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ ok: 'post' });
    await expect(request<{ ok: string }>('/api/cosas')).resolves.toEqual({ ok: 'get' });

    const [patchCall] = fetchMock.callsTo('PATCH', '/api/cosas/1');
    expect(patchCall?.init?.method).toBe('PATCH');
    expect(new Headers(patchCall?.init?.headers).get('Content-Type')).toBe('application/json');
    expect(patchCall?.body).toEqual({ name: 'Eva' });
    expect(patchCall?.init?.credentials).toBe('include');

    const [postCall] = fetchMock.callsTo('POST', '/api/cosas');
    expect(new Headers(postCall?.init?.headers).get('Content-Type')).toBe('application/json');
    expect(postCall?.body).toEqual({ a: 1 });

    const [getCall] = fetchMock.callsTo('GET', '/api/cosas');
    expect(new Headers(getCall?.init?.headers).get('Content-Type')).toBeNull();
    expect(getCall?.init?.body).toBeUndefined();
  });
});
