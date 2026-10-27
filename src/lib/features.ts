import { features, type Feature } from "../data/showcase";

const files = import.meta.glob("../content/features/*/*.{png,jpg,jpeg,webp,gif,avif}", {
  eager: true,
  query: "?url",
  import: "default",
});

const numbered = /-(\d+)\.[^.]+$/i;

export type FeatureImage = { src?: string; alt?: string };

export type FeatureView = Feature & {
  images: FeatureImage[];
};

// Slot 1 is the file ending in -1, wherever it sits in the feature's folder.
function imagesFor(id: string): Map<number, string> {
  const found = new Map<number, string>();
  for (const [path, url] of Object.entries(files)) {
    const match = path.match(/features\/([^/]+)\/([^/]+)$/);
    if (!match || match[1] !== id) continue;
    const slot = match[2].match(numbered);
    const index = slot ? Number(slot[1]) : 0;
    const src = typeof url === "string" ? url : "";
    if (index > 0 && src) found.set(index, src);
  }
  return found;
}

export function loadFeatures(): FeatureView[] {
  return features.map((feature) => {
    const found = imagesFor(feature.id);
    const count = Math.max(1, ...found.keys(), 0);
    const images = Array.from({ length: count }, (_, index) => {
      const src = found.get(index + 1);
      return { src, alt: src ? feature.imageAlt || feature.title || undefined : undefined };
    });
    return { ...feature, images };
  });
}
