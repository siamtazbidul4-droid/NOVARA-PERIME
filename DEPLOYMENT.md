# Novara Commerce - Production Deployment Guide

## Overview
Novara Commerce একটি full-stack e-commerce platform যা React (Vite), Express.js, MongoDB Atlas, এবং Bangladesh-specific payment gateways (bKash) ব্যবহার করে।

## Architecture
- **Frontend**: React 19 + Vite 8 + TailwindCSS 4 + Redux Toolkit
- **Backend**: Express.js + TypeScript
- **Database**: MongoDB Atlas (replica set required for transactions)
- **Deployment**: Render (single unified Node.js web service)

## Pre-Deployment Checklist

### ১. MongoDB Atlas সেটআপ
- MongoDB Atlas cluster তৈরি করুন (M0 free tier বা higher)
- **Important**: Replica set বা sharded cluster ব্যবহার করুন (orders multi-document transactions এর জন্য)
- Network Access এ Render এর IP addresses allow করুন (বা 0.0.0.0/0 temporarily)
- Database user তৈরি করুন যথাযথ permissions সহ
- Connection string copy করুন (format: `mongodb+srv://username:password@cluster.mongodb.net/dbname`)

### ২. Cloudinary সেটআপ (Image Uploads)
- Cloudinary account তৈরি করুন: https://cloudinary.com
- Dashboard থেকে Cloud Name, API Key, এবং API Secret collect করুন
- Admin panel image uploads এর জন্য required

### ৩. bKash Merchant Account (Optional)
Production bKash payments এর জন্য:
- bKash Tokenized Checkout v2 merchant account প্রয়োজন
- Sandbox: `https://tokenized.sandbox.bka.sh/v2/tokenized-checkout`
- Production: `https://tokenized.pay.bka.sh/v2/tokenized-checkout`
- App Key, App Secret, Username, এবং Password থাকতে হবে

### ৪. OAuth Configuration (Optional)
**Google Sign-In**:
- Google Cloud Console এ OAuth 2.0 client তৈরি করুন
- Authorized JavaScript origins: `https://your-app.onrender.com`
- Authorized redirect URIs: `https://your-app.onrender.com`
- Client ID এবং Secret collect করুন

**Facebook Sign-In**:
- Meta for Developers এ Facebook app তৈরি করুন
- Valid OAuth Redirect URIs configure করুন
- App ID এবং App Secret collect করুন

## Render Deployment Steps

### Step 1: Repository Setup
```bash
# Ensure all changes are committed
git add .
git commit -m "Production deployment setup"
git push origin main
```

### Step 2: Create Render Service

#### Option A: Blueprint Deployment (Recommended)
1. Render dashboard এ যান: https://dashboard.render.com
2. "New" → "Blueprint" click করুন
3. GitHub repository connect করুন
4. `render.yaml` automatically detect হবে
5. Service name confirm করুন: `novara-commerce`
6. "Apply" click করুন

#### Option B: Manual Web Service
1. "New" → "Web Service" click করুন
2. GitHub repository select করুন
3. Configure করুন:
   - **Name**: `novara-commerce`
   - **Region**: Singapore (বা closest region)
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm ci --include=dev && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Starter ($7/month) বা Free

### Step 3: Environment Variables Configuration

Render dashboard → Service → "Environment" tab এ যান:

#### Required Variables (Must Configure)
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname
JWT_SECRET=<generate-secure-random-64-char-string>
SESSION_SECRET=<generate-secure-random-64-char-string>
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=<secure-password-min-12-chars>
```

#### Production URLs (Auto-configure after first deploy)
```
PUBLIC_API_URL=https://novara-commerce.onrender.com
PUBLIC_APP_URL=https://novara-commerce.onrender.com
```

#### Optional - Image Uploads (Cloudinary)
```
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

#### Optional - Email Notifications
```
RESEND_API_KEY=re_your_resend_api_key
EMAIL_FROM=orders@yourdomain.com
```

#### Optional - bKash Payment Gateway
```
BKASH_BASE_URL=https://tokenized.pay.bka.sh/v2/tokenized-checkout
BKASH_APP_KEY=your_app_key
BKASH_APP_SECRET=your_app_secret
BKASH_USERNAME=your_username
BKASH_PASSWORD=your_password
```

#### Optional - Google OAuth
```
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
VITE_GOOGLE_CLIENT_ID=<same-as-GOOGLE_CLIENT_ID>
```

#### Optional - Facebook OAuth
```
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
VITE_FACEBOOK_APP_ID=<same-as-FACEBOOK_APP_ID>
```

### Step 4: Deploy
1. "Manual Deploy" → "Deploy latest commit" click করুন
2. Build logs monitor করুন
3. Deployment সফল হলে service URL visit করুন

### Step 5: Health Check
```
GET https://your-app.onrender.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "NOVARA COMMERCE API",
  "market": "Bangladesh",
  "nodeVersion": "v22.x.x",
  "database": "connected"
}
```

## Post-Deployment Configuration

### Administrator Access
1. Environment variables এ `ADMIN_EMAIL` এবং `ADMIN_PASSWORD` configure করা থাকলে
2. Visit: `https://your-app.onrender.com/admin`
3. Configured credentials দিয়ে sign in করুন
4. প্রথম sign-in সফল হলে, অন্যান্য staff accounts তৈরি করতে পারবেন

### Initial Setup Tasks
1. **Categories & Brands**: Admin panel → Categories/Brands → Create initial taxonomy
2. **Products**: Admin → Products → Add initial catalog
3. **CMS Content**: Admin → CMS → Configure homepage banners
4. **Test Checkout**: Create customer account এবং test order place করুন (COD mode)

### OAuth Provider Configuration
**Google**:
- Google Cloud Console → Credentials
- Authorized JavaScript origins: Add `https://your-app.onrender.com`
- Authorized redirect URIs: Add `https://your-app.onrender.com`

**Facebook**:
- Meta for Developers → App Settings
- Add Platform → Website
- Site URL: `https://your-app.onrender.com`
- Valid OAuth Redirect URIs: `https://your-app.onrender.com`

## Troubleshooting

### Build Failures
**Issue**: TypeScript compilation errors
```bash
# Local check
npm run lint
```

**Issue**: Vite build fails
```bash
# Local production build test
npm run build
```

### Runtime Errors

**Database Connection Failed**
- Verify MONGODB_URI format
- Check MongoDB Atlas Network Access settings
- Ensure replica set is enabled

**Authentication Not Working**
- Verify JWT_SECRET is configured (min 32 characters)
- Check token is being stored in localStorage
- Clear browser cache and retry

**Admin Login Issues**
- Verify ADMIN_EMAIL and ADMIN_PASSWORD are configured
- Password must be minimum 12 characters
- Check server logs for authentication errors

**Payment Gateway Issues**
- bKash: Verify all 4 credentials are configured
- Check BKASH_BASE_URL matches sandbox/production endpoint
- Ensure PUBLIC_API_URL and PUBLIC_APP_URL use HTTPS in production

**Image Uploads Failing**
- Verify all 3 Cloudinary credentials are configured
- Check file size limits (max 5MB)
- Supported formats: JPEG, PNG, WebP

### Performance Optimization

**Database Indexing**
MongoDB Atlas automatically creates indexes on first document creation. Verify these indexes exist:
- `products`: `{ slug: 1 }`, `{ sku: 1 }`, text index on name/description
- `orders`: `{ orderNumber: 1 }`, `{ user: 1, createdAt: -1 }`
- `users`: `{ email: 1 }`, `{ googleId: 1 }`, `{ facebookId: 1 }`

**Caching Strategy**
- Static assets (Vite build) automatically served with cache headers
- API responses are not cached by default
- Consider adding Redis for cart/session caching in high-traffic scenarios

### Monitoring

**Application Logs**
```bash
# Render Dashboard → Service → Logs tab
# Real-time logs streaming
```

**Database Monitoring**
- MongoDB Atlas → Metrics
- Monitor connection count, query performance, storage usage

**Error Tracking** (Recommended)
- Integrate Sentry for frontend/backend error tracking
- Add environment variable: `SENTRY_DSN=your_sentry_dsn`

## Scaling Considerations

### Horizontal Scaling
- Render free tier: 1 instance
- Paid plans: Multiple instances with load balancing
- Ensure session state is stateless (JWT tokens only)

### Database Optimization
- Upgrade MongoDB Atlas tier for higher throughput
- Enable connection pooling (already configured)
- Monitor slow queries and add indexes

### CDN Integration
- Consider Cloudflare for static asset caching
- Enable Cloudinary CDN for product images

## Security Checklist

✅ Environment variables stored securely (not committed)
✅ JWT_SECRET is cryptographically random (min 32 chars)
✅ Admin password is strong (min 12 chars)
✅ HTTPS enforced for all production traffic
✅ CORS configured to allow only trusted origins
✅ MongoDB connection uses authenticated user
✅ Rate limiting enabled for admin login
✅ Input validation on all endpoints
✅ File upload signatures verified
✅ Payment gateway responses validated server-side

## Backup & Recovery

### Database Backups
- MongoDB Atlas automatic daily backups (enabled by default)
- Manual backup: Atlas → Cluster → Backup tab
- Point-in-time recovery available on M10+ clusters

### Application Backups
- Git repository contains full application code
- Render automatically keeps deployment history
- Environment variables: Export from Render dashboard

## Support & Maintenance

### Regular Maintenance Tasks
- **Weekly**: Monitor error logs and database performance
- **Monthly**: Review and update dependencies (`npm outdated`)
- **Quarterly**: Security audit and dependency updates

### Dependency Updates
```bash
# Check for updates
npm outdated

# Update patch versions
npm update

# Update major versions (test thoroughly)
npm install <package>@latest
```

### Contact & Resources
- **Render Docs**: https://render.com/docs
- **MongoDB Atlas**: https://www.mongodb.com/docs/atlas/
- **bKash Integration**: https://developer.bka.sh/

---

## Quick Reference Commands

```bash
# Local Development
npm run dev              # Start dev server with HMR

# Testing
npm run lint             # TypeScript check
npm test                 # Run test suite (if configured)

# Production Build
npm run build            # Build frontend + backend
npm start                # Start production server

# Debugging
npm run build:client     # Build frontend only
npm run build:server     # Build backend only
```

## Environment Variables Summary

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Auto | Set to `production` by Render |
| `PORT` | Auto | Set to `10000` by Render |
| `MONGODB_URI` | ✅ Yes | MongoDB Atlas connection string |
| `JWT_SECRET` | ✅ Yes | JWT signing secret (min 32 chars) |
| `SESSION_SECRET` | ✅ Yes | Session secret (min 32 chars) |
| `ADMIN_EMAIL` | ✅ Yes | Administrator email |
| `ADMIN_PASSWORD` | ✅ Yes | Administrator password (min 12 chars) |
| `PUBLIC_API_URL` | ✅ Yes | `https://your-app.onrender.com` |
| `PUBLIC_APP_URL` | ✅ Yes | `https://your-app.onrender.com` |
| `CLOUDINARY_*` | Optional | Image upload service credentials |
| `RESEND_API_KEY` | Optional | Email notification service |
| `BKASH_*` | Optional | bKash payment gateway credentials |
| `GOOGLE_*` | Optional | Google OAuth credentials |
| `FACEBOOK_*` | Optional | Facebook OAuth credentials |

---

**Deployment Date**: January 2025  
**Platform Version**: Node.js 22.x, MongoDB 7.x  
**Estimated Setup Time**: 30-45 minutes
