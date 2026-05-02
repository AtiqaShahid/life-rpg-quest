// Auto-discovers all default avatar images in src/assets/avatars/.
// Drop a new image into that folder and it will appear in the gallery automatically.
const modules = import.meta.glob("@/assets/avatars/*.{jpg,jpeg,png,webp}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

export const DEFAULT_AVATARS: { id: string; url: string }[] = Object.entries(modules)
  .map(([path, url]) => ({ id: path.split("/").pop() || path, url }))
  .sort((a, b) => {
    const na = parseInt(a.id.match(/\d+/)?.[0] ?? "0", 10);
    const nb = parseInt(b.id.match(/\d+/)?.[0] ?? "0", 10);
    return na - nb;
  });

/**
 * Resolve a stored avatar value to a usable image URL.
 *
 * Stored values can be:
 *  - `default:<id>`  → a stable token pointing at a bundled default avatar.
 *    We resolve it via the Vite glob so hashed asset URLs are always current.
 *  - any http(s) URL  → returned as-is (custom uploads).
 *  - null/empty       → returns null so the caller can fall back to a hero image.
 *
 * IMPORTANT: never persist the hashed asset URL itself — those change on every
 * build/deploy and would leave users with broken avatars.
 */
export function resolveAvatarUrl(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith("default:")) {
    const id = stored.slice("default:".length);
    const match = DEFAULT_AVATARS.find((a) => a.id === id);
    return match?.url ?? null;
  }
  return stored;
}