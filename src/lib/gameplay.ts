import { heroSlides, type Slide } from "../data/showcase";

const files = import.meta.glob("../content/gameplay/*.{png,jpg,jpeg,webp,gif,avif}", {
  eager: true,
  query: "?url",
  import: "default",
});

const numbered = /-(\d+)\.[^.]+$/i;

// The carousel always keeps its designed frames. A higher -n adds another.
export function loadGameplay(): Slide[] {
  const found = new Map<number, string>();
  for (const [path, url] of Object.entries(files)) {
    const name = path.match(/[^/]+$/);
    const slot = name?.[0].match(numbered);
    const index = slot ? Number(slot[1]) : 0;
    const src = typeof url === "string" ? url : "";
    if (index > 0 && src) found.set(index, src);
  }

  const count = Math.max(heroSlides.length, ...found.keys(), 0);
  return Array.from({ length: count }, (_, index) => {
    const src = found.get(index + 1);
    const slide = heroSlides[index];
    return { image: src, alt: src ? slide?.alt : undefined };
  });
}
