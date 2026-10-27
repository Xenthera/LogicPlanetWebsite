import { features, type Feature } from "../data/showcase";
import { pictureOf, type Picture } from "./picture";
import type { ImageMetadata } from "astro";

const files = import.meta.glob("../content/features/*/*.{png,jpg,jpeg,webp,gif,avif}", {
  eager: true,
  import: "default",
}) as Record<string, ImageMetadata>;

const numbered = /-(\d+)\.[^.]+$/i;

export type FeatureImage = { src?: string; full?: string; srcset?: string; alt?: string };

export type FeatureView = Feature & {
  images: FeatureImage[];
};

// Slot 1 is the file ending in -1, wherever it sits in the feature's folder.
function imagesFor(id: string): Map<number, ImageMetadata> {
  const found = new Map<number, ImageMetadata>();
  for (const [path, image] of Object.entries(files)) {
    const match = path.match(/features\/([^/]+)\/([^/]+)$/);
    if (!match || match[1] !== id || !image?.width) continue;
    const slot = match[2].match(numbered);
    const index = slot ? Number(slot[1]) : 0;
    if (index > 0) found.set(index, image);
  }
  return found;
}

function view(picture: Picture | undefined, alt?: string): FeatureImage {
  if (!picture) return {};
  return { src: picture.src, full: picture.full, srcset: picture.srcset, alt };
}

export async function loadFeatures(): Promise<FeatureView[]> {
  return Promise.all(
    features.map(async (feature) => {
      const found = imagesFor(feature.id);
      const count = Math.max(1, ...found.keys(), 0);
      const images = await Promise.all(
        Array.from({ length: count }, async (_, index) => {
          const image = found.get(index + 1);
          const picture = image ? await pictureOf(image) : undefined;
          return view(picture, picture ? feature.imageAlt || feature.title || undefined : undefined);
        }),
      );
      return { ...feature, images };
    }),
  );
}
