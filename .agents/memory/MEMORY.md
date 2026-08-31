# Project Memory

## Deployment target

- Repository: jaydonweircontracting-ux/Adventure-game-
- Source of truth: the GitHub main branch.
- Make routine game updates in GitHub; do not mount or import the game into a Replit project for routine updates.
- Production deployment: GitHub Pages publishes the committed `docs/` directory.

## GitHub Pages rules

- The green `pages build and deployment` check is GitHub's Jekyll publish of the committed `docs/` snapshot; it is not proof that Vite built the source.
- Do not add or repair the duplicate `.github/workflows/publish-pages.yml` workflow for this project.
- If that duplicate workflow appears and fails, remove it instead of changing `index.html` or package scripts.
- Keep GitHub Pages asset paths under the repository base path `/Adventure-game-/`.
- Keep source and committed `docs/` output synchronized when publishing a source update.
- Every package imported by src/ must be declared in package.json; browser/runtime imports belong in dependencies.
- Do not add Replit workspace catalog dependency markers to package.json.
- Keep the browser build free of Replit-only plugins or required local-only environment variables.

The successful deployment required declaring @tanstack/react-query and wouter as runtime dependencies.


## Mounted horse rendering guardrail

- The down-facing horse head overlay in `src/index.css` must use the same `horse-walk` animation as the horse body while mounted so both sprite layers stay synchronized.


## Published Pages sync guardrail

- Source changes do not affect the live GitHub Pages site until the bundle referenced by `docs/index.html` is synchronized.
- Before diagnosing a live visual bug, read `docs/index.html` and inspect the referenced `docs/assets` JS/CSS files; do not assume `src/` is what Pages is serving.


## Mounted rider/cow layer guardrail

- Keep the mounted visual stack explicit: cow body below the player head, cow head overlay above the player head. Apply it for every facing direction and synchronize the active bundle referenced by `docs/index.html`.
