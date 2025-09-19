# oif-docs

This is a Next.js application generated with
[Create Fumadocs](https://github.com/fuma-nama/fumadocs).

Run development server:

```bash
npm run dev
# or
pnpm dev
# or
yarn dev
```

Open http://localhost:3000 with your browser to see the result.

## Explore

In the project, you can see:

- `lib/source.ts`: Code for content source adapter, [`loader()`](https://fumadocs.dev/docs/headless/source-api) provides the interface to access your content.
- `lib/layout.shared.tsx`: Shared options for layouts, optional but preferred to keep.

| Route                     | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `app/(home)`              | The route group for your landing page and other pages. |
| `app/docs`                | The documentation layout and pages.                    |
| `app/api/search/route.ts` | The Route Handler for search.                          |

### Fumadocs MDX

A `source.config.ts` config file has been included, you can customise different options like frontmatter schema.

Read the [Introduction](https://fumadocs.dev/docs/mdx) for further details.

## Learn More

To learn more about Next.js and Fumadocs, take a look at the following
resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js
  features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [Fumadocs](https://fumadocs.vercel.app) - learn about Fumadocs

## OpenAPI docs

This project integrates the official OpenAPI UI for Fumadocs.

- Styles are enabled via `src/app/global.css` importing `fumadocs-openapi/css/preset.css`.
- The OpenAPI instance is configured in `src/lib/openapi.ts`.
- The OpenAPI transformer is added in `src/lib/source.ts`.
- The MDX component `APIPage` is registered in `src/mdx-components.tsx`.
- A demo page is at `content/docs/integration/openapi.mdx`.

### Add or update APIs

1. Place your schema files in the `openapi/` directory. Supported formats: `.json`, `.yaml`, `.yml`.
   - Example included: `openapi/petstore.json`.
2. No additional config is required. All files in `openapi/` are automatically loaded by `src/lib/openapi.ts`.
3. Create or edit an MDX page and render the UI:

```mdx
---
title: My API
description: Reference and playground
---

<APIPage />
```

4. Optionally, add a link to your page in a section index (e.g. `content/docs/integration/index.mdx`).

For details, see the upstream docs: [OpenAPI UI docs](https://fumadocs.dev/docs/ui/openapi.mdx).
