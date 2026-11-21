import type { APIRoute } from 'astro';

const SITE_URL = 'https://videomp3.pages.dev';

const PAGES = [
  { loc: `${SITE_URL}/`, changefreq: 'weekly', priority: '1.0' },
  { loc: `${SITE_URL}/how-to-use`, changefreq: 'monthly', priority: '0.8' },
  { loc: `${SITE_URL}/hire-me`, changefreq: 'monthly', priority: '0.7' },
];

export const GET: APIRoute = () => {
  const lastmod = new Date().toISOString().split('T')[0];

  const urlsXml = PAGES.map(
    (page) => `  <url>
    <loc>${page.loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  ).join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsXml}
</urlset>
`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};
