// BUILD 1044 — Import Hub Stage 2: the IndexedDB asset store.
// The 997/1043 library kept whole model vertex arrays in localStorage
// under ag-3d-custom-assets-v1, which capped one file at 1 MB and the
// whole library at 2 MB of JSON. That store is now the LEGACY store:
// it is read (for a one-time migration, and as a session fallback when
// IndexedDB is unavailable) and never written again — no vertex array
// ever goes back into localStorage.
//
// What this module owns, stated plainly:
// - The IndexedDB database (`ashfall-custom-assets`, version 1, one
//   object store `assets` keyed by the asset's stable id). Geometry
//   lives here as structured-cloned arrays; the database is the
//   source of truth for the library.
// - A compact, versioned manifest in localStorage
//   (`ag-3d-custom-assets-manifest-v1`): id, name, format, triangle
//   count and decoded byte size per asset — metadata only, never
//   vertex arrays. It is a cache for the "Loading your N models…"
//   label and a recovery aid; the view never renders from it.
// - The one-time, idempotent legacy migration: legacy assets are
//   written to IndexedDB, then READ BACK and checked (every legacy
//   id present, same triangle count) before the caller is allowed to
//   delete the legacy key. A failed write keeps the legacy asset in
//   the old store and in the session library, with a visible warning.
//   Re-running the migration skips ids already in the store.
// - The size ceilings, measured against decoded memory: one asset's
//   decoded cost is its JS number arrays (8 bytes per number, packed
//   doubles) plus the renderer's Float32/Uint32 copy (4 bytes per
//   number) — 12 bytes per number. A max-size asset (20,000 tris,
//   the unchanged 997 cap) decodes to ~5 MB, so a 5 MB file cap is
//   device-safe: the triangle cap, not the file bytes, is the binding
//   constraint. The library budgets (50 MB decoded, 100,000 tris)
//   cap the whole library at ~10 max-size assets.
// - Serialised writes: every store operation runs through one
//   promise chain, so rapid consecutive uploads/deletes cannot race
//   and a stale async write can never overwrite a newer library
//   change. The in-memory library in the view is updated only after
//   its IndexedDB write succeeds — a failed write is never shown as
//   a success.
// - Failure honesty: quota, blocked and unavailable-database errors
//   are surfaced as plain messages (describeStoreError), never
//   swallowed. If IndexedDB cannot be opened at all, the world still
//   boots: the view falls back to the legacy library for the session
//   and says so in the hub.
//
// What is NOT here: the parsers (customAssets.ts), the ZIP reader
// (zipImport.ts), the render path (Engine3DWorldView.tsx reads the
// in-memory cache exactly as before — the store only fills that
// cache). No textures, audio, FBX, or GitHub storage.

import { validAsset, type CustomAsset } from './customAssets';

/** IndexedDB database name for uploaded custom assets. */
export const ASSET_DB_NAME = 'ashfall-custom-assets';
/** Database version. Bump only with an onupgradeneeded migration. */
export const ASSET_DB_VERSION = 1;
/** The one object store, keyed by the asset's stable id. */
export const ASSET_STORE_NAME = 'assets';

/** Compact versioned manifest key (localStorage). Metadata only —
 *  never vertex arrays. */
export const ASSET_MANIFEST_KEY = 'ag-3d-custom-assets-manifest-v1';

/** One uploaded file, at most 5 MB (was 1 MB under localStorage).
 *  Measured, not guessed: a max-size asset (20,000 tris) decodes to
 *  ~5 MB in memory, so a 5 MB file cannot blow the device budget —
 *  the triangle cap binds first. */
export const MAX_ASSET_FILE_BYTES = 5_000_000;
/** The whole library's decoded memory, at most 50 MB (~10 max-size
 *  assets, or dozens of typical small ones). */
export const MAX_LIBRARY_DECODED_BYTES = 50_000_000;
/** The whole library's triangles, at most 100,000. */
export const MAX_LIBRARY_TRIANGLES = 100_000;

/** Decoded in-memory cost of one asset, in bytes: its JS number
 *  arrays (8 bytes per number) plus the renderer's Float32/Uint32
 *  copy (4 bytes per number). */
export function decodedAssetBytes(a: CustomAsset): number {
  return (a.positions.length + a.colors.length + a.indices.length) * 12;
}

/** Triangle count of one asset. */
export function assetTriangles(a: CustomAsset): number {
  return Math.floor(a.indices.length / 3);
}

/** Library-budget verdict for adding `candidates` to `existing`.
 *  Pure: the view calls it before persisting anything, so an
 *  over-budget upload is rejected with a message naming the budget
 *  and the numbers, never stored and never shown as added. */
export function checkLibraryBudgets(
  existing: CustomAsset[],
  candidates: CustomAsset[],
): { ok: true } | { ok: false; reason: string } {
  let bytes = 0;
  let tris = 0;
  for (const a of existing) {
    bytes += decodedAssetBytes(a);
    tris += assetTriangles(a);
  }
  for (const c of candidates) {
    bytes += decodedAssetBytes(c);
    tris += assetTriangles(c);
    if (tris > MAX_LIBRARY_TRIANGLES) {
      return { ok: false, reason: 'library triangle budget exceeded (' + tris.toLocaleString() + ' > ' + MAX_LIBRARY_TRIANGLES.toLocaleString() + ' triangles) — delete an old model first' };
    }
    if (bytes > MAX_LIBRARY_DECODED_BYTES) {
      return { ok: false, reason: 'library size budget exceeded (' + (bytes / 1_000_000).toFixed(1) + ' MB decoded > ' + (MAX_LIBRARY_DECODED_BYTES / 1_000_000) + ' MB) — delete an old model first' };
    }
  }
  return { ok: true };
}

// ---- Store backend (the seam the tests use) ----

/** The only three operations the store needs from a backend. The
 *  real one wraps IndexedDB; the tests use an in-memory Map behind
 *  the same interface, so migration, validation, quota and race
 *  behaviour are all proven without a browser. */
export interface AssetStoreBackend {
  getAll(): Promise<unknown[]>;
  put(asset: CustomAsset): Promise<void>;
  delete(id: string): Promise<void>;
}

/** In-memory backend for tests (and for the pure-logic asserts).
 *  `raw` is exposed so a test can plant a corrupt record, or swap
 *  in a throwing put to simulate a quota failure. */
export function createMemoryAssetStoreBackend(): AssetStoreBackend & {
  raw: Map<string, unknown>;
  failNextPutWith: Error | null;
} {
  const raw = new Map<string, unknown>();
  const backend: AssetStoreBackend & { raw: Map<string, unknown>; failNextPutWith: Error | null } = {
    raw,
    failNextPutWith: null,
    async getAll() {
      return [...raw.values()];
    },
    async put(asset: CustomAsset) {
      if (backend.failNextPutWith) {
        const err = backend.failNextPutWith;
        backend.failNextPutWith = null;
        throw err;
      }
      raw.set(asset.id, asset);
    },
    async delete(id: string) {
      raw.delete(id);
    },
  };
  return backend;
}

// ---- Real IndexedDB backend ----

/** Open (and create, on first run) the asset database. Rejects when
 *  IndexedDB does not exist or cannot be opened — the caller treats
 *  that as "store unavailable", never as a fatal boot error. */
function openAssetDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser'));
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(ASSET_DB_NAME, ASSET_DB_VERSION);
    } catch (e) {
      reject(e instanceof Error ? e : new Error('could not open the asset database'));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ASSET_STORE_NAME)) {
        db.createObjectStore(ASSET_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('could not open the asset database'));
    req.onblocked = () => reject(new Error('the asset database is blocked by another tab — close other tabs showing the game and reload'));
  });
}

function runDbRequest<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(ASSET_STORE_NAME, mode);
    } catch (e) {
      reject(e instanceof Error ? e : new Error('could not start a database transaction'));
      return;
    }
    const store = tx.objectStore(ASSET_STORE_NAME);
    let req: IDBRequest<T>;
    try {
      req = fn(store);
    } catch (e) {
      reject(e instanceof Error ? e : new Error('could not run the database request'));
      return;
    }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('database request failed'));
    tx.onerror = () => reject(tx.error ?? new Error('database transaction failed'));
  });
}

/** The real backend: one IndexedDB database, one object store.
 *  The connection is opened lazily once and reused. */
export function createIndexedDbAssetBackend(): AssetStoreBackend {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    if (!dbPromise) dbPromise = openAssetDb();
    return dbPromise;
  };
  return {
    async getAll() {
      const d = await db();
      return runDbRequest(d, 'readonly', (s) => s.getAll());
    },
    async put(asset: CustomAsset) {
      const d = await db();
      await runDbRequest(d, 'readwrite', (s) => s.put(asset));
    },
    async delete(id: string) {
      const d = await db();
      await runDbRequest(d, 'readwrite', (s) => s.delete(id));
    },
  };
}

// ---- The store (serialised operations + migration) ----

export interface MigrationResult {
  /** Ids newly written to IndexedDB by this run. */
  migrated: string[];
  /** Legacy ids already present in the store (a re-run skips them). */
  alreadyPresent: string[];
  /** Legacy ids whose write failed — the legacy key MUST be kept. */
  failed: Array<{ id: string; reason: string }>;
  /** True only when every legacy id is present in the store with
   *  the same triangle count after the write (read-back check). */
  verified: boolean;
}

export interface AssetStore {
  /** Load every valid asset. A corrupt record is dropped, never
   *  fatal — a damaged store degrades to the surviving library. */
  loadAll(): Promise<CustomAsset[]>;
  put(asset: CustomAsset): Promise<void>;
  remove(id: string): Promise<void>;
  /** Migrate legacy localStorage assets once, idempotently. The
   *  caller deletes the legacy key ONLY when verified is true and
   *  failed is empty. */
  migrate(legacy: CustomAsset[]): Promise<MigrationResult>;
  /** Run `op` inside the store's serial queue (the view uses this
   *  for the whole persist-then-commit section, so two rapid
   *  uploads cannot interleave and lose each other's assets).
   *  The queue is NON-REENTRANT: do not call other store methods
   *  from inside `op` (they would chain onto the section that is
   *  waiting for them and deadlock). The store's own methods never
   *  nest — they call the backend directly inside their section. */
  runExclusive<T>(op: () => Promise<T>): Promise<T>;
}

/** Build a store over a backend. All operations are serialised
 *  through one promise chain: a later operation never overtakes an
 *  earlier one, and a failure in one operation never blocks the
 *  queue — the chain always settles so the next operation runs. */
export function createAssetStore(backend: AssetStoreBackend): AssetStore {
  let chain: Promise<void> = Promise.resolve();
  const runExclusive = <T>(op: () => Promise<T>): Promise<T> => {
    const p = chain.then(op);
    chain = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  };

  const loadAllRaw = async (): Promise<CustomAsset[]> => {
    const records = await backend.getAll();
    const out: CustomAsset[] = [];
    for (const r of records) {
      const v = validAsset(r);
      if (v) out.push(v);
    }
    return out;
  };

  return {
    loadAll() {
      return runExclusive(loadAllRaw);
    },
    put(asset: CustomAsset) {
      return runExclusive(() => backend.put(asset));
    },
    remove(id: string) {
      return runExclusive(() => backend.delete(id));
    },
    migrate(legacy: CustomAsset[]) {
      return runExclusive(async (): Promise<MigrationResult> => {
        const result: MigrationResult = { migrated: [], alreadyPresent: [], failed: [], verified: false };
        if (legacy.length === 0) {
          result.verified = true;
          return result;
        }
        const existing = await loadAllRaw();
        const have = new Set(existing.map((a) => a.id));
        for (const asset of legacy) {
          if (have.has(asset.id)) {
            result.alreadyPresent.push(asset.id);
            continue;
          }
          try {
            await backend.put(asset);
            result.migrated.push(asset.id);
            have.add(asset.id);
          } catch (e) {
            result.failed.push({ id: asset.id, reason: e instanceof Error ? e.message : 'write failed' });
          }
        }
        // Read-back validation: every legacy id must be present with
        // the same triangle count. Only then may the caller delete
        // the legacy key.
        const after = await loadAllRaw();
        const byId = new Map(after.map((a) => [a.id, a]));
        result.verified = legacy.every((l) => {
          const a = byId.get(l.id);
          return a !== undefined && a.indices.length === l.indices.length;
        });
        return result;
      });
    },
    runExclusive,
  };
}

// ---- Manifest (compact, versioned, metadata only) ----

export interface AssetManifestEntry {
  id: string;
  name: string;
  format: 'glb' | 'gltf' | 'obj';
  triangles: number;
  /** Decoded in-memory bytes (see decodedAssetBytes). */
  bytes: number;
}

export interface AssetManifest {
  version: 1;
  assets: AssetManifestEntry[];
}

export function buildManifest(assets: CustomAsset[]): AssetManifest {
  return {
    version: 1,
    assets: assets.map((a) => ({
      id: a.id,
      name: a.name,
      format: a.format ?? 'glb',
      triangles: assetTriangles(a),
      bytes: decodedAssetBytes(a),
    })),
  };
}

/** Persist the manifest. Best-effort: it is a cache, not the store
 *  — a failure here never fails an upload. */
export function writeAssetManifest(assets: CustomAsset[]): void {
  try {
    localStorage.setItem(ASSET_MANIFEST_KEY, JSON.stringify(buildManifest(assets)));
  } catch {
    /* ignore — the manifest is a cache, IndexedDB is the store */
  }
}

/** Read the manifest, or null when it is missing, unversioned, or
 *  malformed. Used only for the loading label; never for rendering. */
export function readAssetManifest(): AssetManifest | null {
  try {
    const raw = localStorage.getItem(ASSET_MANIFEST_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    if (p.version !== 1 || !Array.isArray(p.assets)) return null;
    const entries: AssetManifestEntry[] = [];
    for (const e of p.assets as unknown[]) {
      if (!e || typeof e !== 'object') return null;
      const r = e as Record<string, unknown>;
      if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
      if (typeof r.triangles !== 'number' || typeof r.bytes !== 'number') return null;
      const fmt = r.format === 'gltf' || r.format === 'obj' ? r.format : 'glb';
      entries.push({ id: r.id, name: r.name, format: fmt, triangles: r.triangles, bytes: r.bytes });
    }
    return { version: 1, assets: entries };
  } catch {
    return null;
  }
}

// ---- Error wording (visible in the Build UI, never swallowed) ----

export function isQuotaError(e: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'QuotaExceededError') ||
    (e instanceof Error && e.name === 'QuotaExceededError')
  );
}

/** A plain-words explanation of a store failure for the hub. */
export function describeStoreError(e: unknown): string {
  if (isQuotaError(e)) {
    return 'this device is out of storage space for models — delete an old model or free space on this device, then try again';
  }
  if (e instanceof Error && e.message) return e.message;
  return 'the model store could not be reached';
}
