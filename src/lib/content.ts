import { getCollection, type CollectionEntry } from "astro:content";

export async function getPosts(): Promise<CollectionEntry<"blog">[]> {
  const posts = await getCollection("blog", ({ data }) => {
    if (import.meta.env.PROD && data.draft) return false;
    return true;
  });
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getGallery(): Promise<CollectionEntry<"gallery">[]> {
  const items = await getCollection("gallery");
  return items.sort((a, b) => a.data.order - b.data.order);
}
