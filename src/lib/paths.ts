/** Prefix a site path with Astro's base, which is `/` locally and the repo name on GitHub Pages. */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL;
  if (/^[a-z]+:/i.test(path)) return path;
  const clean = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${clean}`;
}
