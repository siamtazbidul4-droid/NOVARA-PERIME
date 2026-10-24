import { Router, Request, Response } from 'express';
import { UserModel, type IUser } from '../models/User';
import { generateToken, requireAuth, AuthRequest } from '../middleware/auth';
import { isDbConnected } from '../config/db';
import {
  getConfiguredAdminCredentials,
  isConfiguredAdminEmail,
  timingSafeStringEqual,
} from '../services/adminAccount';
import { z } from 'zod';

const router = Router();

router.get('/config', (_req: Request, res: Response) => {
  return res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || process.env.VITE_GOOGLE_CLIENT_ID?.trim() || null,
    facebookAppId: process.env.FACEBOOK_APP_ID?.trim() || process.env.VITE_FACEBOOK_APP_ID?.trim() || null,
  });
});

const registrationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(128).refine((password) => Buffer.byteLength(password, 'utf8') <= 72),
  phone: z.string().trim().max(32).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128).refine((password) => Buffer.byteLength(password, 'utf8') <= 72),
});

const adminLoginSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(1024),
});

const oauthTokenSchema = z.string().min(1).max(8192);
const googleCodeSchema = z.object({
  code: z.string().min(1).max(4096),
});
const googleIdTokenInfoSchema = z.object({
  aud: z.string(),
  iss: z.string(),
  sub: z.string().min(1),
  email: z.string().email().transform((email) => email.toLowerCase()),
  email_verified: z.union([z.boolean(), z.string()]),
  exp: z.coerce.number(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
});
const facebookDebugSchema = z.object({
  data: z.object({
    is_valid: z.boolean(),
    app_id: z.string(),
    user_id: z.string(),
    expires_at: z.number(),
  }),
});
const facebookProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  email: z.string().email().transform((email) => email.toLowerCase()).optional(),
  picture: z.object({
    data: z.object({ url: z.string().url().optional() }).optional(),
  }).optional(),
});

class OAuthAccountConflict extends Error {}

const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 10;
const adminLoginAttempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimitedAdminLogin(ip: string, now = Date.now()): boolean {
  for (const [key, entry] of adminLoginAttempts) {
    if (entry.resetAt <= now) adminLoginAttempts.delete(key);
  }

  let entry = adminLoginAttempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    if (adminLoginAttempts.size >= 10_000) {
      const oldestKey = adminLoginAttempts.keys().next().value;
      if (oldestKey) adminLoginAttempts.delete(oldestKey);
    }
    entry = { count: 0, resetAt: now + ADMIN_LOGIN_WINDOW_MS };
    adminLoginAttempts.set(ip, entry);
  }

  entry.count += 1;
  return entry.count > ADMIN_LOGIN_MAX_ATTEMPTS;
}

const STAFF_ROLES: IUser['role'][] = [
  'super_admin',
  'admin',
  'order_manager',
  'inventory_manager',
  'catalog_manager',
  'customer_support',
  'finance',
];

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function authUser(user: IUser): object {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatar: user.avatar,
    addresses: user.addresses,
  };
}

// 1. Register customer
router.post('/register', async (req: Request, res: Response): Promise<any> => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Provide a valid name and email; passwords must be at least 8 characters and no more than 72 UTF-8 bytes.' });
  }
  if (!isDbConnected()) {
    return res.status(503).json({ error: 'Registration is unavailable until persistent storage is connected.' });
  }

  try {
    const { name, email, password, phone } = parsed.data;
    const user = await UserModel.create({
      name,
      email,
      password,
      phone,
      role: 'customer',
    });
    const token = generateToken(user._id.toString(), user.role, user.tokenVersion);

    return res.status(201).json({
      message: 'Account created successfully',
      token,
      user: authUser(user),
    });
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }
    console.error('Account registration failed.');
    return res.status(500).json({ error: 'Unable to create the account. Please try again.' });
  }
});

// 2. Login
router.post('/login', async (req: Request, res: Response): Promise<any> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Provide a valid email address and password.' });
  }
  if (!isDbConnected()) {
    return res.status(503).json({ error: 'Sign-in is unavailable until persistent storage is connected.' });
  }

  try {
    const { email, password } = parsed.data;
    if (isConfiguredAdminEmail(email)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken(user._id.toString(), user.role, user.tokenVersion);

    return res.json({
      message: 'Logged in successfully',
      token,
      user: authUser(user),
    });
  } catch {
    console.error('Account sign-in failed.');
    return res.status(500).json({ error: 'Unable to sign in. Please try again.' });
  }
});

router.post('/admin-login', async (req: Request, res: Response): Promise<any> => {
  if (isRateLimitedAdminLogin(req.ip || req.socket.remoteAddress || 'unknown')) {
    return res.status(429).json({ error: 'Too many sign-in attempts. Please try again later.' });
  }

  const parsed = adminLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Provide a valid email address and password.' });
  }

  let configuredAdmin: ReturnType<typeof getConfiguredAdminCredentials>;
  try {
    configuredAdmin = getConfiguredAdminCredentials();
  } catch {
    return res.status(503).json({ error: 'Administrator sign-in is not configured correctly.' });
  }
  if (!isDbConnected()) {
    return res.status(503).json({ error: 'Sign-in is unavailable until persistent storage is connected.' });
  }

  try {
    const { email, password } = parsed.data;
    const user = await UserModel.findOne({ email });
    if (!user || !STAFF_ROLES.includes(user.role)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch =
      configuredAdmin && configuredAdmin.email === email
        ? timingSafeStringEqual(password, configuredAdmin.password)
        : await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken(user._id.toString(), user.role, user.tokenVersion);
    return res.json({
      message: 'Logged in successfully',
      token,
      user: authUser(user),
    });
  } catch {
    console.error('Administrator sign-in failed.');
    return res.status(500).json({ error: 'Unable to sign in. Please try again.' });
  }
});

// 3. Current User
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  return res.json({ user: req.user });
});

router.post('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const update = await UserModel.updateOne(
      { _id: req.user!._id, tokenVersion: req.user!.tokenVersion },
      { $inc: { tokenVersion: 1 } }
    );
    if (update.modifiedCount !== 1) {
      return res.status(401).json({ error: 'Authentication session is no longer active.' });
    }
    return res.status(204).end();
  } catch {
    console.error('Authentication session revocation failed.');
    return res.status(500).json({ error: 'Unable to close the server session. Please retry.' });
  }
});

// 4. Google OAuth Login / Registration
router.post('/google', async (req: Request, res: Response): Promise<any> => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const publicAppUrl = process.env.PUBLIC_APP_URL?.trim();
  const code = googleCodeSchema.safeParse(req.body);
  if (!clientId || !clientSecret || !publicAppUrl) {
    return res.status(503).json({ error: 'Google sign-in is not configured.' });
  }
  if (!code.success) {
    return res.status(400).json({ error: 'A valid Google authorization code is required.' });
  }

  let appOrigin: string;
  try {
    const appUrl = new URL(publicAppUrl);
    if (
      (process.env.NODE_ENV === 'production' && appUrl.protocol !== 'https:') ||
      appUrl.username ||
      appUrl.password
    ) {
      return res.status(503).json({ error: 'Google sign-in is not configured.' });
    }
    appOrigin = appUrl.origin;
  } catch {
    return res.status(503).json({ error: 'Google sign-in is not configured.' });
  }

  if (
    req.get('origin') !== appOrigin ||
    req.get('x-requested-with') !== 'XmlHttpRequest'
  ) {
    return res.status(403).json({ error: 'Google sign-in request could not be verified.' });
  }
  if (!isDbConnected()) {
    return res.status(503).json({ error: 'Google sign-in requires persistent storage.' });
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code.data.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: appOrigin,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenResponse.ok) {
      return res.status(401).json({ error: 'Google authorization code could not be verified.' });
    }

    const tokenResult = z.object({ id_token: z.string().min(1) }).safeParse(await tokenResponse.json());
    if (!tokenResult.success) {
      return res.status(401).json({ error: 'Google authorization response is invalid.' });
    }

    const tokenInfoUrl = new URL('https://oauth2.googleapis.com/tokeninfo');
    tokenInfoUrl.searchParams.set('id_token', tokenResult.data.id_token);
    const tokenInfoResponse = await fetch(tokenInfoUrl, { signal: AbortSignal.timeout(10_000) });
    if (!tokenInfoResponse.ok) {
      return res.status(401).json({ error: 'Google identity token could not be verified.' });
    }

    const tokenInfoResult = googleIdTokenInfoSchema.safeParse(await tokenInfoResponse.json());
    const profile = tokenInfoResult.success ? tokenInfoResult.data : null;
    if (
      !profile ||
      profile.aud !== clientId ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(profile.iss) ||
      profile.exp * 1000 <= Date.now() ||
      !(profile.email_verified === true || profile.email_verified === 'true')
    ) {
      return res.status(401).json({ error: 'Google identity is invalid or its email is unverified.' });
    }

    let user = await UserModel.findOne({ googleId: profile.sub });
    if (!user) {
      if (await UserModel.exists({ email: profile.email })) {
        throw new OAuthAccountConflict('An account with this email already exists. Sign in with that account; automatic social linking is disabled.');
      }
      try {
        user = await UserModel.create({
          name: profile.name?.trim() || profile.email.split('@')[0],
          email: profile.email,
          googleId: profile.sub,
          authProvider: 'google',
          emailVerified: true,
          avatar: profile.picture,
          role: 'customer',
        });
      } catch (error: unknown) {
        if (!isDuplicateKeyError(error)) throw error;
        user = await UserModel.findOne({ googleId: profile.sub });
        if (!user) throw new OAuthAccountConflict('This email or Google identity is already linked to another account.');
      }
    }

    const token = generateToken(user._id.toString(), user.role, user.tokenVersion);
    return res.json({ message: 'Google authentication successful', token, user: authUser(user) });
  } catch (error: unknown) {
    if (error instanceof OAuthAccountConflict) {
      return res.status(409).json({ error: error.message });
    }
    console.error('Google authentication failed.');
    return res.status(502).json({ error: 'Google sign-in could not be completed. Please try again.' });
  }
});

// 5. Facebook OAuth Login / Registration
router.post('/facebook', async (req: Request, res: Response): Promise<any> => {
  const facebookAppId = process.env.FACEBOOK_APP_ID?.trim();
  const facebookAppSecret = process.env.FACEBOOK_APP_SECRET?.trim();
  const accessToken = oauthTokenSchema.safeParse(req.body?.accessToken);
  if (!facebookAppId || !facebookAppSecret) {
    return res.status(503).json({ error: 'Facebook sign-in is not configured.' });
  }
  if (!accessToken.success) {
    return res.status(400).json({ error: 'A valid Facebook access token is required.' });
  }
  if (!isDbConnected()) {
    return res.status(503).json({ error: 'Facebook sign-in requires persistent storage.' });
  }

  try {
    const debugUrl = new URL('https://graph.facebook.com/debug_token');
    debugUrl.searchParams.set('input_token', accessToken.data);
    debugUrl.searchParams.set('access_token', `${facebookAppId}|${facebookAppSecret}`);
    const debugResponse = await fetch(debugUrl, { signal: AbortSignal.timeout(10_000) });
    if (!debugResponse.ok) {
      return res.status(401).json({ error: 'Facebook access token could not be verified.' });
    }

    const debugResult = facebookDebugSchema.safeParse(await debugResponse.json());
    if (
      !debugResult.success ||
      !debugResult.data.data.is_valid ||
      debugResult.data.data.app_id !== facebookAppId ||
      debugResult.data.data.expires_at * 1000 <= Date.now()
    ) {
      return res.status(401).json({ error: 'Facebook access token is invalid for this application.' });
    }

    const profileUrl = new URL('https://graph.facebook.com/me');
    profileUrl.searchParams.set('fields', 'id,name,email,picture');
    const profileResponse = await fetch(profileUrl, {
      headers: { Authorization: `Bearer ${accessToken.data}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!profileResponse.ok) {
      return res.status(401).json({ error: 'Facebook profile could not be verified.' });
    }

    const profileResult = facebookProfileSchema.safeParse(await profileResponse.json());
    if (!profileResult.success || profileResult.data.id !== debugResult.data.data.user_id) {
      return res.status(401).json({ error: 'Facebook identity could not be verified.' });
    }
    const profile = profileResult.data;
    if (!profile.email) {
      return res.status(409).json({
        error: 'Facebook did not provide an email address. Use email sign-up or contact support to complete account creation.',
      });
    }

    let user = await UserModel.findOne({ facebookId: profile.id });
    if (!user) {
      if (await UserModel.exists({ email: profile.email })) {
        throw new OAuthAccountConflict('An account with this email already exists. Sign in with that account; automatic social linking is disabled.');
      }
      try {
        user = await UserModel.create({
          name: profile.name?.trim() || 'Facebook User',
          email: profile.email,
          facebookId: profile.id,
          authProvider: 'facebook',
          role: 'customer',
          avatar: profile.picture?.data?.url,
        });
      } catch (error: unknown) {
        if (!isDuplicateKeyError(error)) throw error;
        user = await UserModel.findOne({ facebookId: profile.id });
        if (!user) throw new OAuthAccountConflict('This email or Facebook identity is already linked to another account.');
      }
    }

    const token = generateToken(user._id.toString(), user.role, user.tokenVersion);
    return res.json({ message: 'Facebook authentication successful', token, user: authUser(user) });
  } catch (error: unknown) {
    if (error instanceof OAuthAccountConflict) {
      return res.status(409).json({ error: error.message });
    }
    console.error('Facebook authentication failed.');
    return res.status(502).json({ error: 'Facebook sign-in could not be completed. Please try again.' });
  }
});

// 6. Forgot Password
router.post('/forgot-password', async (req: Request, res: Response): Promise<any> => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    return res.status(503).json({
      error: 'Password recovery is not configured. Please contact customer support for assistance.',
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Error processing password reset request' });
  }
});

export default router;
