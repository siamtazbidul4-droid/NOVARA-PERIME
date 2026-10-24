import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import productRoutes from './routes/product.routes';
import searchRoutes from './routes/search.routes';
import orderRoutes from './routes/order.routes';
import taxonomyRoutes from './routes/taxonomy.routes';
import operationsRoutes from './routes/operations.routes';
import paymentRoutes from './routes/payment.routes';
import recommendationRoutes from './routes/recommendation.routes';
import cartRoutes from './routes/cart.routes';
import locationRoutes from './routes/location.routes';
import mediaRoutes from './routes/media.routes';
import { isDbConnected } from './config/db';

export const app = express();

const getAllowedOrigins = (): Set<string> => new Set<string>([
  process.env.PUBLIC_APP_URL?.trim(),
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
].filter((origin): origin is string => Boolean(origin)));

app.disable('x-powered-by');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (getAllowedOrigins().has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin not allowed by CORS policy'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  const databaseConnected = isDbConnected();
  res.status(databaseConnected || process.env.NODE_ENV !== 'production' ? 200 : 503).json({
    status: databaseConnected ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    service: 'NOVARA COMMERCE API',
    market: 'Bangladesh',
    nodeVersion: process.version,
    database: databaseConnected ? 'connected' : 'disconnected',
  });
});

app.use('/api/locations', locationRoutes);

// Database availability middleware - only enforces in production
// Development/test modes allow routes to use fallback data (e.g. SEED_PRODUCTS)
app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production' && !isDbConnected()) {
    return res.status(503).json({ error: 'Service unavailable: database connection is not ready.' });
  }
  next();
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin/media', mediaRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api', taxonomyRoutes);
app.use('/api', operationsRoutes);

// Centralized error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.message === 'Origin not allowed by CORS policy') {
    return res.status(403).json({ error: 'Origin not allowed by CORS policy' });
  }

  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'An internal server error occurred',
  });
});
