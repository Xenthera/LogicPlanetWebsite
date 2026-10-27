import type { ImageMetadata } from "astro";
import { getCollection } from "astro:content";
import { pictureOf } from "./picture";

const files = import.meta.glob("../content/gallery/*.{png,jpg,jpeg,webp,gif,avif}", {
  eager: true,
  import: "default",
}) as Record<string, ImageMetadata>;

export type GalleryShot = {
  src: string;
  srcset?: string;
  full: string;
  width: number;
  height: number;
  alt: string;
  title: string;
  category?: string;
  description?: string;
};

function stemOf(path: string): string {
  return path.split("/").pop()?.replace(/\.[^.]+$/i, "") ?? path;
}

function titleFrom(name: string): string {
  const spaced = name.replace(/[-_]+/g, " ").trim();
  if (!spaced) return "Screenshot";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Drop pictures in src/content/gallery/. The name can be anything.
// A markdown file with the same name can set title, alt, description, and category.
export async function loadGallery(): Promise<GalleryShot[]> {
  const notes = await getCollection("gallery");
  const byStem = new Map(notes.map((note) => [stemOf(note.id), note]));
  const found = await Promise.all(
    Object.entries(files).flatMap(([path, image]) => {
      if (!image?.src || !image.width || !image.height) return [];
      const stem = stemOf(path);
      const note = byStem.get(stem);
      const title = note?.data.title || titleFrom(stem);
      return [
        pictureOf(image).then((picture) => ({
          name: stem,
          shot: {
            src: picture.src,
            srcset: picture.srcset,
            full: picture.full,
            width: picture.width,
            height: picture.height,
            alt: note?.data.alt || title,
            title,
            category: note?.data.category,
            description: note?.data.description,
          },
        })),
      ];
    }),
  );

  found.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return found.map((item) => item.shot);
}
