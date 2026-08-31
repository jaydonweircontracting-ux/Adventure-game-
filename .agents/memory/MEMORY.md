# Project Memory

## Deployment target

- Repository: jaydonweircontracting-ux/Adventure-game-
- Source of truth: the GitHub main branch.
- Make routine game updates in GitHub so Netlify can deploy them directly; do not mount or import the game into a Replit project for routine updates.
- Production deployment: Netlify builds directly from GitHub.

## Netlify-compatible rules

- Keep the build command as npm run build.
- Keep the publish directory as dist/public.
- Keep Node 20 configured in netlify.toml.
- Keep the SPA fallback redirect from /* to /index.html.
- Every package imported by src/ must be declared in package.json; browser/runtime imports belong in dependencies.
- Do not add Replit workspace catalog dependency markers to package.json.
- Keep Vite able to build without Replit-only plugins or required local-only environment variables.
- Before pushing changes, audit source imports against package.json and check the Netlify build/publish configuration.

The successful deployment required declaring @tanstack/react-query and wouter as runtime dependencies.
