import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import {
  closeAuthModal,
  setAuthModalView,
  setCredentials,
  clearPendingCartItem,
} from './authSlice';
import { addToCart } from '../cart/cartSlice';
import { addToast } from '../toast/toastSlice';
import { api, apiFetch, ApiError } from '../../services/api';
import { Modal } from '../../components/ui/Modal';
import type { User } from '../../types';
import { Mail, Lock, User as UserIcon, ArrowRight, ShieldCheck } from 'lucide-react';

interface GoogleCodeResponse {
  code?: string;
  error?: string;
}

interface GoogleIdentityServices {
  accounts: {
    oauth2: {
      initCodeClient(options: {
        client_id: string;
        scope: string;
        ux_mode: 'popup';
        callback: (response: GoogleCodeResponse) => void;
      }): { requestCode(): void };
    };
  };
}

interface FacebookLoginResponse {
  authResponse?: { accessToken: string };
}

interface FacebookSdk {
  init(options: { appId: string; cookie: boolean; xfbml: boolean; version: string }): void;
  login(
    callback: (response: FacebookLoginResponse) => void,
    options: { scope: string }
  ): void;
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
    FB?: FacebookSdk;
  }
}

interface AuthResponse {
  user: User;
  token: string;
}

function loadSdk(id: string, src: string): Promise<void> {
  const existingScript = document.getElementById(id) as HTMLScriptElement | null;
  if (existingScript?.dataset.loaded === 'true') return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = existingScript || document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error('The sign-in provider could not be loaded.'));
    if (!existingScript) document.head.appendChild(script);
  });
}

export const AuthModal: React.FC = () => {
  const dispatch = useAppDispatch();
  const { authModalOpen, authModalView, redirectAfterLogin, pendingCartItem } = useAppSelector(
    (state) => state.auth
  );
  const cartItems = useAppSelector((state) => state.cart.items);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerConfig, setProviderConfig] = useState({ google: '', facebook: '' });
  const [providerSdkReady, setProviderSdkReady] = useState({ google: false, facebook: false });

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    if (!authModalOpen || authModalView !== 'register') return;

    let active = true;

    const loadProviderConfig = async () => {
      const fallbackGoogle = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
      const fallbackFacebook = import.meta.env.VITE_FACEBOOK_APP_ID || '';

      try {
        const config = await apiFetch<{ googleClientId?: string | null; facebookAppId?: string | null }>('/auth/config');
        if (!active) return;

        const nextConfig = {
          google: config.googleClientId || fallbackGoogle,
          facebook: config.facebookAppId || fallbackFacebook,
        };
        setProviderConfig(nextConfig);

        const providers = [
          {
            provider: 'google' as const,
            configured: Boolean(nextConfig.google),
            scriptId: 'google-identity-services',
            scriptUrl: 'https://accounts.google.com/gsi/client',
          },
          {
            provider: 'facebook' as const,
            configured: Boolean(nextConfig.facebook),
            scriptId: 'facebook-jssdk',
            scriptUrl: 'https://connect.facebook.net/en_US/sdk.js',
          },
        ];

        providers.forEach(({ provider, configured, scriptId, scriptUrl }) => {
          if (!configured) {
            setProviderSdkReady((ready) => ({ ...ready, [provider]: true }));
            return;
          }
          void loadSdk(scriptId, scriptUrl)
            .then(() => {
              if (active) setProviderSdkReady((ready) => ({ ...ready, [provider]: true }));
            })
            .catch(() => {
              if (active) setError(`${provider === 'google' ? 'Google' : 'Facebook'} sign-in could not be loaded.`);
            });
        });
      } catch {
        if (!active) return;

        const nextConfig = {
          google: fallbackGoogle,
          facebook: fallbackFacebook,
        };
        setProviderConfig(nextConfig);

        (['google', 'facebook'] as const).forEach((provider) => {
          const configured = Boolean(provider === 'google' ? nextConfig.google : nextConfig.facebook);
          setProviderSdkReady((ready) => ({ ...ready, [provider]: true }));
          if (!configured) {
            setError(
              provider === 'google'
                ? 'Google Sign-In requires VITE_GOOGLE_CLIENT_ID in your environment variables. Please configure your Google OAuth Client ID to authenticate.'
                : 'Facebook Login requires VITE_FACEBOOK_APP_ID in your environment variables. Please configure your Meta App ID to authenticate.'
            );
          }
        });
      }
    };

    void loadProviderConfig();

    return () => {
      active = false;
    };
  }, [authModalOpen, authModalView]);

  const resetForm = () => {
    setError(null);
    setEmail('');
    setPassword('');
    setName('');
  };

  const handleClose = () => {
    if (pendingCartItem) {
      dispatch(clearPendingCartItem());
      dispatch(
        addToast({
          type: 'info',
          title: 'Add to Bag Cancelled',
          message: 'Sign-in cancelled. Product was not added to your bag.',
        })
      );
    }
    resetForm();
    dispatch(closeAuthModal());
  };

  const syncCartWithServer = async () => {
    if (cartItems.length > 0) {
      try {
        await api.post('/cart/sync', { items: cartItems });
      } catch (err) {
        console.warn('Cart sync note:', err);
      }
    }
  };

  // Helper to complete successful login/registration
  const completeAuthSuccess = async (user: User, token: string, successMessage: string) => {
    dispatch(setCredentials({ user, token }));
    dispatch(
      addToast({
        type: 'success',
        title: 'Authentication Successful',
        message: successMessage,
      })
    );

    // Fulfill pending Cart Action exactly once (Phase 3.1)
    if (pendingCartItem) {
      dispatch(addToCart(pendingCartItem));
      dispatch(
        addToast({
          type: 'success',
          title: 'Added to Bag',
          message: `${pendingCartItem.quantity}x ${pendingCartItem.name} added to your shopping bag`,
        })
      );
      dispatch(clearPendingCartItem());
    }

    await syncCartWithServer();
    resetForm();
    dispatch(closeAuthModal());

    if (redirectAfterLogin) {
      window.location.href = redirectAfterLogin;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.post<AuthResponse>('/auth/login', { email, password });
      await completeAuthSuccess(res.user, res.token, `Signed in as ${res.user.name}`);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await api.post<AuthResponse>('/auth/register', {
        name,
        email,
        password,
      });

      await completeAuthSuccess(res.user, res.token, 'Welcome to NOVARA Commerce!');
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthClick = (provider: 'google' | 'facebook') => {
    setLoading(true);
    setError(null);
    try {
      if (provider === 'google') {
        const clientId = providerConfig.google || import.meta.env.VITE_GOOGLE_CLIENT_ID;
        if (!clientId) {
          setError(
            'Google Sign-In requires VITE_GOOGLE_CLIENT_ID in your environment variables. Please configure your Google OAuth Client ID to authenticate.'
          );
          setLoading(false);
          return;
        }

        if (!window.google?.accounts.oauth2) {
          throw new Error('Google sign-in could not be initialized. Please try again.');
        }
        const client = window.google.accounts.oauth2.initCodeClient({
          client_id: clientId,
          scope: 'email profile openid',
          ux_mode: 'popup',
          callback: async (codeResponse) => {
            if (!codeResponse.code) {
              setError(codeResponse.error
                ? 'Google sign-in was cancelled or denied.'
                : 'Google did not return an authorization code.');
              setLoading(false);
              return;
            }
            try {
              const res = await apiFetch<AuthResponse>('/auth/google', {
                method: 'POST',
                headers: { 'X-Requested-With': 'XmlHttpRequest' },
                body: JSON.stringify({ code: codeResponse.code }),
              });
              await completeAuthSuccess(res.user, res.token, `Signed in via Google as ${res.user.name}`);
            } catch (err: unknown) {
              setError(err instanceof ApiError ? err.message : 'Google server verification failed');
            } finally {
              setLoading(false);
            }
          },
        });
        client.requestCode();
        return;
      } else {
        const fbAppId = providerConfig.facebook || import.meta.env.VITE_FACEBOOK_APP_ID;
        if (!fbAppId) {
          setError(
            'Facebook Login requires VITE_FACEBOOK_APP_ID in your environment variables. Please configure your Meta App ID to authenticate.'
          );
          setLoading(false);
          return;
        }

        if (!window.FB) {
          throw new Error('Facebook sign-in could not be initialized. Please try again.');
        }
        window.FB.init({ appId: fbAppId, cookie: false, xfbml: false, version: 'v23.0' });
        window.FB.login(
            async (response) => {
              if (response.authResponse?.accessToken) {
                try {
                  const res = await api.post<AuthResponse>('/auth/facebook', {
                    accessToken: response.authResponse.accessToken,
                  });
                  await completeAuthSuccess(res.user, res.token, `Signed in via Facebook as ${res.user.name}`);
                } catch (err: unknown) {
                  setError(err instanceof ApiError ? err.message : 'Facebook server verification failed');
                } finally {
                  setLoading(false);
                }
              } else {
                setError('Facebook login cancelled by user');
                setLoading(false);
              }
            },
            { scope: 'email,public_profile' }
          );
        return;
      }
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : `${provider} sign-in failed`);
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={authModalOpen}
      onClose={handleClose}
      title={
        authModalView === 'login'
          ? 'Sign in to your account'
          : authModalView === 'register'
          ? 'Create a Novara account'
          : 'Reset your password'
      }
      description={
        authModalView === 'login'
          ? 'Enter your credentials to access orders, saved addresses and checkout.'
          : authModalView === 'register'
          ? 'Join our home circle to enjoy personalized recommendations and order tracking.'
          : 'Enter your registered email address to receive password reset instructions.'
      }
      maxWidth="md"
    >
      {error && (
        <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
          <span className="font-semibold">Notice:</span> {error}
        </div>
      )}

      {authModalView === 'login' && (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-lg border border-stone-200 pl-9 pr-3 py-2 text-sm focus:border-[#133E32] focus:outline-none focus:ring-1 focus:ring-[#133E32]"
              />
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-stone-700">
                Password
              </label>
              <button
                type="button"
                onClick={() => dispatch(setAuthModalView('forgot_password'))}
                className="text-xs text-[#133E32] hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-stone-200 pl-9 pr-3 py-2 text-sm focus:border-[#133E32] focus:outline-none focus:ring-1 focus:ring-[#133E32]"
              />
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#133E32] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0d2e24] transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
            <ArrowRight className="w-4 h-4" />
          </button>

          <p className="text-center text-xs text-stone-500 pt-2">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => {
                resetForm();
                dispatch(setAuthModalView('register'));
              }}
              className="font-medium text-[#133E32] hover:underline"
            >
              Sign up now
            </button>
          </p>
        </form>
      )}

      {authModalView === 'register' && (
        <form onSubmit={handleRegister} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Full Name
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tanvir Ahmed"
                className="w-full rounded-lg border border-stone-200 pl-9 pr-3 py-2 text-sm focus:border-[#133E32] focus:outline-none focus:ring-1 focus:ring-[#133E32]"
              />
              <UserIcon className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tanvir@example.com"
                className="w-full rounded-lg border border-stone-200 pl-9 pr-3 py-2 text-sm focus:border-[#133E32] focus:outline-none focus:ring-1 focus:ring-[#133E32]"
              />
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 chars"
                className="w-full rounded-lg border border-stone-200 pl-9 pr-3 py-2 text-sm focus:border-[#133E32] focus:outline-none focus:ring-1 focus:ring-[#133E32]"
              />
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#133E32] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0d2e24] transition-colors disabled:opacity-50 mt-2"
          >
            {loading ? 'Creating account...' : 'Create Account'}
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-stone-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-stone-500">Or sign up with</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleOAuthClick('google')}
              disabled={loading || !providerSdkReady.google}
              aria-label="Continue with Google"
              className="flex items-center justify-center gap-2 rounded-lg border border-stone-200 py-2.5 text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              Continue with Google
            </button>
            <button
              type="button"
              onClick={() => handleOAuthClick('facebook')}
              disabled={loading || !providerSdkReady.facebook}
              aria-label="Continue with Facebook"
              className="flex items-center justify-center gap-2 rounded-lg border border-stone-200 py-2.5 text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg aria-hidden="true" className="w-4 h-4 fill-[#1877F2]" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Continue with Facebook
            </button>
          </div>

          <p className="text-center text-xs text-stone-500 pt-2">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => {
                resetForm();
                dispatch(setAuthModalView('login'));
              }}
              className="font-medium text-[#133E32] hover:underline"
            >
              Sign in
            </button>
          </p>
        </form>
      )}

      {authModalView === 'forgot_password' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Registered Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:border-[#133E32] focus:outline-none"
            />
          </div>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">
            Password recovery is not configured yet. Please contact customer support for assistance.
          </p>
          <div className="text-center">
            <button
              type="button"
              onClick={() => dispatch(setAuthModalView('login'))}
              className="text-xs text-stone-500 hover:underline"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};
