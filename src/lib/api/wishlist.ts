import { supabase } from "../supabaseClient";

export type WishlistItem = {
  id: string;
  garden_id: string;
  name: string;
  notes: string | null;
  created_at: string;
};

export async function listWishlist(gardenId: string): Promise<WishlistItem[]> {
  const { data, error } = await supabase
    .from("wishlist_items")
    .select("*")
    .eq("garden_id", gardenId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WishlistItem[];
}

export async function createWishlistItem(
  item: Partial<WishlistItem> & { garden_id: string; name: string }
): Promise<WishlistItem> {
  const { data, error } = await supabase
    .from("wishlist_items")
    .insert(item)
    .select("*")
    .single();
  if (error) throw error;
  return data as WishlistItem;
}

export async function updateWishlistItem(
  id: string,
  patch: Partial<WishlistItem>
): Promise<WishlistItem> {
  const { data, error } = await supabase
    .from("wishlist_items")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as WishlistItem;
}

export async function deleteWishlistItem(id: string): Promise<void> {
  const { error } = await supabase.from("wishlist_items").delete().eq("id", id);
  if (error) throw error;
}
