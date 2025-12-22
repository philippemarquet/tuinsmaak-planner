import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns "white" or "black" depending on the luminance of the given hex color.
 * For light backgrounds, returns black text; for dark backgrounds, returns white.
 */
export function getContrastTextColor(hexColor: string | null | undefined): "white" | "black" {
  if (!hexColor) return "white";
  
  // Remove # if present
  const hex = hexColor.replace(/^#/, "");
  
  // Parse hex to RGB
  let r = 0, g = 0, b = 0;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else {
    return "white"; // fallback for invalid input
  }
  
  // Calculate relative luminance (WCAG formula)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Use threshold of 0.5 for best contrast
  return luminance > 0.5 ? "black" : "white";
}
