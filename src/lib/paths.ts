/** Prefix a site path with Astro's base, which is `/` locally and the repo name on GitHub Pages. */
export function withBase(path: string): string {
  if (/^[a-z]+:/i.test(path)) return path;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  if (base && (path === base || path.startsWith(`${base}/`))) return path;
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${base}${clean}`;
}
