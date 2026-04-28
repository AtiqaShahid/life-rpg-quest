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