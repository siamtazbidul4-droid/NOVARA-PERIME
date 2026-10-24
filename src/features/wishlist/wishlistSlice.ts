import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface WishlistState {
  itemIds: string[];
}

const loadWishlist = (): string[] => {
  try {
    const raw = localStorage.getItem('novara_wishlist');
    if (!raw) return [];
    
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    
    // Normalize and validate: ensure all entries are valid string IDs
    return parsed
      .map((item) => {
        // If item is already a string, use it
        if (typeof item === 'string') return item;
        // If item is an object with _id property, extract it
        if (item && typeof item === 'object' && '_id' in item) {
          return String(item._id);
        }
        return null;
      })
      .filter((id): id is string => {
        // Keep only valid MongoDB ObjectId strings (24 hex characters)
        return typeof id === 'string' && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id);
      });
  } catch {
    return [];
  }
};

const initialState: WishlistState = {
  itemIds: loadWishlist(),
};

export const wishlistSlice = createSlice({
  name: 'wishlist',
  initialState,
  reducers: {
    toggleWishlist: (state, action: PayloadAction<string>) => {
      // Ensure the payload is a valid string ID
      let id = action.payload;
      
      // If an object was passed, try to extract _id
      if (typeof id !== 'string') {
        if (id && typeof id === 'object' && '_id' in id) {
          id = String((id as any)._id);
        } else {
          console.error('Invalid wishlist item:', id);
          return;
        }
      }
      
      // Validate it's a proper MongoDB ObjectId format
      if (!id || typeof id !== 'string' || id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id)) {
        console.error('Invalid product ID format:', id);
        return;
      }
      
      const index = state.itemIds.indexOf(id);
      if (index > -1) {
        state.itemIds.splice(index, 1);
      } else {
        state.itemIds.push(id);
      }
      try {
        localStorage.setItem('novara_wishlist', JSON.stringify(state.itemIds));
      } catch (e) {
        console.error(e);
      }
    },
    clearWishlist: (state) => {
      state.itemIds = [];
      try {
        localStorage.removeItem('novara_wishlist');
      } catch (e) {
        console.error(e);
      }
    },
  },
});

export const { toggleWishlist, clearWishlist } = wishlistSlice.actions;
export default wishlistSlice.reducer;
