import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    date: z.coerce.date(),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    description: z.string().optional(),
  }),
});

const gallery = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/gallery" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    image: z.string(),
    alt: z.string(),
    category: z.string(),
    order: z.number().int(),
    featured: z.boolean().default(false),
  }),
});

export const collections = { blog, gallery };
