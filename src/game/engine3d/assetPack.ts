// BUILD 1046 — Import Hub Stage 4: packs / recovery. Pure module:
// no React, no WebGL, no DOM, no file download. The view owns the
// download (a Blob + an <a> click); this file owns what goes INTO
// the pack and the manifest that describes it, so both can be
// asserted standalone.
//
// A pack is a ZIP (written by writeZipArchive in zipImport.ts)
// holding every library asset in its ORIGINAL format — a .glb
// comes back as a .glb, a .gltf as a .gltf plus its .bin, an .obj
// as an .obj — plus one manifest, ashfall-asset-pack.json, listing
// each model's name, format, category, tags, dimensions, triangle
// count, source file, and pack file name. The models are re-encoded
// from the geometry the game holds (customAssets.ts encoders), not
// the original uploaded bytes: the game never kept those bytes,
// only the triangles. A pack re-imports through the normal ZIP
// path — it is a backup of the models, not of their placements
// (placements live in the world save), and re-importing a pack
// creates new asset ids, so it exercises the overwrite
// confirmation when a name already exists.
//
// What is NOT here: the download itself (view), the ZIP bytes
// (zipImport.ts), textures (never held), placements.
//
// BUILD 1047: the handoff (assetHandoff.ts) builds on this —
// planPackFiles is shared so the handoff summary names exactly the
// files this pack writes, and buildAssetPack takes an optional build
// number the handoff stamps on the manifest. The plain backup path
// passes no build and its output is unchanged.

import { encodeGlbAsset, encodeGltfAsset, encodeObjAsset, type CustomAsset } from './customAssets';
import { PACK_MANIFEST_NAME, type ZipArchiveEntry } from './zipImport';

/** One row of the pack manifest: everything a future import (or
 *  a human reading the file) needs to know about a model, without
 *  opening the model itself. */
export interface AssetPackEntry {
  id: string;
  name: string;
  format: 'glb' | 'gltf' | 'obj';
  category: string;
  tags: string[];
  /** Footprint width in tiles. */
  width: number;
  /** Footprint depth in tiles. */
  height: number;
  triangles: number;
  sourceFile: string;
  /** The entry's file name inside the pack ZIP. */
  file: string;
}

export interface AssetPackManifest {
  version: 1;
  /** The game build that exported the pack (e.g. '1047'), when the
   *  exporter stamped one — BUILD 1047's handoff does. Older packs
   *  have no build field. */
  build?: string;
  exportedAt: string;
  assets: AssetPackEntry[];
}

/** The manifest version, as a runtime constant for the handoff
 *  summary (which names it) — it must stay in step with the
 *  `version: 1` type above. */
export const ASSET_PACK_MANIFEST_VERSION = 1;

/** One model file inside a pack: the asset, its sanitized stem,
 *  and the file name it takes in the ZIP. Shared by buildAssetPack
 *  and the handoff summary (assetHandoff.ts), so the summary can
 *  never name a different file than the ZIP actually holds. */
export interface PlannedPackFile {
  asset: CustomAsset;
  stem: string;
  file: string;
}

export function planPackFiles(assets: CustomAsset[]): PlannedPackFile[] {
  const taken = new Set<string>();
  return assets.map((a) => {
    const format = a.format ?? 'glb';
    const stem = packFileStem(a, taken);
    return { asset: a, stem, file: format === 'gltf' ? stem + '.gltf' : format === 'obj' ? stem + '.obj' : stem + '.glb' };
  });
}

/** The file name an asset takes inside a pack. Sanitized to
 *  plain file-name characters (anything else becomes '-'), capped
 *  at 40 characters, uniquified within the pack so two assets
 *  called the same thing never collide. A .gltf takes two entries
 *  (the .gltf and its .bin share the stem). */
export function packFileStem(asset: CustomAsset, taken: Set<string>): string {
  let stem = (asset.name || 'model').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 40);
  if (stem.length === 0) stem = 'model';
  let out = stem;
  let n = 2;
  while (taken.has(out)) {
    out = stem.slice(0, 36) + '-' + n;
    n++;
  }
  taken.add(out);
  return out;
}

/** Build a pack from library assets: the ZIP entries (models in
 *  their original formats + the manifest) and the manifest
 *  itself. Empty library → an empty model list and a manifest
 *  that says so; the view refuses to export that (nothing to
 *  back up). */
export function buildAssetPack(assets: CustomAsset[], build?: string): { entries: ZipArchiveEntry[]; manifest: AssetPackManifest } {
  const entries: ZipArchiveEntry[] = [];
  const manifestAssets: AssetPackEntry[] = [];
  for (const { asset: a, stem, file } of planPackFiles(assets)) {
    const format = a.format ?? 'glb';
    const triangles = Math.floor(a.indices.length / 3);
    if (format === 'gltf') {
      const binName = stem + '.bin';
      const encoded = encodeGltfAsset(a, binName);
      entries.push({ name: stem + '.gltf', data: new TextEncoder().encode(encoded.json) });
      entries.push({ name: binName, data: encoded.bin });
      manifestAssets.push({
        id: a.id, name: a.name, format, category: a.category ?? 'Unsorted', tags: [...(a.tags ?? [])],
        width: a.width, height: a.height, triangles, sourceFile: a.sourceFile ?? '', file,
      });
    } else if (format === 'obj') {
      entries.push({ name: stem + '.obj', data: new TextEncoder().encode(encodeObjAsset(a)) });
      manifestAssets.push({
        id: a.id, name: a.name, format, category: a.category ?? 'Unsorted', tags: [...(a.tags ?? [])],
        width: a.width, height: a.height, triangles, sourceFile: a.sourceFile ?? '', file,
      });
    } else {
      entries.push({ name: stem + '.glb', data: encodeGlbAsset(a) });
      manifestAssets.push({
        id: a.id, name: a.name, format, category: a.category ?? 'Unsorted', tags: [...(a.tags ?? [])],
        width: a.width, height: a.height, triangles, sourceFile: a.sourceFile ?? '', file,
      });
    }
  }
  const manifest: AssetPackManifest = { version: ASSET_PACK_MANIFEST_VERSION, ...(build ? { build } : {}), exportedAt: new Date().toISOString(), assets: manifestAssets };
  entries.push({ name: PACK_MANIFEST_NAME, data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
  return { entries, manifest };
}

/** Validate a manifest read back from a pack (the shape the
 *  reader in zipImport.ts checks loosely). Returns null when it
 *  is not an Ashfall pack manifest at all. */
export function parsePackManifest(raw: unknown): AssetPackManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.version !== 1 || !Array.isArray(m.assets)) return null;
  const assets: AssetPackEntry[] = [];
  for (const r of m.assets as unknown[]) {
    if (!r || typeof r !== 'object') return null;
    const a = r as Record<string, unknown>;
    if (typeof a.name !== 'string' || typeof a.file !== 'string') return null;
    if (a.format !== 'glb' && a.format !== 'gltf' && a.format !== 'obj') return null;
    assets.push({
      id: typeof a.id === 'string' ? a.id : '',
      name: a.name,
      format: a.format,
      category: typeof a.category === 'string' ? a.category : 'Unsorted',
      tags: Array.isArray(a.tags) ? (a.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [],
      width: typeof a.width === 'number' ? a.width : 0,
      height: typeof a.height === 'number' ? a.height : 0,
      triangles: typeof a.triangles === 'number' ? a.triangles : 0,
      sourceFile: typeof a.sourceFile === 'string' ? a.sourceFile : '',
      file: a.file,
    });
  }
  return {
    version: ASSET_PACK_MANIFEST_VERSION,
    ...(typeof m.build === 'string' ? { build: m.build } : {}),
    exportedAt: typeof m.exportedAt === 'string' ? m.exportedAt : '',
    assets,
  };
}
