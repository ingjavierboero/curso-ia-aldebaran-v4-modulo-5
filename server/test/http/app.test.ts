import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/infrastructure/http/app.js';

describe('createApp', () => {
  it('GET /api/inexistente responde 404 rechazado con JSON y headers de seguridad', async () => {
    const app = createApp({});

    const res = await request(app).get('/api/inexistente');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toEqual({ error: 'No encontrado' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
