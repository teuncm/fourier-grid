# Search and sharing

The production URL is **https://teuncm.nl/fourier-grid/**. The project is a page
on teuncm.nl; its canonical URL must point to the project, not the homepage.

The initial HTML includes a descriptive title, description, canonical link,
Open Graph/Twitter card metadata, and WebPage/WebApplication structured data.
It also contains a readable introduction for visitors without JavaScript and
crawlers before rendering. Vue replaces that introduction with the playground;
the app keeps its compact layout. The footer logo links back to teuncm.nl.

`public/social-preview.png` is a 1200×630 sharing card. Its editable SVG source
is alongside it. The four plots show a complex signal and its actual Fourier
transform using the app's palette. This artwork does not change the empty
starting canvases. When changing the artwork, export the SVG at its native
size to update the PNG used by sharing services.

## Link from the main site

Add this to the projects section of teuncm.nl, using the main site's styling:

```html
<article>
  <h2><a href="https://teuncm.nl/fourier-grid/">Fourier Grid</a></h2>
  <p>An interactive 2D Fourier transform playground. Draw in spatial or frequency
    space and explore complex signals, filters, noise, and symmetry.</p>
</article>
```

Use a normal HTML link with `href` so it works without JavaScript and can be
discovered by crawlers. The main site's source is maintained separately from
this repository; this change does not add the link to that site automatically.

## After deployment

1. Confirm the canonical page and `social-preview.png` return HTTP 200 publicly.
2. Link to the project from teuncm.nl using the snippet above.
3. Submit `https://teuncm.nl/fourier-grid/sitemap.xml` in the site's Google Search
   Console property, and inspect/request indexing for the project URL.
4. Check a shared link's preview after the updated files are live. Social sites
   may cache old titles and images until they recrawl the URL.

If the main domain uses `https://teuncm.nl/robots.txt`, ensure it allows this
project and its JS/WASM/image assets. Optionally add:

```text
Sitemap: https://teuncm.nl/fourier-grid/sitemap.xml
```

A robots.txt inside `/fourier-grid/` does not control crawling for the domain,
so this project deliberately does not create one. Maintain root crawl settings
in the main site's repository. No analytics, ownership tokens, ratings, or
unverified author details are added.

References: [Google's JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics),
[Google's robots.txt location guidance](https://developers.google.com/crawling/docs/robots-txt/create-robots-txt).
