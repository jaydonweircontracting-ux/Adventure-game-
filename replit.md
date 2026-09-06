# Adventure Game publishing instructions

## User's default workflow

The user wants targeted updates made directly against GitHub and does not want the game mounted, previewed, run, or rebuilt unless they explicitly request it. Treat credit usage as a constraint: inspect only the latest commit and files needed for the requested fix, make the smallest targeted edits, and avoid broad regeneration of the app or assets.

## Source versus live site

GitHub Pages serves the main branch /docs directory at:

https://jaydonweircontracting-ux.github.io/Adventure-game-/

A change under src/ is not live until the corresponding published browser output under docs/ is updated. Never claim an update is live from a source-only commit.

## Required targeted publishing sequence

1. Inspect the latest commit on main before editing.
2. Update only the source files required for the requested fix.
3. Update the already-published docs bundle with the same narrow fix; do not run a production build by default.
4. Keep the build label in src/App.tsx, the visible label embedded in the published JS, and the cache-busting version in docs/index.html aligned. Increment the build label for each published fix.
5. Push source and published output to GitHub, using serialized file updates to avoid branch conflicts.
6. Verify the changed files and latest commit through the GitHub API, then provide the Pages URL. Do not mount, preview, run, or build the game unless the user asks for that specifically.

## Full rebuild exception

If a future request explicitly asks for a production rebuild, use the repository's Node 20 setup, build with base path /Adventure-game-/, and publish the generated output to docs/. Otherwise, prefer a focused source-and-bundle patch to save credits and preserve the user's existing published assets.

## Important

Do not patch only src/ and send the Pages URL. The Pages URL continues serving the previous docs/ bundle until the published output is updated.
