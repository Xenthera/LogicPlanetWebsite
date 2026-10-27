import type { ImageMetadata } from "astro";
import { heroSlides, type Slide } from "../data/showcase";
import { pictureOf } from "./picture";

const files = import.meta.glob("../content/gameplay/*.{png,jpg,jpeg,webp,gif,avif}", {
  eager: true,
  import: "default",
}) as Record<string, ImageMetadata>;

const numbered = /-(\d+)\.[^.]+$/i;

// The carousel always keeps its designed frames. A higher -n adds another.
export async function loadGameplay(): Promise<Slide[]> {
  const found = new Map<number, ImageMetadata>();
  for (const [path, image] of Object.entries(files)) {
    const name = path.match(/[^/]+$/);
    const slot = name?.[0].match(numbered);
    const index = slot ? Number(slot[1]) : 0;
    if (index > 0 && image?.width) found.set(index, image);
  }

  const count = Math.max(heroSlides.length, ...found.keys(), 0);
  return Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const image = found.get(index + 1);
      const slide = heroSlides[index];
      if (!image) return { alt: undefined };
      const picture = await pictureOf(image);
      return { image: picture.src, full: picture.full, srcset: picture.srcset, alt: slide?.alt };
    }),
  );
}
