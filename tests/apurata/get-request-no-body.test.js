/**
 * CloudFront rejects GET/HEAD with a body (DEV-948).
 * axios serializes data:null as the JSON body "null" (Content-Length: 4).
 */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { MetabaseClient } from '../../src/metabase/client.js';

describe('Apurata MetabaseClient.request GET/HEAD body (DEV-948)', () => {
  let client;

  beforeEach(async () => {
    client = new MetabaseClient({
      url: 'http://localhost:3000',
      apiKey: 'mb_test_key',
    });
    await client.authenticate();
    client.client.request = jest.fn().mockResolvedValue({ data: { id: 1 } });
  });

  test('GET omits data so axios does not send body "null"', async () => {
    await client.request('GET', '/api/card/4080');

    expect(client.client.request).toHaveBeenCalledTimes(1);
    const cfg = client.client.request.mock.calls[0][0];
    expect(cfg.method).toBe('GET');
    expect(cfg.url).toBe('/api/card/4080');
    expect(cfg).not.toHaveProperty('data');
  });

  test('HEAD omits data', async () => {
    await client.request('HEAD', '/api/card/4080');

    const cfg = client.client.request.mock.calls[0][0];
    expect(cfg.method).toBe('HEAD');
    expect(cfg).not.toHaveProperty('data');
  });

  test('GET with query object moves it to params, not body', async () => {
    await client.request('GET', '/api/search', { q: 'lend' });

    const cfg = client.client.request.mock.calls[0][0];
    expect(cfg.params).toEqual({ q: 'lend' });
    expect(cfg).not.toHaveProperty('data');
  });

  test('POST still sends JSON body', async () => {
    const body = { name: 'x', dataset_query: {} };
    await client.request('POST', '/api/card', body);

    const cfg = client.client.request.mock.calls[0][0];
    expect(cfg.method).toBe('POST');
    expect(cfg.data).toEqual(body);
  });
});
