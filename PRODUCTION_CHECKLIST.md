# Novara Commerce - Production Readiness Checklist

## ✅ PRE-DEPLOYMENT VERIFICATION

### Database & Infrastructure
- [ ] MongoDB Atlas cluster created (M0 Free or higher)
- [ ] Replica set enabled (required for transactions)
- [ ] Network Access configured for Render IPs
- [ ] Database user created with readWrite permissions
- [ ] Connection string tested locally
- [ ] Database name matches production naming

### Security Configuration
- [ ] `.env` file not committed to git (verified in `.gitignore`)
- [ ] JWT_SECRET generated (minimum 32 characters, cryptographically random)
- [ ] SESSION_SECRET generated (minimum 32 characters, cryptographically random)
- [ ] ADMIN_PASSWORD set (minimum 12 characters, strong password)
- [ ] ADMIN_EMAIL configured with real email address
- [ ] All production secrets stored in Render dashboard only

### External Services
- [ ] Cloudinary account created (for image uploads)
- [ ] Cloudinary credentials configured (CLOUD_NAME, API_KEY, API_SECRET)
- [ ] Test image upload from admin panel
- [ ] bKash credentials verified (if using bKash checkout)
- [ ] Payment gateway URLs point to correct sandbox/production
- [ ] Email service configured (Resend or alternative)

### OAuth Providers (Optional)
- [ ] Google OAuth client created
- [ ] Authorized origins configured: `https://your-app.onrender.com`
- [ ] Google Client ID and Secret added to environment
- [ ] Facebook App created (if using Facebook login)
- [ ] Facebook OAuth redirect URIs configured
- [ ] Facebook App ID and Secret added to environment

---

## ✅ BUILD & DEPLOYMENT VERIFICATION

### Local Build Test
```bash
# Clean previous builds
npm run clean

# Install fresh dependencies
rm -rf node_modules package-lock.json
npm install

# TypeScript check
npm run lint

# Production build
NODE_ENV=production npm run build

# Verify build outputs
ls -la dist/
# Expected: server.js, index.html, assets/
```

### Render Deployment Steps
1. [ ] Repository pushed to GitHub
2. [ ] Render service created (Blueprint or Manual)
3. [ ] All environment variables configured
4. [ ] Build command: `npm install && NPM_CONFIG_SCRIPT_SHELL=/bin/bash npm run build`
5. [ ] Start command: `npm start`
6. [ ] Health check path: `/api/health`
7. [ ] Deploy triggered manually

### Post-Deployment Health Checks
```bash
# Replace with your actual Render URL
APP_URL="https://novara-commerce.onrender.com"

# Health check
curl $APP_URL/api/health | jq

# Expected response:
# {
#   "status": "healthy",
#   "database": "connected",
#   "service": "NOVARA COMMERCE API"
# }

# Location data check
curl $APP_URL/api/locations/divisions | jq

# Product listing check
curl $APP_URL/api/products?limit=5 | jq

# Payment methods availability
curl $APP_URL/api/payments/methods | jq
```

---

## ✅ FUNCTIONAL TESTING

### Authentication & Authorization
- [ ] Customer registration works
- [ ] Customer login works
- [ ] Admin login with environment credentials works
- [ ] JWT tokens are being generated
- [ ] Token validation works across requests
- [ ] Logout invalidates tokens correctly
- [ ] Protected routes reject unauthenticated requests
- [ ] Admin routes reject non-staff users

### Product Catalog
- [ ] Products list loads correctly
- [ ] Product detail page shows full information
- [ ] Product images display correctly
- [ ] Search functionality works
- [ ] Filtering by category works
- [ ] Price sorting works correctly
- [ ] Variant selection updates price/stock correctly

### Shopping Cart
- [ ] Add to cart works (guest and authenticated)
- [ ] Cart persists after login
- [ ] Cart syncs between browser and database
- [ ] Quantity updates reflect correctly
- [ ] Remove from cart works
- [ ] Cart calculations are accurate (subtotal, shipping, total)

### Checkout & Orders
- [ ] Checkout page loads for authenticated users
- [ ] Bangladesh location dropdowns populate correctly
- [ ] Address validation works
- [ ] Saved addresses can be selected
- [ ] Cash on Delivery orders create successfully
- [ ] Order numbers are generated correctly
- [ ] Stock is reserved/decremented correctly
- [ ] Orders appear in customer order history
- [ ] Order details page shows complete information

### Payment Gateways
#### bKash (if configured)
- [ ] bKash payment initiation works
- [ ] Redirect to bKash gateway successful
- [ ] Payment callback handles success correctly
- [ ] Payment callback handles cancellation
- [ ] Order status updates after payment
- [ ] Payment records are created correctly

### Admin Panel
- [ ] Admin dashboard loads
- [ ] Product creation works
- [ ] Product editing works
- [ ] Image upload to Cloudinary works
- [ ] Category management works
- [ ] Order list shows all orders
- [ ] Order status updates work
- [ ] Staff notes can be added to orders
- [ ] Coupon creation works
- [ ] CMS content editing works

### Mobile Responsiveness
- [ ] Homepage renders correctly on mobile
- [ ] Product listing is mobile-friendly
- [ ] Product detail page works on mobile
- [ ] Checkout form is mobile-responsive
- [ ] Admin panel is usable on tablet

---

## ✅ SECURITY VERIFICATION

### Authentication Security
- [ ] Passwords are hashed with bcrypt (never stored plain)
- [ ] JWT secrets are not exposed in frontend bundles
- [ ] Tokens expire after 7 days
- [ ] Token version increments on logout
- [ ] Admin login is rate-limited (10 attempts per 15 minutes)
- [ ] Environment admin password cannot be less than 12 characters

### Authorization & Access Control
- [ ] Customer routes reject admin-only requests
- [ ] Admin routes require staff role
- [ ] Users can only view their own orders
- [ ] Users can only edit their own profile
- [ ] Product mutations require staff role
- [ ] Payment verification is server-side only

### Input Validation
- [ ] Email addresses are validated
- [ ] Phone numbers are validated
- [ ] Product prices cannot be negative
- [ ] Stock quantities are integers
- [ ] Order quantities are bounded (1-100)
- [ ] Bangladesh location IDs are validated
- [ ] File uploads are type-checked and size-limited

### Data Protection
- [ ] CORS restricted to allowed origins
- [ ] Security headers set (X-Content-Type-Options, X-Frame-Options)
- [ ] MongoDB connection uses authentication
- [ ] Cloudinary uploads use signed requests
- [ ] Payment gateway credentials are server-side only
- [ ] Database credentials not exposed in error responses

---

## ✅ PERFORMANCE & RELIABILITY

### Database Performance
- [ ] Indexes exist on frequently queried fields
- [ ] Text search index on products
- [ ] User email uniqueness enforced
- [ ] Order number uniqueness enforced
- [ ] Product SKU uniqueness enforced

### Error Handling
- [ ] MongoDB connection failures handled gracefully
- [ ] Database disconnection shows 503 for API routes
- [ ] Frontend shows user-friendly error messages
- [ ] Payment gateway failures are logged
- [ ] Image upload failures show clear errors
- [ ] Invalid order states are prevented

### Monitoring & Logging
- [ ] Server startup logs show version and status
- [ ] Database connection status logged
- [ ] Payment attempts logged
- [ ] Failed authentication attempts logged
- [ ] Order creation logged
- [ ] Critical errors logged to console

---

## ✅ DATA INTEGRITY

### Order Management
- [ ] Orders reserve stock atomically
- [ ] Payment settlement is transactional
- [ ] Coupon usage counts increment correctly
- [ ] Duplicate checkout requests are prevented
- [ ] Order status history is maintained
- [ ] Refunds are tracked separately

### Inventory Management
- [ ] Stock decrements on order creation
- [ ] Variant stock tracked independently
- [ ] Reserved stock field exists (future feature)
- [ ] Products cannot oversell
- [ ] Out-of-stock products show correctly

### Financial Accuracy
- [ ] Order totals calculated server-side
- [ ] Discounts applied correctly
- [ ] Shipping fees calculated consistently
- [ ] Payment amounts match order totals
- [ ] Currency is always BDT

---

## ✅ USER EXPERIENCE

### Customer Journey
- [ ] Homepage loads in < 3 seconds
- [ ] Product images lazy-load
- [ ] Cart operations feel instant
- [ ] Toast notifications show for actions
- [ ] Loading states shown during API calls
- [ ] Empty states shown when no data
- [ ] 404 pages for invalid routes

### Accessibility
- [ ] Forms have proper labels
- [ ] Buttons have descriptive text
- [ ] Images have alt text
- [ ] Keyboard navigation works
- [ ] Screen reader friendly
- [ ] Color contrast meets WCAG AA

### SEO & Meta Tags
- [ ] Homepage has title and description
- [ ] Product pages have dynamic titles
- [ ] Open Graph tags set
- [ ] Favicon configured
- [ ] Robots.txt allows indexing

---

## ✅ DOCUMENTATION

- [ ] README.md updated with project overview
- [ ] .env.example has all required variables
- [ ] DEPLOYMENT.md has complete deploy guide
- [ ] API endpoints documented (or Postman collection)
- [ ] Database schema documented
- [ ] Admin features documented

---

## ✅ PRODUCTION READINESS SUMMARY

### Critical (Must Fix Before Launch)
- [ ] All required environment variables configured
- [ ] Database connection successful
- [ ] JWT authentication working
- [ ] Admin login working
- [ ] Order creation functional
- [ ] Payment gateway configured (COD minimum)

### High Priority (Should Fix Soon)
- [ ] Image uploads working (Cloudinary)
- [ ] Email notifications configured
- [ ] OAuth login tested (if using)
- [ ] Mobile responsiveness verified
- [ ] Error logging configured

### Medium Priority (Can Fix Post-Launch)
- [ ] Performance optimization
- [ ] Advanced payment gateways
- [ ] Analytics integration
- [ ] Email marketing setup
- [ ] Customer reviews moderation

---

## 🚀 LAUNCH CHECKLIST

- [ ] All "Critical" items completed
- [ ] Production URL configured in environment
- [ ] DNS/custom domain configured (if applicable)
- [ ] SSL certificate active (Render provides free)
- [ ] Monitoring alerts configured
- [ ] Backup strategy confirmed
- [ ] Team has admin access
- [ ] Customer support email configured
- [ ] Terms of service and privacy policy published
- [ ] Initial product catalog uploaded
- [ ] Test order placed and fulfilled

---

## 📊 POST-LAUNCH MONITORING

### Week 1
- [ ] Monitor error rates daily
- [ ] Check database performance
- [ ] Verify payment gateway transactions
- [ ] Review customer support tickets
- [ ] Check mobile analytics

### Month 1
- [ ] Review security logs
- [ ] Analyze conversion funnel
- [ ] Optimize slow database queries
- [ ] Update dependencies
- [ ] Gather user feedback

---

**Last Updated**: January 2025  
**Platform**: Render (Node.js 22, MongoDB Atlas)  
**Next Review**: After 100 orders or 30 days
