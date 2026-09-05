# Adventure Game publishing instructions

## Source versus live site

GitHub Pages currently serves the `main` branch `/docs` directory at:

https://jaydonweircontracting-ux.github.io/Adventure-game-/

A change under `src/` is not live until the built browser output is refreshed under `docs/`. Do not claim an update is live from a source-only commit.

## Required publishing sequence

1. Use Node 20 (the version in `.nvmrc`).
2. Run the production build with the repository base path `/Adventure-game-/` using `npm run build`.
3. Replace the published `docs/` contents with the generated `dist/public/` contents, including the generated JS, CSS, and assets.
4. Keep the build label in `src/App.tsx` and the cache-busting version in `docs/index.html` aligned.
5. Push the source and refreshed `docs/` output together.
6. Check the GitHub Pages deployment status and open the live URL with the current cache version before reporting success.

## Important

Do not patch only `src/` and send the Pages URL. The Pages URL will continue serving the previous `docs/` bundle until the generated output is published.
