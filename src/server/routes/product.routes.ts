import { Router, Request, Response } from 'express';
import { ProductModel } from '../models/Product';
import { ReviewModel } from '../models/Extras';
import { requireAuth, requireStaff } from '../middleware/auth';
import { isDbConnected } from '../config/db';
import { SEED_PRODUCTS } from '../seed/seedData';

const router = Router();

function toFiniteNumber(value: unknown, field: string): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`${field} must be a non-negative number.`);
  }
  return num;
}

function normalizeProductPayload(body: unknown, requireAllFields = true) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Product payload must be an object.');
  }

  const product = { ...(body as Record<string, unknown>) };
  const name = typeof product.name === 'string' ? product.name.trim() : '';
  const category = typeof product.category === 'string' ? product.category.trim() : '';
  const brand = typeof product.brand === 'string' ? product.brand.trim() || 'Livora' : 'Livora';
  const sku = typeof product.sku === 'string' ? product.sku.trim() : '';

  if (requireAllFields && !name) throw new Error('Product name is required.');
  if (requireAllFields && !category) throw new Error('Product category is required.');
  if (requireAllFields && !sku) throw new Error('Product SKU is required.');

  const normalized: Record<string, unknown> = { ...product };

  if (name || !requireAllFields) normalized.name = name || undefined;
  if (category || !requireAllFields) normalized.category = category || undefined;
  if (brand) normalized.brand = brand;
  if (sku || !requireAllFields) normalized.sku = sku ? sku.toUpperCase() : undefined;

  if (product.basePrice !== undefined) normalized.basePrice = toFiniteNumber(product.basePrice, 'Base price');
  if (product.stock !== undefined) {
    const numericStock = Number(product.stock);
    if (!Number.isInteger(numericStock) || numericStock < 0) {
      throw new Error('Stock must be a non-negative integer.');
    }
    normalized.stock = numericStock;
  }
  if (product.salePrice !== undefined) normalized.salePrice = toFiniteNumber(product.salePrice, 'Sale price');

  if (product.slug !== undefined && typeof product.slug === 'string') {
    normalized.slug = product.slug.trim().toLowerCase();
  } else if ((name || sku) && requireAllFields) {
    normalized.slug = (name || sku).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || sku.toLowerCase();
  }

  return normalized;
}

// 1. Get products list with filters, sorting, and pagination
router.get('/', async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      category,
      brand,
      minPrice,
      maxPrice,
      inStock,
      sort,
      q,
      ids,
      page = 1,
      limit = 12,
    } = req.query;

    const query: Record<string, any> = { status: 'active' };

    if (ids) {
      const idArray = (ids as string).split(',').filter(Boolean);
      
      // Validate MongoDB ObjectIds before querying
      const validIds: string[] = [];
      const invalidIds: string[] = [];
      
      for (const id of idArray) {
        const trimmedId = id.trim();
        // Check if it's a valid 24-character hexadecimal string (MongoDB ObjectId format)
        if (trimmedId.length === 24 && /^[0-9a-fA-F]{24}$/.test(trimmedId)) {
          validIds.push(trimmedId);
        } else {
          invalidIds.push(trimmedId);
        }
      }
      
      // If there are invalid IDs, log them but continue with valid ones
      if (invalidIds.length > 0) {
        console.warn('Invalid product IDs received:', invalidIds);
      }
      
      // If no valid IDs remain, return empty result
      if (validIds.length === 0) {
        return res.status(400).json({ 
          error: 'No valid product IDs provided',
          invalidIds,
          products: [],
          total: 0,
          page: 1,
          pages: 0
        });
      }
      
      query._id = { $in: validIds };
    }

    if (category) {
      query.category = category;
    }

    if (brand) {
      query.brand = brand;
    }

    if (minPrice || maxPrice) {
      query.basePrice = {};
      if (minPrice) query.basePrice.$gte = Number(minPrice);
      if (maxPrice) query.basePrice.$lte = Number(maxPrice);
    }

    if (inStock === 'true') {
      query.stock = { $gt: 0 };
    }

    if (q) {
      const regex = new RegExp(q as string, 'i');
      query.$or = [{ name: regex }, { nameBn: regex }, { description: regex }, { sku: regex }];
    }

    let sortOptions: Record<string, any> = { createdAt: -1 };
    if (sort === 'price_asc') sortOptions = { basePrice: 1 };
    else if (sort === 'price_desc') sortOptions = { basePrice: -1 };
    else if (sort === 'rating') sortOptions = { rating: -1 };
    else if (sort === 'popular') sortOptions = { numReviews: -1 };

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    if (!isDbConnected()) {
      let list = [...SEED_PRODUCTS];
      if (category) list = list.filter((p) => p.category === category);
      if (brand) list = list.filter((p) => p.brand === brand);
      if (q) {
        const rx = new RegExp(q as string, 'i');
        list = list.filter((p) => rx.test(p.name) || rx.test(p.nameBn || '') || rx.test(p.sku));
      }
      return res.json({
        products: list.slice(skip, skip + limitNum),
        total: list.length,
        page: pageNum,
        pages: Math.ceil(list.length / limitNum),
        dbStatus: 'pending_configuration',
        dbNotice: 'MongoDB Atlas connection string MONGODB_URI pending in environment variables.',
      });
    }

    const [products, total] = await Promise.all([
      ProductModel.find(query).sort(sortOptions).skip(skip).limit(limitNum),
      ProductModel.countDocuments(query),
    ]);

    return res.json({
      products,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Error fetching products' });
  }
});

// 2. Get related products for an active product
router.get('/:slug/related', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isDbConnected()) {
      const product = SEED_PRODUCTS.find(
        (item) =>
          (item.slug === req.params.slug || item._id === req.params.slug) &&
          item.status === 'active'
      );
      if (!product) return res.status(404).json({ error: 'Product not found' });

      const available = (item: (typeof SEED_PRODUCTS)[number]) =>
        item.status === 'active' && item.stock > 0 && item._id !== product._id;
      const related = new Map<string, (typeof SEED_PRODUCTS)[number]>();
      const append = (items: typeof SEED_PRODUCTS) => {
        for (const item of items) {
          if (available(item) && related.size < 4) related.set(item._id, item);
        }
      };

      append(SEED_PRODUCTS.filter((item) => item.category === product.category));
      append(SEED_PRODUCTS.filter((item) => item.brand === product.brand));
      append(SEED_PRODUCTS);
      return res.json({ products: Array.from(related.values()) });
    }

    const product = await ProductModel.findOne({
      status: 'active',
      $or: [
        { slug: req.params.slug },
        { _id: req.params.slug.match(/^[0-9a-fA-F]{24}$/) ? req.params.slug : null },
      ],
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const related: Array<InstanceType<typeof ProductModel>> = [];
    const excludedIds = new Set<string>([product._id.toString()]);
    const appendRelated = async (criteria: Record<string, unknown>) => {
      const remaining = 4 - related.length;
      if (remaining <= 0) return;

      const products = await ProductModel.find({
        ...criteria,
        status: 'active',
        stock: { $gt: 0 },
        _id: { $nin: Array.from(excludedIds) },
      })
        .sort({ rating: -1, numReviews: -1 })
        .limit(remaining);

      for (const candidate of products) {
        const id = candidate._id.toString();
        if (!excludedIds.has(id)) {
          excludedIds.add(id);
          related.push(candidate);
        }
      }
    };

    await appendRelated({ category: product.category });
    if (related.length < 4) await appendRelated({ brand: product.brand });
    if (related.length < 4) await appendRelated({});

    return res.json({ products: related });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Error fetching related products' });
  }
});

// 3. Get product by slug
router.get('/:slug', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isDbConnected()) {
      const match = SEED_PRODUCTS.find(
        (p) =>
          (p.slug === req.params.slug || p._id === req.params.slug) &&
          p.status === 'active'
      );
      if (!match) return res.status(404).json({ error: 'Product not found' });
      return res.json({ product: match, reviews: [] });
    }

    const product = await ProductModel.findOne({
      status: 'active',
      $or: [{ slug: req.params.slug }, { _id: req.params.slug.match(/^[0-9a-fA-F]{24}$/) ? req.params.slug : null }],
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const reviews = await ReviewModel.find({
      productId: product._id,
      status: 'approved',
    }).sort({ createdAt: -1 });
    return res.json({ product, reviews });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Error fetching product' });
  }
});

// 4. Create Product (Staff only)
router.post('/', requireAuth, requireStaff, async (req: Request, res: Response): Promise<any> => {
  try {
    const safePayload = normalizeProductPayload(req.body, true);
    const skuValue = typeof safePayload.sku === 'string' ? safePayload.sku : '';

    const existingSku = await ProductModel.findOne({ sku: skuValue.toUpperCase() });
    if (existingSku) {
      return res.status(409).json({ error: `SKU '${skuValue}' already exists in inventory.` });
    }

    const product = await ProductModel.create(safePayload);
    return res.status(201).json({ product, message: 'Product created successfully' });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Validation error saving product' });
  }
});

// 5. Update Product (Staff only)
router.put('/:id', requireAuth, requireStaff, async (req: Request, res: Response): Promise<any> => {
  try {
    const safePayload = normalizeProductPayload(req.body, false);
    const product = await ProductModel.findByIdAndUpdate(req.params.id, safePayload, { new: true });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    return res.json({ product, message: 'Product updated successfully' });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Validation error updating product' });
  }
});

// 6. Delete / Archive Product (Staff only)
router.delete('/:id', requireAuth, requireStaff, async (req: Request, res: Response): Promise<any> => {
  try {
    const product = await ProductModel.findByIdAndUpdate(req.params.id, { status: 'archived' });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    return res.json({ message: 'Product archived successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Error archiving product' });
  }
});

export default router;
