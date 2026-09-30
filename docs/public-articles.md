# Public learning articles

The public community homepage is `public/community/index.html`. Topic landing pages live under `public/community/topics/`; the article archive is `public/articles/index.html`. Articles use stable URLs such as `/articles/ai-integration/`. Japanese and English versions use `/ja/...` and `/en/...` with a translated article at the matching path. Chinese keeps its original URLs. All pages are standalone HTML so a visitor or crawler can read the full content without an app session or JavaScript. The community has editorial articles and topics only; there are no user posts or comments.

For each new article:

1. For an AI module article, add one entry to `scripts/build-community-articles.mjs` and complete its `en` and `ja` entries in `scripts/community-translations.mjs`. `npm run build` runs `scripts/build-community-locales.mjs`, which regenerates the Chinese module articles, all translated pages, language alternates, and sitemap. For another topic, extend the locale builder as well as its Chinese source page.
2. Give each locale one visible `h1`, a translated title and description, a self-canonical URL, `hreflang` links, and article and breadcrumb structured data. The language switcher should keep the reader on the matching article or directory page.
3. Add the article to the Chinese directory and relevant topic page. The locale builder produces the corresponding English and Japanese cards and sitemap entries.
4. Link to the topic or article from a relevant product page. Keep account specific content behind login; public articles should contain only general instructions and examples.
5. Build and request all three article URLs directly. Confirm each response contains the correct language article HTML rather than the app shell.

The HTML in `public/` is copied into the frontend build. Publishing still requires deploying that build and checking the public URL.
