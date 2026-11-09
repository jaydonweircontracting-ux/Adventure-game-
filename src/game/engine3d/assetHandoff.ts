// BUILD 1047 — Import Hub Stage 5: AI / development handoff. Pure
// module: no React, no WebGL, no DOM, no download. The view owns the
// download / share sheet / clipboard; this file owns WHAT is handed
// off and the words that describe it, so both can be asserted
// standalone.
//
// A handoff is a pack (assetPack.ts: the chosen models in their
// original formats + the manifest) PLUS a handoff-summary.txt file
// inside the same ZIP — a short, copyable text summary of exactly
// what is in it, so the player can paste it into a chat with
// ChatGPT or Muse and the AI knows what it is looking at.
//
// What the player picks (HandoffScope): individual assets (the
// checkboxes on the library rows), a whole category, or the whole
// library. The selection is resolved against the live library in
// library order, unknown ids dropped, duplicates dropped — so an
// export holds exactly the chosen assets and no others.
//
// What is honest, stated plainly (and the hub copy says the same):
// the game is a static page with no backend and no connected
// runtime, so there is no direct handoff — the export downloads to
// the device (on iPhone, it lands in Files) and the player uploads
// the ZIP in their ChatGPT or Muse chat. ChatGPT and Muse cannot
// see the files in the browser on their own. The game itself does
// not run an AI: the manifest + models are for an AI to read, name,
// categorise, or rework into a new pack. There is no "AI is
// processing" state anywhere here — no fake spinner, no fake chat,
// no fake progress bar.
//
// The share path is decided, not assumed: decideSharePath takes the
// device's real answer (navigator.canShare with a real File) and
// returns 'share' only when the device says it can share files —
// otherwise the view falls back to the download and says so. The
// copy path is the same shape: clipboard when the browser offers
// it, otherwise select-the-text so the player copies it by hand.
//
// What is NOT here: the download / share / clipboard calls (the
// view), the ZIP bytes (zipImport.ts), the pack assembly
// (assetPack.ts), FBX, audio, textures.

import { buildAssetPack, planPackFiles, ASSET_PACK_MANIFEST_VERSION, type AssetPackManifest } from './assetPack';
import { assetDimensions, assetTriangles } from './assetLibrary';
import type { CustomAsset } from './customAssets';
import { PACK_MANIFEST_NAME, type ZipArchiveEntry } from './zipImport';

/** The handoff ZIP's file name (the 1046 backup keeps its own
 *  ashfall-asset-pack.zip — a handoff is a different thing: a
 *  chosen subset plus the summary, meant to be shared). */
export const HANDOFF_ZIP_NAME = 'ashfall-asset-handoff.zip';

/** The summary text file inside every handoff ZIP — the same text
 *  the hub shows in the copy box, so the ZIP is self-describing
 *  even without the game. */
export const HANDOFF_SUMMARY_FILE = 'handoff-summary.txt';

/** How the player chose what to hand off. */
export type HandoffScope =
  | { kind: 'ids'; ids: string[] }
  | { kind: 'category'; category: string }
  | { kind: 'all' };

/** Resolve a scope against the live library, in library order.
 *  Unknown ids are dropped, duplicate ids kept once — an export
 *  holds exactly the chosen assets, never a stranger. */
export function selectHandoffAssets(library: CustomAsset[], scope: HandoffScope): CustomAsset[] {
  if (scope.kind === 'all') return [...library];
  if (scope.kind === 'category') {
    return library.filter((a) => (a.category ?? 'Unsorted') === scope.category);
  }
  const wanted = new Set(scope.ids);
  const seen = new Set<string>();
  const out: CustomAsset[] = [];
  for (const a of library) {
    if (wanted.has(a.id) && !seen.has(a.id)) {
      seen.add(a.id);
      out.push(a);
    }
  }
  return out;
}

/** The handoff summary: one line per model (name, format, category,
 *  tags, dimensions in tiles, triangle count, source filename, and
 *  the file name it takes inside the ZIP), plus the pack's build
 *  number and the manifest version, plus the plain-words limits.
 *  The file names come from planPackFiles — the same walk
 *  buildAssetPack uses — so the summary can never name a file the
 *  ZIP does not hold. */
export function buildHandoffSummary(assets: CustomAsset[], buildNumber: string): string {
  const lines: string[] = [];
  lines.push('Ashfall asset handoff — build ' + buildNumber + ', manifest version ' + ASSET_PACK_MANIFEST_VERSION + ', manifest file ' + PACK_MANIFEST_NAME);
  lines.push('Models: ' + assets.length);
  for (const { asset: a, file } of planPackFiles(assets)) {
    const d = assetDimensions(a);
    const tags = (a.tags ?? []).length > 0 ? (a.tags ?? []).join(', ') : 'no tags';
    lines.push(
      '- ' + a.name + ' (' + (a.format ?? 'glb').toUpperCase() + ') — ' + (a.category ?? 'Unsorted') +
      ' · tags: ' + tags +
      ' · ' + d.width + '×' + d.depth + ' tiles, ' + d.height + ' high' +
      ' · ' + assetTriangles(a) + ' triangles' +
      ' · from ' + (a.sourceFile ?? 'unknown file') +
      ' · in the ZIP as ' + file,
    );
  }
  lines.push('What this is: these models are for an AI (ChatGPT or Muse) to read, name, categorise, or rework into a new asset pack. The game itself does not run an AI.');
  lines.push('How to hand it over: download the handoff ZIP (it also holds ' + HANDOFF_SUMMARY_FILE + ', this same text), then upload the ZIP in your ChatGPT or Muse chat and paste this summary. ChatGPT and Muse cannot see the files in your browser on their own — nothing reaches them until you upload it.');
  return lines.join('\n');
}

/** A handoff: the pack (models + manifest, stamped with the build
 *  number) plus the summary file. The manifest is the same one
 *  buildAssetPack writes, so a handoff re-imports through the
 *  normal ZIP path exactly like a 1046 backup. */
export interface HandoffPack {
  entries: ZipArchiveEntry[];
  manifest: AssetPackManifest;
  summary: string;
}

export function buildHandoffPack(assets: CustomAsset[], buildNumber: string): HandoffPack {
  const pack = buildAssetPack(assets, buildNumber);
  const summary = buildHandoffSummary(assets, buildNumber);
  return {
    entries: [...pack.entries, { name: HANDOFF_SUMMARY_FILE, data: new TextEncoder().encode(summary) }],
    manifest: pack.manifest,
    summary,
  };
}

/** Which path the handoff takes, from the device's real answer.
 *  'share' only when the device says it can share files (the view
 *  asks navigator.canShare with a real File); anything else is the
 *  download — never a share button that silently does nothing. */
export type SharePath = 'share' | 'download';

export function decideSharePath(canShareFiles: boolean): SharePath {
  return canShareFiles ? 'share' : 'download';
}

/** Which copy path the summary takes, from the browser's real
 *  answer. 'clipboard' only when navigator.clipboard.writeText
 *  exists; otherwise the view selects the summary text so the
 *  player copies it by hand. */
export type CopyPath = 'clipboard' | 'select-text';

export function decideCopyPath(hasClipboard: boolean): CopyPath {
  return hasClipboard ? 'clipboard' : 'select-text';
}

/** The hub's how-to copy for the handoff section. The view renders
 *  these strings (never a paraphrase), so the asserts can prove the
 *  plain-words limit is on screen. */
export const HANDOFF_HOWTO =
  'Pick the models to hand over — tick them in the library below, or hand over a whole category or the whole library. ' +
  'The export is a ZIP with the models (in their original formats), the pack manifest, and a short summary text. ' +
  'Download it to this device (on iPhone, it lands in Files), then upload the ZIP in your ChatGPT or Muse chat and paste the summary so the AI knows exactly what it is looking at.';

export const HANDOFF_LIMIT =
  'ChatGPT and Muse cannot see the files in your browser on their own — nothing reaches them until you upload the ZIP yourself. ' +
  'The game itself does not run an AI: the files are for an AI to read, name, categorise, or rework into a new pack. ' +
  'No AI is processing anything here, and nothing is uploaded anywhere by the game.';
