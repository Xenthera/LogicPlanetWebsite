// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// Project-site default. Local `npm run dev` leaves this unset and serves at /.
// GitHub Actions sets BASE_PATH=/LogicPlanetWebsite.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site: process.env.SITE_URL || 'https://xenthera.github.io',
  base,
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [sitemap()],
});
