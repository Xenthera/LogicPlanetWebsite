import { getImage, type ImageMetadata } from "astro:assets";

const WIDTHS = [640, 960, 1280, 1600, 1920];

export type Picture = {
  /** Size the page shows in the layout. */
  src: string;
  srcset?: string;
  /** Original file, used when the picture is opened. */
  full: string;
  width: number;
  height: number;
};

// The layout never needs the multi‑megabyte source. Build a few display
// sizes and leave the original for the lightbox.
export async function pictureOf(image: ImageMetadata): Promise<Picture> {
  const full = image.src;
  if (image.format === "gif" || image.format === "svg") {
    return { src: full, full, width: image.width, height: image.height };
  }

  const targets = [...new Set(WIDTHS.filter((width) => width < image.width))];
  if (!targets.length || image.width <= WIDTHS[WIDTHS.length - 1]) targets.push(image.width);
  targets.sort((a, b) => a - b);

  const rendered = await Promise.all(
    targets.map((width) => getImage({ src: image, width, format: "webp", quality: 82 })),
  );
  const srcset = rendered.map((item) => `${item.src} ${item.attributes.width}w`).join(", ");
  const pick = rendered.find((item) => (item.attributes.width ?? 0) >= 1280) ?? rendered[rendered.length - 1];

  return { src: pick.src, srcset, full, width: image.width, height: image.height };
}
