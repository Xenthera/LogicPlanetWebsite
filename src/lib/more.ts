import type { ImageMetadata } from "astro";
import { moreFeatures, type MoreFeature } from "../data/showcase";
import { pictureOf } from "./picture";

const files = import.meta.glob("../content/more/*/*.{png,jpg,jpeg,webp,gif,avif}", {
  eager: true,
  import: "default",
}) as Record<string, ImageMetadata>;

export type MoreFeatureView = MoreFeature & {
  image?: string;
  full?: string;
  srcset?: string;
};

// One picture per folder. If several files are dropped in, the first name wins.
function imageFor(id: string): ImageMetadata | undefined {
  const found: { name: string; image: ImageMetadata }[] = [];
  for (const [path, image] of Object.entries(files)) {
    const match = path.match(/more\/([^/]+)\/([^/]+)$/);
    if (!match || match[1] !== id || !image?.width) continue;
    found.push({ name: match[2], image });
  }
  found.sort((a, b) => a.name.localeCompare(b.name));
  return found[0]?.image;
}

export async function loadMore(): Promise<MoreFeatureView[]> {
  return Promise.all(
    moreFeatures.map(async (feature) => {
      const image = imageFor(feature.id);
      if (!image) return { ...feature };
      const picture = await pictureOf(image);
      return { ...feature, image: picture.src, full: picture.full, srcset: picture.srcset };
    }),
  );
}
