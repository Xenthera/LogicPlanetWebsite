# Logic Planet website

Static marketing site for [Logic Planet](https://github.com/Xenthera/LogicPlanetReleases/releases/). Astro, TypeScript, and Tailwind. No database, no server, no CMS.

The look follows the game: navy field, warm gold used sparingly, Fredoka for display, Outfit for text, IBM Plex Mono for labels. Those font files are the ones shipped with the game.

## Run it locally

Node 22 or newer.

```bash
npm install
npm run dev
```

Open the URL Astro prints. `npm run build` writes the static site to `dist/`. `npm run preview` serves that folder.

Locally the site is served at `/`. The GitHub Actions build sets `BASE_PATH=/LogicPlanetWebsite`, which is what GitHub project pages expect.

## Add a gallery entry

Create `src/content/gallery/your-slug.md`. The file name is the URL: `/gallery/your-slug`.

```yaml
---
title: A finished adder
description: One sentence for the gallery card and the page description.
image: /gallery/adder.png
alt: A circuit board with an adder, seen from above in the world.
category: Boards
order: 4
featured: false
---

A longer caption, if you want one. This is the body of the page.
```

Put the image in `public/gallery/adder.png`. Paths in frontmatter start with `/` and do not include the GitHub Pages base; the site adds that when it renders.

`order` sorts the gallery. `featured: true` also places the entry in the homepage strip. The first featured entry is the homepage hero image.

To replace a placeholder, either change `image` to the new file or overwrite the file the entry already points at (`public/placeholders/building.svg` and the others).

## Write a development article

Create `src/content/blog/your-slug.md`. The file name is the URL: `/blog/your-slug`.

```yaml
---
title: Wiring, without a delay on the wire
excerpt: One or two sentences for the index and for search results.
date: 2026-10-26
category: Simulation
tags:
  - simulation
draft: true
cover: /blog/wiring.png
coverAlt: A wire between two parts.
description: Optional search description. The excerpt is used when this is omitted.
---

The article, in Markdown. Images in the body can live under `public/` and be written as normal Markdown images.
```

`draft: true` hides the article from the production build. It still shows when you run `npm run dev`. Set `draft: false` to publish. The homepage lists the three newest published articles, and only when at least one exists.

## Deploy on GitHub Pages

The workflow is `.github/workflows/pages.yml`. It builds on every push to `main` and deploys with GitHub's Pages action.

In the repository on GitHub:

1. Settings → Pages.
2. Build and deployment → Source: **GitHub Actions**.

The first successful run publishes `https://xenthera.github.io/LogicPlanetWebsite/`.

If the repository name is not `LogicPlanetWebsite`, change `BASE_PATH` in the workflow and the sitemap line in `public/robots.txt`.

No secrets are required.

## Custom domain, or a host at the root

1. Set `BASE_PATH` to `/` (or remove it).
2. Set `SITE_URL` to the origin, for example `https://logicplanet.example`.
3. Update the sitemap URL in `public/robots.txt`.
4. For GitHub Pages, add the domain under Settings → Pages, and add the DNS record GitHub shows you.

`astro.config.mjs` reads `BASE_PATH` and `SITE_URL`, so another static host can use the same build.

## Content model

Content is separate from the pages that render it.

| Kind | Where | Schema |
| --- | --- | --- |
| Site name, description, download URL | `src/data/site.ts` | plain TypeScript |
| Navigation | `src/data/navigation.ts` | `{ href, label }` |
| Feature copy | `src/data/features.ts` | id, eyebrow, title, body, image, imageAlt, home |
| Gallery | `src/content/gallery/*.md` | title, description, image, alt, category, order, featured |
| Articles | `src/content/blog/*.md` | title, excerpt, date, category, tags, draft, optional cover, coverAlt, description |

Schemas for gallery and articles are in `src/content.config.ts`. Astro checks them at build time. The file name is the stable slug.

Pages ask `src/lib/content.ts` for posts and gallery entries. A future CMS replaces that module, and the collection loaders, without rewriting the page components. Keep the same fields and the same slugs.

Feature text is only for capabilities that already run in the game. Do not describe unfinished work as if it shipped.

Images currently in the gallery are labeled placeholders, not gameplay.
