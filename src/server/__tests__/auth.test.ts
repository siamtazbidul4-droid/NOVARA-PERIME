import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { app } from '../app';
import { UserModel } from '../models/User';
import { generateToken } from '../middleware/auth';
import authReducer, { openAuthModal, closeAuthModal } from '../../features/auth/authSlice';

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

describe('authentication safety', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('opens sign-up by default but preserves explicit sign-in entry points', () => {
    const initialState = authReducer(undefined, { type: 'test/initialize' });
    expect(initialState.authModalView).toBe('register');

    const signInState = authReducer(initialState, openAuthModal({ view: 'login' }));
    expect(signInState.authModalView).toBe('login');

    const reopenedState = authReducer(
      authReducer(signInState, closeAuthModal()),
      openAuthModal(undefined)
    );
    expect(reopenedState.authModalView).toBe('register');
  });

  it('requires persistent storage for password registration and login', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('MONGODB_URI', '');

    await withServer(async (baseUrl) => {
      const registration = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          password: 'valid-password-123',
        }),
      });
      const login = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'valid-password-123' }),
      });

      expect(registration.status).toBe(503);
      expect(login.status).toBe(503);
    });
  });

  it('rejects weak registration passwords before database writes', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test User', email: 'test@example.com', password: 'short' }),
      });

      expect(response.status).toBe(400);
    });
  });

  it('does not permit credential-free demo login to mint staff tokens', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/demo-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'super_admin' }),
      });
      expect(response.status).toBe(404);
    });
  });

  it('does not accept a signed token as an account when persistent storage is offline', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('JWT_SECRET', 'test-auth-secret-with-at-least-32-characters');
    const token = generateToken('507f1f77bcf86cd799439011', 'super_admin');

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(503);
    });
  });

  it('exposes the configured public OAuth client IDs to the frontend', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'google-public-client-id');
    vi.stubEnv('FACEBOOK_APP_ID', 'facebook-app-id');

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/config`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        googleClientId: 'google-public-client-id',
        facebookAppId: 'facebook-app-id',
      });
    });
  });

  it('requires OAuth provider configuration and does not fabricate users offline', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.stubEnv('FACEBOOK_APP_ID', '');
    vi.stubEnv('FACEBOOK_APP_SECRET', '');

    await withServer(async (baseUrl) => {
      const google = await fetch(`${baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'authorization-code' }),
      });
      const facebook = await fetch(`${baseUrl}/api/auth/facebook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: 'token' }),
      });

      expect(google.status).toBe(503);
      expect(facebook.status).toBe(503);
    });
  });

  it('rejects Google authorization codes without the configured app origin and request marker', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-google-client-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-google-client-secret');
    vi.stubEnv('PUBLIC_APP_URL', 'https://shop.example.com');
    vi.stubEnv('MONGODB_URI', '');

    await withServer(async (baseUrl) => {
      const wrongOrigin = await fetch(`${baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://attacker.example',
          'X-Requested-With': 'XmlHttpRequest',
        },
        body: JSON.stringify({ code: 'authorization-code' }),
      });
      const missingMarker = await fetch(`${baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://shop.example.com',
        },
        body: JSON.stringify({ code: 'authorization-code' }),
      });

      expect(wrongOrigin.status).toBe(403);
      expect(missingMarker.status).toBe(403);
    });
  });

  it('enforces unique provider identity indexes', () => {
    const indexes = UserModel.schema.indexes();
    expect(indexes).toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ googleId: 1 }), expect.objectContaining({ unique: true, sparse: true })],
        [expect.objectContaining({ facebookId: 1 }), expect.objectContaining({ unique: true, sparse: true })],
      ])
    );
  });
});
