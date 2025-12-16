-- Add is_checked column to wishlist_items
ALTER TABLE public.wishlist_items 
ADD COLUMN is_checked boolean NOT NULL DEFAULT false;