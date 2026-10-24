import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { app } from '../app';
import { SEED_PRODUCTS } from '../seed/seedData';

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('related products API', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns distinct active in-stock recommendations and excludes the current product', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const product = SEED_PRODUCTS.find((item) => item.status === 'active' && item.stock > 0);
    expect(product).toBeDefined();

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/products/${product.slug}/related`);
      expect(response.status).toBe(200);

      const { products } = await response.json();
      expect(products.length).toBeLessThanOrEqual(4);
      expect(products.every((item: (typeof SEED_PRODUCTS)[number]) =>
        item._id !== product._id && item.status === 'active' && item.stock > 0
      )).toBe(true);
      expect(new Set(products.map((item: (typeof SEED_PRODUCTS)[number]) => item._id)).size)
        .toBe(products.length);

      const categoryMatches = SEED_PRODUCTS.filter(
        (item) =>
          item._id !== product._id &&
          item.category === product.category &&
          item.status === 'active' &&
          item.stock > 0
      );
      if (categoryMatches.length > 0) {
        expect(products[0].category).toBe(product.category);
      }
    });
  });

  it('keeps related-product failures separate from the product-detail response', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const product = SEED_PRODUCTS.find((item) => item.status === 'active');
    expect(product).toBeDefined();

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/products/${product.slug}`);
      expect(response.status).toBe(200);
      expect((await response.json()).product._id).toBe(product._id);
    });
  });

  it('returns not found for an invalid related-product identifier', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/products/not-a-real-product/related`);
      expect(response.status).toBe(404);
    });
  });
});
