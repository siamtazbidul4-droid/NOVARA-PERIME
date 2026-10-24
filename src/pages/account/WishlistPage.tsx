import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { toggleWishlist } from '../../features/wishlist/wishlistSlice';
import { addToCart } from '../../features/cart/cartSlice';
import { animateCartFlight } from '../../features/cart/cartFlight';
import { addToast } from '../../features/toast/toastSlice';
import { api } from '../../services/api';
import { Product } from '../../types';
import { Heart, Trash2, ShoppingBag } from 'lucide-react';

export const WishlistPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const itemIds = useAppSelector((state) => state.wishlist.itemIds);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWishlistProducts = async () => {
      if (itemIds.length === 0) {
        setProducts([]);
        setLoading(false);
        return;
      }

      try {
        // Normalize IDs: extract string IDs from objects if necessary, filter invalid entries
        const normalizedIds = itemIds
          .map((item) => {
            // If item is already a string, use it
            if (typeof item === 'string') return item;
            // If item is an object with _id property, extract it
            if (item && typeof item === 'object' && '_id' in item) {
              return String((item as any)._id);
            }
            // Invalid entry - skip it
            return null;
          })
          .filter((id): id is string => {
            // Keep only valid string IDs that look like MongoDB ObjectIds (24 hex chars)
            return typeof id === 'string' && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id);
          });

        if (normalizedIds.length === 0) {
          setProducts([]);
          setLoading(false);
          return;
        }

        const res = await api.get('/products', { ids: normalizedIds.join(','), limit: 50 });
        setProducts(res.products || []);
      } catch (e) {
        console.warn('Failed to load wishlist items', e);
      } finally {
        setLoading(false);
      }
    };

    fetchWishlistProducts();
  }, [itemIds]);

  const handleRemove = (productId: string) => {
    dispatch(toggleWishlist(productId));
    dispatch(
      addToast({
        type: 'info',
        title: 'Removed from Wishlist',
        message: 'Product removed from your saved collection.',
      })
    );
  };

  const handleMoveToCart = (product: Product, event: React.MouseEvent<HTMLButtonElement>) => {
    animateCartFlight(event.currentTarget);
    dispatch(
      addToCart({
        productId: product._id,
        name: product.name,
        price: product.salePrice || product.basePrice,
        image: product.images[0],
        quantity: 1,
        maxStock: product.stock,
      })
    );
    dispatch(
      addToast({
        type: 'success',
        title: 'Added to Bag',
        message: `${product.name} moved to your shopping bag.`,
      })
    );
  };

  return (
    <div className="min-h-screen bg-[#FBF9F5] py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-stone-900">
            My Wishlist ({products.length})
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Your saved inspirational items for when you are ready to style your spaces.
          </p>
        </div>

        {loading ? (
          <div className="py-20 text-center text-xs text-stone-500">Loading wishlist...</div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-stone-100 shadow-2xs max-w-md mx-auto">
            <Heart className="w-12 h-12 text-stone-300 mx-auto mb-3" />
            <h3 className="text-base font-serif font-semibold text-stone-800">
              Your wishlist is empty
            </h3>
            <p className="text-xs text-stone-500 mb-6">
              Click the heart icon on any product to save it to your wishlist.
            </p>
            <Link
              to="/products"
              className="rounded-xl bg-[#133E32] px-6 py-2.5 text-xs font-semibold text-white"
            >
              Discover Furniture & Decor
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((product) => (
              <div
                key={product._id}
                data-cart-flight-card
                className="group bg-white rounded-2xl border border-stone-100 overflow-hidden shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div className="relative aspect-square bg-stone-100 overflow-hidden">
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <button
                    onClick={() => handleRemove(product._id)}
                    className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-white/90 text-stone-600 hover:text-rose-600 shadow-xs"
                    title="Remove from wishlist"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-stone-900 truncate">
                      {product.name}
                    </h3>
                    <p className="text-xs font-bold text-[#133E32] mt-1">
                      ৳{(product.salePrice || product.basePrice).toLocaleString()}
                    </p>
                  </div>

                  <button
                    onClick={(event) => handleMoveToCart(product, event)}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#133E32] py-2 text-xs font-semibold text-white hover:bg-[#0d2e24]"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Move to Bag</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
