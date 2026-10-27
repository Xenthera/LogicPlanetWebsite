import { moreFeatures, type MoreFeature } from "../data/showcase";

const files = import.meta.glob("../content/more/*/*.{png,jpg,jpeg,webp,gif,avif}", {
  eager: true,
  query: "?url",
  import: "default",
});

export type MoreFeatureView = MoreFeature & {
  image?: string;
};

// One picture per folder. If several files are dropped in, the first name wins.
function imageFor(id: string): string | undefined {
  const found: { name: string; src: string }[] = [];
  for (const [path, url] of Object.entries(files)) {
    const match = path.match(/more\/([^/]+)\/([^/]+)$/);
    if (!match || match[1] !== id) continue;
    const src = typeof url === "string" ? url : "";
    if (src) found.push({ name: match[2], src });
  }
  found.sort((a, b) => a.name.localeCompare(b.name));
  return found[0]?.src;
}

export function loadMore(): MoreFeatureView[] {
  return moreFeatures.map((feature) => ({ ...feature, image: imageFor(feature.id) }));
}
