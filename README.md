# Novara Commerce - Premium Retail & Home Living E-Commerce Platform

**Novara Commerce** is a full-stack, production-ready e-commerce platform built specifically for the Bangladesh market, featuring native support for bKash payments, Bangladesh address validation, and Bengali/English bilingual product catalog.

## 🚀 Quick Start

```bash
# Clone and install
git clone <repository-url>
cd novara-commerce
npm install

# Configure environment
cp .env.example .env
# Edit .env with your MongoDB URI, JWT secrets, and admin credentials

# Start development server
npm run dev
```

Visit: http://localhost:5173

## ✨ Features

- 🛒 **Full E-Commerce**: Product catalog, cart, checkout, orders
- 💳 **bKash Payment**: Native bKash Tokenized Checkout v2 integration
- 📍 **Bangladesh Locations**: Complete address validation (8 divisions, 64 districts, 504 upazilas, 4,964 unions)
- 🌐 **Bilingual**: English and Bengali product names
- 🔐 **Secure Auth**: JWT authentication, OAuth (Google/Facebook)
- 📦 **Inventory Management**: Real-time stock tracking with variants
- 🎨 **Admin Panel**: Product management, orders, CMS, image uploads
- 📱 **Mobile Responsive**: TailwindCSS 4 mobile-first design
- ⚡ **Fast**: Vite 8 + React 19

## 📦 Tech Stack

**Frontend**: React 19 • Vite 8 • TailwindCSS 4 • Redux Toolkit • React Router 7  
**Backend**: Node.js 22 • Express 4 • TypeScript 7 • Mongoose 9  
**Database**: MongoDB Atlas (replica set required for transactions)  
**Services**: Cloudinary (images) • bKash (payments) • Resend (emails)

## 🛠️ Development

### Prerequisites
- Node.js 18+ (22.x recommended)
- MongoDB Atlas account
- Cloudinary account (for image uploads)

### Required Environment Variables

```env
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname

# Authentication
JWT_SECRET=<64-char-random-string>
SESSION_SECRET=<64-char-random-string>

# Admin Account
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<min-12-chars>

# Image Uploads (Cloudinary)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Scripts

```bash
npm run dev      # Start dev server (HMR enabled)
npm run build    # Build for production
npm start        # Start production server
npm run lint     # TypeScript check
npm test         # Run test suite
```

## 🚀 Deployment

### Render (Recommended)

1. Push to GitHub
2. Create Render service with Blueprint (`render.yaml`)
3. Configure environment variables in Render dashboard
4. Deploy!

📖 **Complete Guide**: See [DEPLOYMENT.md](./DEPLOYMENT.md)  
✅ **Checklist**: See [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)

### Build Commands
```bash
# Build command
npm install && NPM_CONFIG_SCRIPT_SHELL=/bin/bash npm run build

# Start command
npm start

# Health check
/api/health
```

## 📂 Project Structure

```
src/
├── app/                 # Redux store
├── components/          # React components
├── features/            # Redux slices (auth, cart, etc.)
├── pages/              # Page components
│   ├── account/        # Customer pages
│   └── admin/          # Admin panel
├── server/             # Express backend
│   ├── models/         # Mongoose models
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   └── __tests__/      # Tests
└── services/           # Frontend API client
```

## 🔐 Security Features

- JWT authentication with token versioning
- bcrypt password hashing
- Rate-limiting on admin login
- Input validation (Zod schemas)
- File upload signature verification
- Payment gateway server-side validation
- CORS protection
- Security headers (CSP, X-Frame-Options)

## 🌍 Bangladesh-Specific Features

### Address Validation
Uses `bangladesh-location-data` package:
- 8 Divisions • 64 Districts • 504 Upazilas • 4,964 Unions
- English and Bengali names
- Stable IDs with parent relationships

### bKash Integration
- Tokenized Checkout v2
- Sandbox and production support
- Server-side payment verification
- Idempotency and reconciliation

### Shipping
- Free shipping ≥ ৳5,000
- Dhaka: ৳80 • Outside Dhaka: ৳150

## 📚 Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete deployment guide
- **[PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)** - Pre-launch checklist
- **[.env.example](./.env.example)** - Environment variables reference

## 🧪 Testing

```bash
# Run all tests
npm test

# Test with coverage
npm run test:coverage
```

Current test coverage:
- Authentication & authorization
- Payment gateway integration
- Bangladesh location validation
- Cart operations
- Admin permissions

## 📄 License

Proprietary software. All rights reserved.  
**Copyright © 2025 Novara Commerce**

## 🙏 Acknowledgments

- **bangladesh-location-data** (MIT) - Location dataset
- **bKash** - Payment gateway
- **Cloudinary** - Image CDN
- **Render** - Cloud hosting

---

**Built with ❤️ for Bangladesh's e-commerce future**
