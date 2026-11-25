// buildPanel3d.ts — the Build panel (BUILD 1107 extraction).
// The Build menu panel, extracted verbatim from Engine3DWorldView.tsx
// (0x2A, same as the 0x0D area extractions): the panel JSX, the Import
// Hub section inside it, and the panel-owned types (ImportReport,
// OverwritePrompt, CatalogCategory) live here now. The view passes its
// panel state, setters, refs and handlers in as props; the JSX itself
// is unchanged, so the panel renders exactly as before.
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { doorsFacePaths, treesOffPaths, lanternsAlongRoads, fencesAroundProperty, alignArea, enhanceArea, adjustSpacing } from './layoutHelpers';
import { isHouseKind, rotateFace, type PaletteKind, type Rotation } from './placements';
import { captureChunk, uniquifyName, type ChunkTemplate } from './templates';
import { selectionCount, selectionCounts, excludeItem, selectionItems, selectionItemLabel, type AreaSelection } from './areaSelect';
import { type CustomAsset, type GltfDependency } from './customAssets';
import { readAssetManifest } from './assetStore';
import { HANDOFF_HOWTO, HANDOFF_LIMIT, type HandoffScope } from './assetHandoff';
import { ASSET_CATEGORIES, parseTags, assetRow, filterAssets, sortAssets, importProgressPercent, importProgressLabel, canPreviewAsset, type ImportProgress, type LibrarySort, type OverwriteChoice } from './assetLibrary';
import { BUILDING_CATALOGUE, CATALOGUE_CATEGORIES, catalogueMenuEntryFor } from './buildingCatalogue';
import { classifySwipe } from './swipe';
import { AssetPreviewCanvas } from './hudInterface3d';
import { type BuildingInteractions } from './buildingInteractions3d';
import { type IsoWorld } from '../iso/isoWorld';

// BUILD 1046: the last import's report — exactly which models landed,
// which entries were skipped and why, which failed, and notes (a missing
// texture, a pack manifest, a .bin found in a subfolder). Shown in the
// hub until dismissed; the message bar keeps only the one-line summary.
export interface ImportReport {
  source: string;
  added: string[];
  skipped: Array<{ name: string; reason: string }>;
  failed: string[];
  notes: string[];
}

// BUILD 1046: one overwrite-prompt row — a pending model whose name
// already exists in the library, the asset it would collide with, and
// how many placed copies that asset has (Replace removes them).
// choices is the player's per-row answer so far; a row with no
// answer defaults to Keep both.
export interface OverwritePrompt {
  pending: CustomAsset[];
  collisions: Array<{ pendingId: string; pendingName: string; existingId: string; existingName: string; placedCount: number }>;
  choices: Record<string, OverwriteChoice>;
}

export type CatalogCategory = 'all' | 'buildings' | 'houses' | 'shops' | 'decorations' | 'roads' | 'nature' | 'infrastructure' | 'custom' | 'stations';

export type SaveSelection = { x0: number; y0: number; x1: number; y1: number; count: number } | null;

export interface BuildPanelProps {
  buildOpen: boolean;
  palette: PaletteKind | null;
  customSelection: string | null;
  removeMode: boolean;
  moveMode: boolean;
  saveAreaMode: boolean;
  pasteName: string | null;
  areaSelectMode: boolean;
  areaSelection: AreaSelection | null;
  areaMoveArmed: boolean;
  areaDuplicateArmed: boolean;
  areaDeleteArmed: boolean;
  catalogCategory: CatalogCategory;
  customAssets: CustomAsset[];
  customAssetsLoading: boolean;
  customAssetsWarning: string | null;
  assetsSaving: boolean;
  saveAssets: () => void;
  importHubOpen: boolean;
  importProgress: ImportProgress | null;
  importReport: ImportReport | null;
  pendingImports: CustomAsset[];
  overwritePrompt: OverwritePrompt | null;
  renamingId: string | null;
  renameDraft: string;
  librarySearch: string;
  librarySort: LibrarySort;
  libraryCategoryFilter: string;
  libraryFormatFilter: string;
  handoffChecked: string[];
  templates: ChunkTemplate[];
  placedCount: number;
  placementRot: Rotation;
  saveSelection: SaveSelection;
  chunkName: string;
  buildIx: BuildingInteractions;
  catalogSections: Array<{ id: Exclude<CatalogCategory, 'all'>; label: string; kinds: PaletteKind[] }>;
  kindMeta: Record<PaletteKind, { label: string; swatch: string }>;
  setBuildOpen: Dispatch<SetStateAction<boolean>>;
  setPalette: Dispatch<SetStateAction<PaletteKind | null>>;
  setCustomSelection: Dispatch<SetStateAction<string | null>>;
  setRemoveMode: Dispatch<SetStateAction<boolean>>;
  setMoveMode: Dispatch<SetStateAction<boolean>>;
  setSaveAreaMode: Dispatch<SetStateAction<boolean>>;
  setPasteName: Dispatch<SetStateAction<string | null>>;
  setAreaSelectMode: Dispatch<SetStateAction<boolean>>;
  setAreaSelection: Dispatch<SetStateAction<AreaSelection | null>>;
  setAreaMoveArmed: Dispatch<SetStateAction<boolean>>;
  setAreaDuplicateArmed: Dispatch<SetStateAction<boolean>>;
  setAreaDeleteArmed: Dispatch<SetStateAction<boolean>>;
  setCatalogCategory: Dispatch<SetStateAction<CatalogCategory>>;
  setImportHubOpen: Dispatch<SetStateAction<boolean>>;
  setReport: (r: ImportReport | null) => void;
  setPending: (next: CustomAsset[]) => void;
  setOverwrite: (o: OverwritePrompt | null) => void;
  setRenameDraft: Dispatch<SetStateAction<string>>;
  setRenamingId: Dispatch<SetStateAction<string | null>>;
  setLibrarySearch: Dispatch<SetStateAction<string>>;
  setLibrarySort: Dispatch<SetStateAction<LibrarySort>>;
  setLibraryCategoryFilter: Dispatch<SetStateAction<string>>;
  setLibraryFormatFilter: Dispatch<SetStateAction<string>>;
  setChunkName: Dispatch<SetStateAction<string>>;
  setSaveSelection: Dispatch<SetStateAction<SaveSelection>>;
  setTemplates: Dispatch<SetStateAction<ChunkTemplate[]>>;
  setMessage: Dispatch<SetStateAction<string>>;
  setPlacementRotBoth: (r: Rotation) => void;
  setHandoffCheckedBoth: (ids: string[]) => void;
  setLibraryAssetCategory: (asset: CustomAsset, category: string) => void;
  setLibraryAssetTags: (asset: CustomAsset, input: string) => void;
  panelSwipeRef: MutableRefObject<{ id: number; x: number; y: number; fired: boolean } | null>;
  buildRef: MutableRefObject<{ palette: PaletteKind | null; removeMode: boolean; moveMode: boolean; saveAreaMode: boolean; pasteName: string | null; customAssetId: string | null; areaSelectMode: boolean; areaMoveArmed: boolean; areaDuplicateArmed: boolean }>;
  placePreviewRef: MutableRefObject<HTMLDivElement | null>;
  placeHoverRef: MutableRefObject<{ x: number; y: number } | null>;
  placePreviewFnRef: MutableRefObject<((x: number, y: number) => void) | null>;
  areaSelectPreviewRef: MutableRefObject<HTMLDivElement | null>;
  areaSelectPreviewLabelRef: MutableRefObject<HTMLSpanElement | null>;
  pendingImportsRef: MutableRefObject<CustomAsset[]>;
  pendingDepsRef: MutableRefObject<Map<string, GltfDependency[]>>;
  overwritePromptRef: MutableRefObject<OverwritePrompt | null>;
  handoffCheckedRef: MutableRefObject<string[]>;
  handoffSummaryRef: MutableRefObject<HTMLTextAreaElement | null>;
  customAssetsRef: MutableRefObject<CustomAsset[]>;
  stateRef: MutableRefObject<{ world: IsoWorld }>;
  handleImportFiles: (e: { target: { files: FileList | null; value: string } }) => void;
  commitPendingAssets: (toCommit: CustomAsset[], resolutions?: Map<string, OverwriteChoice>) => void;
  discardPendingAsset: (id: string) => void;
  updatePendingAsset: (id: string, patch: Partial<CustomAsset>) => void;
  exportAssetPack: () => void;
  exportHandoff: (scope: HandoffScope) => void;
  copyHandoffSummary: () => void;
  shareHandoff: () => void;
  handoffSummaryFor: (scope: HandoffScope) => string;
  armCustomAsset: (id: string | null) => void;
  deleteCustomAsset: (asset: CustomAsset) => void;
  renameLibraryAsset: (asset: CustomAsset, newName: string) => void;
  resolveOverwritePrompt: () => void;
}

export function BuildPanel(props: BuildPanelProps) {
  const { buildOpen, palette, customSelection, removeMode, moveMode, saveAreaMode, pasteName, areaSelectMode, areaSelection, areaMoveArmed, areaDuplicateArmed, areaDeleteArmed, catalogCategory, customAssets, customAssetsLoading, customAssetsWarning, assetsSaving, saveAssets, importHubOpen, importProgress, importReport, pendingImports, overwritePrompt, renamingId, renameDraft, librarySearch, librarySort, libraryCategoryFilter, libraryFormatFilter, handoffChecked, templates, placedCount, placementRot, saveSelection, chunkName, buildIx, catalogSections, kindMeta, setBuildOpen, setPalette, setCustomSelection, setRemoveMode, setMoveMode, setSaveAreaMode, setPasteName, setAreaSelectMode, setAreaSelection, setAreaMoveArmed, setAreaDuplicateArmed, setAreaDeleteArmed, setCatalogCategory, setImportHubOpen, setReport, setPending, setOverwrite, setRenameDraft, setRenamingId, setLibrarySearch, setLibrarySort, setLibraryCategoryFilter, setLibraryFormatFilter, setChunkName, setSaveSelection, setTemplates, setMessage, setPlacementRotBoth, setHandoffCheckedBoth, setLibraryAssetCategory, setLibraryAssetTags, panelSwipeRef, buildRef, placePreviewRef, placeHoverRef, placePreviewFnRef, areaSelectPreviewRef, areaSelectPreviewLabelRef, pendingImportsRef, pendingDepsRef, overwritePromptRef, handoffCheckedRef, handoffSummaryRef, customAssetsRef, stateRef, handleImportFiles, commitPendingAssets, discardPendingAsset, updatePendingAsset, exportAssetPack, exportHandoff, copyHandoffSummary, shareHandoff, handoffSummaryFor, armCustomAsset, deleteCustomAsset, renameLibraryAsset, resolveOverwritePrompt } = props;
  return (
    <>
    {buildOpen&&<div data-testid="build-panel" style={{position:'absolute',right:12,bottom:76,zIndex:4,width:248,maxHeight:'calc(100% - 90px)',overflowY:'auto',overflowX:'hidden',WebkitOverflowScrolling:'touch',touchAction:'pan-y',overscrollBehavior:'contain',padding:14,borderRadius:12,background:'#172c23f5',border:'1px solid #8c9b8d',color:'#fff',fontFamily:'system-ui,sans-serif'}}
      // BUILD 1004: sideways swipe on the open panel minimizes it —
      // exactly the minimize button's state (setBuildOpen(false)
      // only, tool kept). Vertical drags keep scrolling natively:
      // the browser cancels the pointer stream (pointercancel) and
      // the tracker resets, and the dominance rule in classifySwipe
      // would reject them anyway. Taps (small displacement) never
      // fire; a swipe that unmounts the panel cannot also click a
      // button inside it, since the button is gone by pointerup.
      onPointerDown={(e)=>{panelSwipeRef.current={id:e.pointerId,x:e.clientX,y:e.clientY,fired:false};}}
      onPointerMove={(e)=>{const s=panelSwipeRef.current;if(!s||s.id!==e.pointerId||s.fired)return;const d=classifySwipe(e.clientX-s.x,e.clientY-s.y);if(d==='left'||d==='right'){s.fired=true;setBuildOpen(false);}}}
      onPointerUp={(e)=>{if(panelSwipeRef.current?.id===e.pointerId)panelSwipeRef.current=null;}}
      onPointerCancel={(e)=>{if(panelSwipeRef.current?.id===e.pointerId)panelSwipeRef.current=null;}}
    >
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <strong style={{flex:1,fontSize:15}}>Build — free, no resource cost</strong>
        <button type="button" data-testid="build-minimize" title="Minimize (keeps your tool)" onClick={()=>setBuildOpen(false)} style={{padding:'12px 14px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:16,lineHeight:1}}>—</button>
        <button type="button" data-testid="build-close" title="Close (clears your tool)" onClick={()=>{setBuildOpen(false);setImportHubOpen(false);setPalette(null);setCustomSelection(null);setRemoveMode(false);setMoveMode(false);setSaveAreaMode(false);setPasteName(null);setSaveSelection(null);setAreaSelectMode(false);setAreaSelection(null);setAreaMoveArmed(false);setAreaDuplicateArmed(false);setAreaDeleteArmed(false);setCatalogCategory('all');setPlacementRotBoth(0);buildRef.current={palette:null,removeMode:false,moveMode:false,saveAreaMode:false,pasteName:null,customAssetId:null,areaSelectMode:false,areaMoveArmed:false,areaDuplicateArmed:false};const el=placePreviewRef.current;if(el)el.style.display='none';const ael=areaSelectPreviewRef.current;if(ael)ael.style.display='none';placeHoverRef.current=null;buildIx.setWalk(false);}} style={{padding:'12px 14px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:16,lineHeight:1}}>×</button>
      </div>
      {/* BUILD 1043: Import Hub — the Build panel's front door for
          bringing in outside models. One button opens it; inside are
          the file picker (several files at once), the folder picker
          (desktop browsers that support it), the imported library
          with Place buttons, and the honest limits in plain words.
          The hub is a section at the top of the scrolling panel, not
          a floating overlay, so it cannot cover the field on a phone. */}
      <button type="button" data-testid="import-hub-open" onClick={()=>setImportHubOpen(!importHubOpen)} style={{display:'block',width:'100%',marginTop:10,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:importHubOpen?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>📦 Import Hub {importHubOpen?'▾':'▸'}</button>
      {importHubOpen&&<div data-testid="import-hub" style={{marginTop:10,padding:12,borderRadius:9,background:'#22392d',border:'1px solid #c4d1bd'}}>
        <div style={{fontSize:13,fontWeight:700}}>Import Hub — bring in your own models</div>
        {customAssetsWarning&&<div data-testid="import-hub-warning" style={{fontSize:12,marginTop:8,lineHeight:1.5,padding:8,borderRadius:8,background:'#5c3a17',border:'1px solid #d9a833'}}>⚠️ {customAssetsWarning}</div>}
        <div style={{fontSize:12,marginTop:6,lineHeight:1.5}}>Imports <b>.glb</b>, <b>.gltf</b> (pick its <b>.bin</b> file at the same time if it has one), <b>.obj</b>, or a <b>.zip</b> holding any of those. Pick several files at once. A ZIP is checked before anything imports: unsafe paths, ZIP-bomb expansion, and too many or too large files are rejected or skipped with a reason, and a bad entry never stops the rest. After an import the hub reports exactly which models landed, which were skipped and why. Models render as plain coloured triangles — 1 unit = 1 tile, footprint max 8×8, max 5 MB per file, library up to 50 MB / 100,000 triangles total. Your models are stored on this device (IndexedDB) and survive reloads here — they are not synced to other devices or to GitHub. A name that already exists asks first (Keep both / Replace / Skip) — nothing is overwritten silently.</div>
        <label style={{display:'block',fontSize:12,opacity:.85,marginTop:10}}>Choose model files (several at once)</label>
        <input type="file" multiple accept=".glb,.gltf,.obj,.fbx,.zip,.bin" data-testid="import-hub-file-input" onChange={handleImportFiles} style={{display:'block',width:'100%',marginTop:6,padding:'10px 8px',borderRadius:9,border:'1px solid #c4d1bd',background:'#172c23',color:'#fff',fontSize:12,boxSizing:'border-box'}} />
        <label style={{display:'block',fontSize:12,opacity:.85,marginTop:10}}>Or choose a whole folder (desktop browsers that support it)</label>
        <input type="file" multiple data-testid="import-hub-folder-input" ref={(el)=>{if(el)el.setAttribute('webkitdirectory','');}} onChange={handleImportFiles} style={{display:'block',width:'100%',marginTop:6,padding:'10px 8px',borderRadius:9,border:'1px solid #c4d1bd',background:'#172c23',color:'#fff',fontSize:12,boxSizing:'border-box'}} />
        {/* BUILD 1045: real import progress — the bar's width is the
            bytes read out of the total (or files, when there are no
            bytes), advanced between awaited reads/parses. It only
            shows while an import is actually running. */}
        {importProgress&&<div data-testid="import-progress" style={{marginTop:10,padding:10,borderRadius:9,background:'#172c23',border:'1px solid #c4d1bd'}}>
          <div style={{fontSize:12,lineHeight:1.4}}>{importProgressLabel(importProgress)}</div>
          <div style={{height:10,borderRadius:5,background:'#0f1f18',marginTop:6,overflow:'hidden'}}><div data-testid="import-progress-bar" style={{width:importProgressPercent(importProgress)+'%',height:'100%',background:'#7fb069'}} /></div>
        </div>}
        {/* BUILD 1046: the last import's report — exactly which
            models landed, which entries were skipped and why, which
            failed, and notes (a missing texture, a pack manifest, a
            .bin found in a subfolder). It stays until dismissed, so
            a partial import is never a mystery. */}
        {importReport&&<div data-testid="import-report" style={{marginTop:12,padding:10,borderRadius:9,background:'#172c23',border:'1px solid #c4d1bd'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{flex:1,fontSize:13,fontWeight:700}}>Import report — {importReport.source}</div>
            <button type="button" data-testid="import-report-dismiss" onClick={()=>setReport(null)} style={{padding:'6px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>Dismiss</button>
          </div>
          {importReport.added.length>0&&<div data-testid="import-report-added" style={{fontSize:12,marginTop:6,lineHeight:1.5}}>✅ Landed ({importReport.added.length}): {importReport.added.join(', ')}</div>}
          {importReport.skipped.length>0&&<div data-testid="import-report-skipped" style={{fontSize:12,marginTop:6,lineHeight:1.5}}>⏭️ Skipped ({importReport.skipped.length}):
            {importReport.skipped.map((s,i)=><div key={i} style={{marginLeft:12}}>• {s.name} — {s.reason}</div>)}
          </div>}
          {importReport.failed.length>0&&<div data-testid="import-report-failed" style={{fontSize:12,marginTop:6,lineHeight:1.5}}>❌ Failed ({importReport.failed.length}):
            {importReport.failed.map((f,i)=><div key={i} style={{marginLeft:12}}>• {f}</div>)}
          </div>}
          {importReport.notes.length>0&&<div data-testid="import-report-notes" style={{fontSize:12,marginTop:6,lineHeight:1.5}}>📝 Notes:
            {importReport.notes.map((n,i)=><div key={i} style={{marginLeft:12}}>• {n}</div>)}
          </div>}
          {importReport.added.length===0&&importReport.skipped.length===0&&importReport.failed.length===0&&<div style={{fontSize:12,marginTop:6,opacity:.8}}>Nothing landed from this import.</div>}
        </div>}
        {/* BUILD 1045: review step — every parsed model waits here
            with a real preview drawn from its own geometry, its
            details, and its name/category/tags editable BEFORE it
            joins the library. Add commits it (persisted first, then
            shown); Cancel drops it (nothing was ever written). */}
        {pendingImports.length>0&&<div data-testid="import-pending" style={{marginTop:12}}>
          <div style={{fontSize:13,fontWeight:700}}>Ready to review ({pendingImports.length}) — nothing joins the library until you tap Add</div>
          {pendingImports.map(a=>{const row=assetRow(a);return <div key={a.id} data-testid="import-pending-card" style={{marginTop:8,padding:10,borderRadius:9,background:'#172c23',border:'1px solid #ffd94d'}}>
            <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
              {canPreviewAsset(a)
                ? <AssetPreviewCanvas asset={a} size={120} testid="import-preview" />
                : <div data-testid="import-preview-unavailable" style={{width:120,height:120,flex:'0 0 120px',borderRadius:6,background:'#3a2a2a',border:'1px solid rgba(255,255,255,.25)',fontSize:11,lineHeight:1.4,padding:8,boxSizing:'border-box'}}>This model has no triangles to preview — it cannot be shown or added as a visible model.</div>}
              <div style={{flex:1,minWidth:0}}>
                <label style={{display:'block',fontSize:11,opacity:.85}}>Name</label>
                <input type="text" data-testid="import-pending-name" value={a.name} onChange={e=>updatePendingAsset(a.id,{name:e.target.value.slice(0,40)})} style={{display:'block',width:'100%',marginTop:2,padding:8,borderRadius:8,border:'1px solid #c4d1bd',background:'#0f1f18',color:'#fff',fontSize:13,boxSizing:'border-box'}} />
                <label style={{display:'block',fontSize:11,opacity:.85,marginTop:6}}>Category</label>
                <select data-testid="import-pending-category" value={a.category??'Unsorted'} onChange={e=>updatePendingAsset(a.id,{category:e.target.value})} style={{display:'block',width:'100%',marginTop:2,padding:8,borderRadius:8,border:'1px solid #c4d1bd',background:'#0f1f18',color:'#fff',fontSize:13,boxSizing:'border-box'}}>
                  {ASSET_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <label style={{display:'block',fontSize:11,opacity:.85,marginTop:6}}>Tags (comma-separated)</label>
                <input type="text" data-testid="import-pending-tags" defaultValue={(a.tags??[]).join(', ')} onBlur={e=>updatePendingAsset(a.id,{tags:parseTags(e.target.value)})} placeholder="e.g. red, roof" style={{display:'block',width:'100%',marginTop:2,padding:8,borderRadius:8,border:'1px solid #c4d1bd',background:'#0f1f18',color:'#fff',fontSize:13,boxSizing:'border-box'}} />
              </div>
            </div>
            <div style={{fontSize:12,marginTop:8,lineHeight:1.5}}>{row.width}×{row.depth} tiles · {row.height} high · {row.triangles} triangles · {row.format.toUpperCase()} · from {row.sourceFile}</div>
            {/* BUILD 1046: dependencies the parser reported — a
                texture this model names but that was not in the
                upload is said plainly here (it was not applied,
                because textures are never rendered), and a data
                file found in a subfolder is named too. */}
            {(()=>{const deps=(pendingDepsRef.current.get(a.id)||[]).filter(d=>!d.found||(d.found&&d.kind==='buffer'&&d.resolvedPath&&d.resolvedPath.includes('/')));
              if(deps.length===0)return null;
              return <div data-testid="import-pending-deps" style={{fontSize:12,marginTop:6,lineHeight:1.5}}>
                {deps.map((d,i)=><div key={i}>⚠️ {d.kind==='image'
                  ? 'Texture "'+d.uri+'" was named but not found in the upload — the model still imports; textures are not rendered, so nothing was applied.'
                  : 'Its data file "'+d.resolvedPath+'" was found in a subfolder.'}</div>)}
              </div>;})()}
            <div style={{display:'flex',gap:8,marginTop:8}}>
              <button type="button" data-testid="import-pending-add" onClick={()=>void commitPendingAssets([a])} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>Add to Asset Library</button>
              <button type="button" data-testid="import-pending-cancel" onClick={()=>discardPendingAsset(a.id)} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#5a2e24',color:'#fff',fontWeight:700,fontSize:13}}>Cancel</button>
            </div>
          </div>;})}
          {pendingImports.length>1&&<div style={{display:'flex',gap:8,marginTop:8}}>
            <button type="button" data-testid="import-pending-add-all" onClick={()=>void commitPendingAssets([...pendingImportsRef.current])} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>Add all ({pendingImports.length})</button>
            <button type="button" data-testid="import-pending-cancel-all" onClick={()=>{const n=pendingImportsRef.current.length;setPending([]);pendingDepsRef.current.clear();setMessage('Discarded '+n+' pending import'+(n===1?'':'s')+' — nothing joined the library');}} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#5a2e24',color:'#fff',fontWeight:700,fontSize:13}}>Cancel all</button>
          </div>}
        </div>}
        {/* BUILD 1046: overwrite confirmation — a pending model
            whose name already exists in the library asks first.
            Keep both renames the newcomer (the old behaviour);
            Replace removes the old model AND its placed copies,
            then adds the new one under the same name; Skip drops
            the newcomer. Nothing is committed while this is open,
            and an unanswered row defaults to Keep both. */}
        {overwritePrompt&&<div data-testid="import-overwrite-prompt" style={{marginTop:12,padding:10,borderRadius:9,background:'#172c23',border:'1px solid #ffd94d'}}>
          <div style={{fontSize:13,fontWeight:700}}>A name already exists — what should happen?</div>
          <div style={{fontSize:12,marginTop:4,lineHeight:1.5,opacity:.9}}>Nothing has been added or removed yet. Pick one for each model, then continue.</div>
          {overwritePrompt.collisions.map(c=>{const choice=overwritePrompt.choices[c.pendingId]??'keep';return <div key={c.pendingId} data-testid="import-overwrite-row" style={{marginTop:8,padding:8,borderRadius:8,background:'#0f1f18',border:'1px solid rgba(255,255,255,.15)'}}>
            <div style={{fontSize:12,lineHeight:1.5}}><b>'{c.pendingName}'</b> is already in the library.{choice==='replace'?' Replace removes \''+c.existingName+'\' and its '+c.placedCount+' placed cop'+(c.placedCount===1?'y':'ies')+', then adds the new model.':''}</div>
            <div style={{display:'flex',gap:6,marginTop:6}}>
              <button type="button" data-testid="import-overwrite-keep" onClick={()=>setOverwrite({...overwritePromptRef.current!,choices:{...overwritePromptRef.current!.choices,[c.pendingId]:'keep'}})} style={{flex:1,padding:'8px 4px',borderRadius:8,border:'1px solid #c4d1bd',background:choice==='keep'?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>Keep both</button>
              <button type="button" data-testid="import-overwrite-replace" onClick={()=>setOverwrite({...overwritePromptRef.current!,choices:{...overwritePromptRef.current!.choices,[c.pendingId]:'replace'}})} style={{flex:1,padding:'8px 4px',borderRadius:8,border:'1px solid #c4d1bd',background:choice==='replace'?'#7a3b2e':'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>Replace</button>
              <button type="button" data-testid="import-overwrite-skip" onClick={()=>setOverwrite({...overwritePromptRef.current!,choices:{...overwritePromptRef.current!.choices,[c.pendingId]:'skip'}})} style={{flex:1,padding:'8px 4px',borderRadius:8,border:'1px solid #c4d1bd',background:choice==='skip'?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>Skip</button>
            </div>
          </div>;})}
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button type="button" data-testid="import-overwrite-continue" onClick={resolveOverwritePrompt} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>Continue with these choices</button>
            <button type="button" data-testid="import-overwrite-cancel" onClick={()=>setOverwrite(null)} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Not yet</button>
          </div>
        </div>}
        <div style={{fontSize:13,fontWeight:700,marginTop:12}}>Asset Library ({customAssetsLoading?'…':customAssets.length})</div>
        {/* BUILD 1045: the library is searchable and sortable — search
            matches name, tags, and source filename; the filters narrow
            by category and format; sort orders by name, format,
            category, or triangle count. */}
        <input type="text" data-testid="import-library-search" value={librarySearch} onChange={e=>setLibrarySearch(e.target.value)} placeholder="Search by name, tag, or file…" style={{display:'block',width:'100%',marginTop:6,padding:'10px 8px',borderRadius:9,border:'1px solid #c4d1bd',background:'#172c23',color:'#fff',fontSize:13,boxSizing:'border-box'}} />
        <div style={{display:'flex',gap:6,marginTop:6}}>
          <select data-testid="import-library-category-filter" value={libraryCategoryFilter} onChange={e=>setLibraryCategoryFilter(e.target.value)} aria-label="Filter by category" style={{flex:1,padding:'8px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#172c23',color:'#fff',fontSize:12}}>
            <option value="all">All categories</option>
            {ASSET_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <select data-testid="import-library-format-filter" value={libraryFormatFilter} onChange={e=>setLibraryFormatFilter(e.target.value)} aria-label="Filter by format" style={{flex:1,padding:'8px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#172c23',color:'#fff',fontSize:12}}>
            <option value="all">All formats</option>
            <option value="glb">GLB</option>
            <option value="gltf">glTF</option>
            <option value="obj">OBJ</option>
          </select>
          <select data-testid="import-library-sort" value={librarySort} onChange={e=>setLibrarySort(e.target.value as LibrarySort)} aria-label="Sort library" style={{flex:1,padding:'8px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#172c23',color:'#fff',fontSize:12}}>
            <option value="name">Sort: name</option>
            <option value="format">Sort: format</option>
            <option value="category">Sort: category</option>
            <option value="triangles">Sort: triangles</option>
          </select>
        </div>
        {customAssetsLoading
          ? <div data-testid="import-hub-loading" style={{fontSize:12,opacity:.7,marginTop:6}}>Loading your models{(()=>{const m=readAssetManifest();return m&&m.assets.length>0?' ('+m.assets.length+' saved)':'';})()}…</div>
          : customAssets.length===0
          ? <div style={{fontSize:12,opacity:.7,marginTop:6}}>Nothing imported yet — pick a file above.</div>
          : (()=>{const visible=sortAssets(filterAssets(customAssets,{query:librarySearch,category:libraryCategoryFilter,format:libraryFormatFilter}),librarySort);
            if(visible.length===0)return <div data-testid="import-library-empty" style={{fontSize:12,opacity:.7,marginTop:6}}>No models match that search — clear the search or filters to see the whole library.</div>;
            return <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:6}}>
              {visible.map(a=>{const row=assetRow(a);return <div key={a.id} data-testid="import-library-row" style={{display:'flex',gap:8,alignItems:'flex-start',padding:8,borderRadius:9,background:'#172c23',border:'1px solid rgba(255,255,255,.12)'}}>
                {/* BUILD 1047: tick a row to include it in the AI
                    handoff (export / share / copy summary below). */}
                <input type="checkbox" data-testid="import-library-handoff-check" checked={handoffChecked.includes(a.id)} onChange={()=>{const ids=handoffCheckedRef.current.includes(a.id)?handoffCheckedRef.current.filter(id=>id!==a.id):[...handoffCheckedRef.current,a.id];setHandoffCheckedBoth(ids);}} aria-label={'Include '+a.name+' in the handoff'} style={{marginTop:14,flex:'0 0 auto',width:18,height:18,accentColor:'#7fb069'}} />
                <AssetPreviewCanvas asset={a} size={44} testid="import-library-preview" />
                <div style={{flex:1,minWidth:0}}>
                  {renamingId===a.id
                    ? <div style={{display:'flex',gap:6}}>
                        <input type="text" data-testid="import-library-rename-input" value={renameDraft} onChange={e=>setRenameDraft(e.target.value.slice(0,40))} style={{flex:1,minWidth:0,padding:'7px 8px',borderRadius:8,border:'1px solid #c4d1bd',background:'#0f1f18',color:'#fff',fontSize:12,boxSizing:'border-box'}} />
                        <button type="button" data-testid="import-library-rename-save" onClick={()=>renameLibraryAsset(a,renameDraft)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:12}}>Save</button>
                        <button type="button" data-testid="import-library-rename-cancel" onClick={()=>setRenamingId(null)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>✕</button>
                      </div>
                    : <div style={{fontSize:12,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row.name}</div>}
                  <div style={{fontSize:11,opacity:.85,lineHeight:1.5,marginTop:2}}>{row.category}{row.tags.length>0?' · '+row.tags.join(', '):''} · {row.width}×{row.depth} tiles · {row.height} high · {row.triangles} triangles · {row.format.toUpperCase()} · {row.sourceFile}</div>
                  <div style={{display:'flex',gap:6,marginTop:6,flexWrap:'wrap'}}>
                    <select data-testid="import-library-category" value={row.category} onChange={e=>setLibraryAssetCategory(a,e.target.value)} aria-label={'Category for '+a.name} style={{padding:'6px',borderRadius:8,border:'1px solid #c4d1bd',background:'#0f1f18',color:'#fff',fontSize:11}}>
                      {ASSET_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="text" data-testid="import-library-tags" defaultValue={row.tags.join(', ')} onBlur={e=>setLibraryAssetTags(a,e.target.value)} placeholder="tags, comma-separated" aria-label={'Tags for '+a.name} style={{flex:1,minWidth:90,padding:'6px 8px',borderRadius:8,border:'1px solid #c4d1bd',background:'#0f1f18',color:'#fff',fontSize:11,boxSizing:'border-box'}} />
                  </div>
                  <div style={{display:'flex',gap:6,marginTop:6}}>
                    {renamingId!==a.id&&<button type="button" data-testid="import-library-rename" onClick={()=>{setRenamingId(a.id);setRenameDraft(a.name);}} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>Rename</button>}
                    <button type="button" data-testid="import-hub-place" onClick={()=>armCustomAsset(a.id)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:customSelection===a.id?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>Place</button>
                    <button type="button" data-testid="import-hub-delete" aria-label={'Delete '+a.name} onClick={()=>deleteCustomAsset(a)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:'#7a3b2e',color:'#fff',fontWeight:700,fontSize:12}}>Delete</button>
                  </div>
                </div>
              </div>;})}
            </div>;})()}
        {/* BUILD 1046: export / backup — the whole library as one
            ZIP (models in their original formats + a manifest),
            downloaded to this device. Nothing is uploaded anywhere.
            Re-importing the ZIP restores the models; placements are
            not in the pack — they live in the world save. */}
        <div style={{marginTop:12,padding:10,borderRadius:9,background:'#172c23',border:'1px solid #c4d1bd'}}>
          <div style={{fontSize:13,fontWeight:700}}>Back up your models</div>
          <div style={{fontSize:12,marginTop:4,lineHeight:1.5}}>Export downloads one ZIP with every model in the library (in its original format) plus a manifest listing names, formats, categories, tags, and sizes. Re-import that ZIP to restore them.</div>
          <button type="button" data-testid="import-hub-export" onClick={exportAssetPack} style={{display:'block',width:'100%',marginTop:8,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>⬇️ Export library as a ZIP ({customAssetsLoading?'…':customAssets.length} model{customAssets.length===1?'':'s'})</button>
        </div>
        {/* BUILD 1047: hand off models to ChatGPT or Muse — pick which
            models (checkboxes on the rows above, a whole category, or
            the whole library), export a ZIP with the models + the
            manifest + a copyable summary, or share it when the device
            supports sharing files from the browser. The game uploads
            nothing anywhere; the AI cannot see browser files until
            the player uploads the ZIP in their chat. */}
        <div data-testid="import-handoff" style={{marginTop:12,padding:10,borderRadius:9,background:'#172c23',border:'1px solid #c4d1bd'}}>
          <div style={{fontSize:13,fontWeight:700}}>Hand off models to ChatGPT or Muse</div>
          <div style={{fontSize:12,marginTop:4,lineHeight:1.5}}>{HANDOFF_HOWTO}</div>
          <div style={{fontSize:12,marginTop:4,lineHeight:1.5}}>{HANDOFF_LIMIT}</div>
          <div style={{display:'flex',gap:6,marginTop:8,flexWrap:'wrap'}}>
            <button type="button" data-testid="import-handoff-export-checked" onClick={()=>exportHandoff({kind:'ids',ids:handoffCheckedRef.current})} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>⬇️ Export checked ({handoffChecked.length})</button>
            {libraryCategoryFilter!=='all'&&<button type="button" data-testid="import-handoff-export-category" onClick={()=>exportHandoff({kind:'category',category:libraryCategoryFilter})} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>⬇️ Export {libraryCategoryFilter} ({customAssets.filter(a=>(a.category??'Unsorted')===libraryCategoryFilter).length})</button>}
            <button type="button" data-testid="import-handoff-export-all" onClick={()=>exportHandoff({kind:'all'})} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>⬇️ Export whole library ({customAssetsLoading?'…':customAssets.length})</button>
            <button type="button" data-testid="import-handoff-share" onClick={()=>void shareHandoff()} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>📤 Share checked…</button>
          </div>
          <button type="button" data-testid="import-hub-save" onClick={saveAssets} disabled={assetsSaving||customAssetsLoading||customAssets.length===0} style={{display:'block',width:'100%',marginTop:8,padding:'11px 8px',borderRadius:9,border:'1px solid #c4d1bd',background:assetsSaving?'#526d42':'#315a3d',color:'#fff',fontWeight:700,fontSize:13,opacity:(assetsSaving||customAssetsLoading||customAssets.length===0)?0.65:1}}>{assetsSaving?'Saving models…':customAssetsLoading?'Loading model library…':customAssets.length===0?'💾 Save uploaded models (no models yet)':'💾 Save uploaded models ('+customAssets.length+')'}</button>
          <div style={{display:'flex',gap:6,marginTop:6}}>
            <button type="button" data-testid="import-handoff-check-all" onClick={()=>setHandoffCheckedBoth(customAssetsRef.current.map(a=>a.id))} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>Check all</button>
            <button type="button" data-testid="import-handoff-clear" onClick={()=>setHandoffCheckedBoth([])} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:12}}>Clear</button>
          </div>
          <label style={{display:'block',fontSize:12,opacity:.85,marginTop:8}}>Handoff summary — what is in the checked models (copy it into your chat)</label>
          <textarea ref={handoffSummaryRef} data-testid="import-handoff-summary" readOnly value={handoffChecked.length===0?'Tick a model in the library to see its handoff summary here.':handoffSummaryFor({kind:'ids',ids:handoffChecked})} rows={8} style={{display:'block',width:'100%',marginTop:4,padding:8,borderRadius:8,border:'1px solid #c4d1bd',background:'#0f1f18',color:'#fff',fontSize:11,lineHeight:1.5,boxSizing:'border-box',resize:'vertical'}} />
          <button type="button" data-testid="import-handoff-copy" onClick={()=>void copyHandoffSummary()} style={{display:'block',width:'100%',marginTop:6,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>📋 Copy summary</button>
        </div>
        <div data-testid="import-hub-limits" style={{fontSize:12,marginTop:12,lineHeight:1.5,borderTop:'1px solid #c4d1bd',paddingTop:10}}>
          <div style={{fontWeight:700}}>What the hub cannot do (honest limits)</div>
          <div style={{marginTop:4}}>• <b>Folders:</b> on iPhone Safari a folder cannot be opened directly — pick files above instead (several at once). The folder button works on a desktop browser where the browser supports it.</div>
          <div style={{marginTop:4}}>• <b>Audio:</b> not imported — there is no audio playback in the game yet, so an audio file would have nowhere to play.</div>
          <div style={{marginTop:4}}>• <b>Textures:</b> not rendered as textures — this renderer draws plain coloured triangles only, so a texture on a model is ignored and the model shows its colours flat.</div>
          <div style={{marginTop:4}}>• <b>Packs:</b> an export backs up your models, not where you placed them — placements live in the world save, and re-importing a pack creates new copies of the models (a name that already exists will ask first).</div>
          <div style={{marginTop:4}}>• <b>AI access:</b> ChatGPT cannot reach files on your phone or computer — uploading here through the file picker is how a model gets into the game.</div>
          <div style={{marginTop:4}}>• <b>AI handoff:</b> ChatGPT and Muse cannot see the files in your browser on their own — download the handoff ZIP and upload it in your chat with them, and paste the summary. The game itself does not run an AI.</div>
        </div>
      </div>}
      <div style={{fontSize:12,opacity:.85,marginTop:4,lineHeight:1.4}}>Pick an item from the catalog — it stays selected and follows your cursor as a green (valid) or red (invalid) preview until you place it, and stays selected after placing so you can place another copy right away; ESC or right-click cancels. Tap Move first and the asset still attaches to your cursor; after cancelling you are back to dragging items. Houses, stalls, the windmill, and the mine rotate: R = 90° clockwise, Shift+R = 90° counter-clockwise, or the rotation buttons — rotate a house so its door faces the road or path. New in this build: Farm Land (Nature) is tilled soil you place tile by tile — it grows green shoots after an in-game hour and golden wheat after three in-game hours, and regrows on its own after harvest; stand next to ready wheat and press E to harvest 2 wheat (the Wheat counter is next to Wood, Stone, and Gold), and farmer villagers walk to ready wheat and harvest it too. Lanterns (Decorations) glow at night like the house lights; Bushes (Nature) are walk-through decor, like grass; the Mine (Buildings) is a stone structure you can enter, like a house; Ore Deposits (Infrastructure) are placeable rock nodes — there is no mining system yet, so they are decoration for now; the Wooden Bridge (Roads) goes over the ocean or the pond and you can walk across it. Tap Remove, then an item, path, house, tree, rock, water, lantern, bush, ore deposit, bridge, or farm land to take it down — taps snap to the nearest removable tile, and dragging in Remove mode clears a whole section at once (one Undo tap restores the whole drag). Tap Move, then drag an item you placed to a new spot — one Undo tap moves it back. Minimize (—) keeps your tool; close (×) clears it. While minimized, Walk pauses your tool so taps move you, Undo steps back through your changes one tap at a time, and Redo steps forward again — a new change clears Redo. Undo (CTRL+Z) and Redo (CTRL+Y, or CTRL+Shift+Z) work from the keyboard too, for every change — placement, deletion, movement, rotation, and area actions — with no limit on how far back you can go; deleting an upload is undoable as well (one Undo brings its placed copies back). Save area lets you drag a rectangle, name it, and keep it as a chunk; tap a saved chunk, then tap the ground to stamp it elsewhere, and one Undo removes the whole paste. The Import Hub (button at the top of this panel) is where you bring in your own models — .glb, .gltf (with its .bin file if it has one), .obj, or a ZIP of models. They render as plain coloured triangles (textures and animation are ignored), you pick one in the Custom category to place it like any other item, and one Undo removes it. Audio is not imported yet — there is no audio playback in the game — and on iPhone Safari folders cannot be opened directly, so pick files (several at once) instead. AREA SELECT has Layout helpers now (in the yellow area menu): Doors face paths turns each selected house so its door faces the nearest road or path, Trees off paths moves trees standing on a path to the nearest clear tile beside it, Lanterns along roads puts lanterns on the road's edge every few tiles, Fence property puts a low wooden fence around each selected house with a gap at the door, Align row / Align column line the selected items up, ENHANCE fills empty ground with grass, bushes, and the odd tree without moving or removing anything, and Spread out / Pack together move the selected items one tile apart or together — each helper is optional (nothing happens until you tap it) and one Undo undoes the whole thing. Fence is also in the Build menu under Decorations, like the wall. Honest note: scale, elevation, tree rotation, and vegetation size cannot change yet — there is no per-item size feature — so those are not in the helpers. New in this build: the Import Hub shows a real preview of each model before it joins the library, with its size, height, source file, and format — tap Add to Asset Library to keep it or Cancel to discard it — and the library can be searched by name, tag, or file, and sorted by name, format, category, or size, with each asset's name, category, and tags editable. New in this build: ZIP imports are checked for unsafe paths and ZIP-bomb expansion, a bad entry is skipped with a reason instead of stopping the whole import, and the hub reports exactly which models landed, which were skipped and why; a .gltf finds its .bin in a subfolder and a missing texture is reported, never claimed as applied; the whole library can be exported as a ZIP backup with a manifest; and a name that already exists asks first (Keep both / Replace / Skip) instead of overwriting silently. New in this build: the Import Hub can hand models to ChatGPT or Muse — tick models in the library (or a whole category, or the whole library), export a ZIP with the models, the manifest, and a copyable summary, or share it when the device supports sharing files from the browser. ChatGPT and Muse cannot see your browser's files on their own — you upload the ZIP in your chat — and the game itself does not run an AI. New in this build: the town's roofs vary now — some run north-south instead of east-west, some are shallow and some are steep, and some have a flat top with a raised edge instead of a pitched ridge; which roof a house has is fixed by the house, so the same house always has the same roof, and a house you place keeps its roof when you move it, rotate it, or undo and redo. Some town houses have a fenced garden beside them — a low wooden fence around a planted patch, with a gap at the gate so you can walk in — and the fences never block a door or a path. Step inside a house and there is a ceiling over you now instead of open sky, with walls and a doorway, and the hearth in every house glows warm at night when the house lights are on; the ceiling and walls only show in first-person view inside (zoom right in) — from the normal high view the room still shows open so you can see the furniture — and the gardens only grow beside town houses the game built, not beside houses you place (use Fence property in the area menu for those).</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:10}}>
        {(['all','buildings','houses','shops','decorations','roads','nature','infrastructure','custom','stations'] as const).map(cat=><button key={cat} type="button" data-testid={'build-catalog-category-'+cat} onClick={()=>setCatalogCategory(cat)} style={{padding:'8px 10px',borderRadius:9,border:'1px solid #c4d1bd',background:catalogCategory===cat?'#526d42':'#22392d',color:'#fff',fontWeight:catalogCategory===cat?700:500,fontSize:13}}>{{all:'All',buildings:'Buildings',houses:'Houses',shops:'Shops',decorations:'Decorations',roads:'Roads',nature:'Nature',infrastructure:'Infrastructure',custom:'Custom',stations:'Crafting'}[cat]}</button>)}
      </div>
      <div data-testid="build-catalog-list" style={{maxHeight:280,overflowY:'auto',marginTop:10,paddingRight:2}}>
        {catalogSections.filter(sec=>catalogCategory==='all'||catalogCategory===sec.id).map(sec=><div key={sec.id}>
          <div style={{fontSize:12,fontWeight:700,opacity:.8,marginTop:8}}>{sec.label}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:6}}>
            {sec.kinds.map(kind=><button key={kind} type="button" data-testid={'build-palette-'+kind} onClick={()=>{const next=palette===kind?null:kind;setPalette(next);setCustomSelection(null);setRemoveMode(false);setSaveAreaMode(false);setPasteName(null);setAreaSelectMode(false);setAreaMoveArmed(false);setAreaDuplicateArmed(false);buildRef.current={palette:next,removeMode:false,moveMode:buildRef.current.moveMode,saveAreaMode:false,pasteName:null,customAssetId:null,areaSelectMode:false,areaMoveArmed:false,areaDuplicateArmed:false};if(!next){const el=placePreviewRef.current;if(el)el.style.display='none';placeHoverRef.current=null;}}} style={{padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:palette===kind?'#526d42':'#22392d',color:'#fff',fontWeight:palette===kind?700:500,fontSize:14}}>
              <span style={{display:'block',height:26,borderRadius:6,background:kindMeta[kind].swatch,marginBottom:6,border:'1px solid rgba(255,255,255,.25)'}}></span>
              {kindMeta[kind].label}
            </button>)}
          </div>
        </div>)}
        {/* BUILD 997: Custom category — uploaded .glb models as
            catalog tiles (swatch = the model's mean colour), plus the
            upload picker. Selecting an upload arms it like any
            palette kind; tapping the ground places it with its mesh
            footprint. Deleting an upload removes its placed copies
            at once and is not undoable. */}
        {(catalogCategory==='all'||catalogCategory==='custom')&&<div>
          <div style={{fontSize:12,fontWeight:700,opacity:.8,marginTop:8}}>Custom</div>
          {customAssetsLoading
            ? <div data-testid="build-custom-loading" style={{fontSize:12,opacity:.7,marginTop:6}}>Loading your models…</div>
            : customAssets.length===0
            ? <div style={{fontSize:12,opacity:.7,marginTop:6}}>No custom uploads yet — open the Import Hub above to bring in a model.</div>
            : <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:6}}>
                {customAssets.map(a=><div key={a.id} style={{display:'flex',flexDirection:'column',gap:6}}>
                  <button type="button" data-testid="build-custom-asset" onClick={()=>armCustomAsset(customSelection===a.id?null:a.id)} style={{padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:customSelection===a.id?'#526d42':'#22392d',color:'#fff',fontWeight:customSelection===a.id?700:500,fontSize:14}}>
                    <span style={{display:'block',height:26,borderRadius:6,background:'rgb('+Math.round(a.avgColor[0]*255)+','+Math.round(a.avgColor[1]*255)+','+Math.round(a.avgColor[2]*255)+')',marginBottom:6,border:'1px solid rgba(255,255,255,.25)'}}></span>
                    {a.name}
                  </button>
                  <button type="button" data-testid="build-custom-delete" aria-label={'Delete '+a.name} onClick={()=>deleteCustomAsset(a)} style={{padding:'8px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#7a3b2e',color:'#fff',fontWeight:700,fontSize:12}}>Delete</button>
                </div>)}
              </div>}
          {/* BUILD 1043: uploads moved to the Import Hub (top of this
              panel) — this section only lists what is already imported
              and arms it for placement. */}
          <div style={{marginTop:8}}>
            <button type="button" data-testid="build-custom-open-hub" onClick={()=>setImportHubOpen(true)} style={{display:'block',width:'100%',padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:13}}>📦 Open the Import Hub to upload models</button>
            <div style={{fontSize:11,opacity:.7,marginTop:4,lineHeight:1.4}}>Models render as plain coloured triangles — textures and animation are ignored. 1 unit = 1 tile; footprint max 8×8. PNGs cannot be placed: the 3D renderer draws geometry, not pictures. No scale control yet — a model places at its authored size, and there is no way to make it bigger or smaller.</div>
          </div>
        </div>}
        {/* BUILD 1092 (0x1B, Phase 3.1): the settlement catalogue — every
            building the settlement can grow into, generated from
            buildingCatalogue.ts. Entries with a palette kind arm that
            tool exactly like the palette buttons above (same behaviour,
            free placement where it was free); the rest are listed,
            locked, with the reason why. Nothing here builds anything
            new — the catalogue is data, the construction path (3.2)
            comes in a later build. */}
        <div data-testid="build-catalogue" style={{marginTop:10}}>
          <div style={{fontSize:12,fontWeight:700,opacity:.8,marginTop:8}}>Settlement Catalogue — every building the settlement can grow into</div>
          <div style={{fontSize:11,opacity:.7,marginTop:4,lineHeight:1.4}}>93 buildings in 6 categories. Tap one that is ready to place it; the rest are listed so you can see what each one needs — locked ones have no construction path yet and arrive in a later build.</div>
          {CATALOGUE_CATEGORIES.map(cat=><div key={cat.id}>
            <div style={{fontSize:12,fontWeight:700,opacity:.8,marginTop:8}}>{cat.letter}. {cat.label}</div>
            {BUILDING_CATALOGUE.filter(e=>e.category===cat.id).map(entry=>{const m=catalogueMenuEntryFor(entry);const cost=entry.materials.length===0?'No cost':entry.materials.map(x=>x.qty+' '+x.resource).join(' + ');return (
              <button key={entry.id} type="button" data-testid={'build-catalogue-'+entry.id} disabled={!m.placeable} onClick={()=>{if(!entry.paletteKind)return;const kind=entry.paletteKind;const next=palette===kind?null:kind;setPalette(next);setCustomSelection(null);setRemoveMode(false);setSaveAreaMode(false);setPasteName(null);setAreaSelectMode(false);setAreaMoveArmed(false);setAreaDuplicateArmed(false);buildRef.current={palette:next,removeMode:false,moveMode:buildRef.current.moveMode,saveAreaMode:false,pasteName:null,customAssetId:null,areaSelectMode:false,areaMoveArmed:false,areaDuplicateArmed:false};if(!next){const el=placePreviewRef.current;if(el)el.style.display='none';placeHoverRef.current=null;}}} style={{display:'block',width:'100%',textAlign:'left',padding:'8px 10px',borderRadius:9,border:'1px solid #c4d1bd',background:m.placeable?(palette===entry.paletteKind?'#526d42':'#22392d'):'#1a2a22',color:'#fff',fontSize:13,marginTop:6,opacity:m.placeable?1:.75}}>
                <span style={{fontWeight:700}}>{entry.name}</span>
                <span style={{display:'block',fontSize:11,opacity:.8,marginTop:2}}>{entry.footprint.w}×{entry.footprint.h} · {cost}{entry.produces?' · makes '+entry.produces.perHour+' '+entry.produces.resource+'/h':''}{entry.capacity>0?' · holds '+entry.capacity+' '+entry.capacityUnit:''}{entry.workers>0?' · '+entry.workers+' worker'+(entry.workers===1?'':'s'):''}</span>
                {!m.placeable&&<span style={{display:'block',fontSize:11,opacity:.7,marginTop:2}}>🔒 {m.lockedReason}</span>}
              </button>);})}
          </div>)}
        </div>
      </div>
      {/* BUILD 1036: rotation controls — shown while a house or stall
          is armed (the only kinds rotation changes: houses rotate
          their door face, stalls rotate their 2x1 run; 1x1 kinds are
          unaffected, so no controls are shown for them — no fake
          controls). BUILD 1048: also shown while a custom upload is
          armed — the model itself turns (its footprint swaps w/h on
          odd turns), so R and the buttons rotate it like a house.
          R rotates 90° clockwise, Shift+R 90° counter-clockwise;
          the buttons do the same for touch. The rotation persists
          across placements and asset switches. */}
      {((palette&&(isHouseKind(palette)||palette==='stall'))||customSelection)&&<div style={{marginTop:10,padding:10,borderRadius:9,background:'#22392d',border:'1px solid #c4d1bd'}}>
        <div style={{fontSize:12,fontWeight:700}}>Rotation: {placementRot*90}° · {customSelection?'model rotated '+(placementRot*90)+'°':(palette&&isHouseKind(palette))?'door faces '+rotateFace('south',placementRot):'runs '+(placementRot%2===1?'south':'east')}</div>
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <button type="button" data-testid="build-rotate-ccw" onClick={()=>{const next=(((placementRot+3)%4) as Rotation);setPlacementRotBoth(next);const h=placeHoverRef.current;if(h)placePreviewFnRef.current?.(h.x,h.y);}} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:14}}>⟲ 90°</button>
          <button type="button" data-testid="build-rotate-cw" onClick={()=>{const next=(((placementRot+1)%4) as Rotation);setPlacementRotBoth(next);const h=placeHoverRef.current;if(h)placePreviewFnRef.current?.(h.x,h.y);}} style={{flex:1,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:14}}>90° ⟳</button>
        </div>
        <div style={{fontSize:11,opacity:.75,marginTop:6,lineHeight:1.4}}>R = rotate 90° clockwise, Shift+R = 90° counter-clockwise. Rotate a house so its door faces the road or path, or a model so it faces the way you want. 90° steps only — the world is built from tile rectangles, so 45°/15°/free rotation cannot exist for houses or models.</div>
      </div>}
      <button type="button" data-testid="build-remove-toggle" onClick={buildIx.toggleRemove} style={{display:'block',width:'100%',marginTop:10,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:removeMode?'#7a3b2e':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Remove: {removeMode?'On':'Off'}</button>
      <button type="button" data-testid="build-move-toggle" onClick={()=>{const next=!moveMode;setMoveMode(next);if(next){setAreaSelectMode(false);setAreaMoveArmed(false);setAreaDuplicateArmed(false);}buildRef.current={...buildRef.current,moveMode:next,areaSelectMode:next?false:buildRef.current.areaSelectMode,areaMoveArmed:next?false:buildRef.current.areaMoveArmed,areaDuplicateArmed:next?false:buildRef.current.areaDuplicateArmed};}} style={{display:'block',width:'100%',marginTop:10,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:moveMode?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Move: {moveMode?'On':'Off'}</button>
      {/* BUILD 996: saved chunks (build templates). Save area arms the
          rectangle drag; the naming row appears after a selection
          finalizes (panel reopens if minimized, so the row is
          visible). Tapping a saved chunk arms paste mode — tap the
          ground to stamp it with its corner on the tapped tile;
          tapping the chunk again disarms. Deleting is immediate and
          is not an undo entry (templates are library state, not
          world changes). */}
      <div style={{marginTop:14,paddingTop:10,borderTop:'1px solid #8c9b8d'}}>
        <div style={{fontSize:13,fontWeight:700}}>Saved chunks</div>
        <div style={{fontSize:11,opacity:.75,marginTop:4,lineHeight:1.4}}>Turn Save area on, then drag a rectangle on the ground — or tap one tile — to select it. Name it and save it as a chunk. Tap a saved chunk, then tap the ground to stamp it there (its corner lands on the tapped tile); items that cannot fit are skipped and reported, never blocking the rest. One Undo removes a whole paste. Chunks save only what you placed — generated houses, paths, and trees are not captured. Custom uploads are captured too, with the model they came from — pasting one needs that model still in your library, or that item is skipped and reported.</div>
        <button type="button" data-testid="build-save-area-toggle" onClick={()=>{const next=!saveAreaMode;setSaveAreaMode(next);if(next){setPalette(null);setCustomSelection(null);setRemoveMode(false);setMoveMode(false);setPasteName(null);setAreaSelectMode(false);setAreaMoveArmed(false);setAreaDuplicateArmed(false);}setSaveSelection(null);buildRef.current={palette:next?null:palette,removeMode:next?false:removeMode,moveMode:next?false:moveMode,saveAreaMode:next,pasteName:next?null:pasteName,customAssetId:next?null:buildRef.current.customAssetId,areaSelectMode:next?false:areaSelectMode,areaMoveArmed:next?false:areaMoveArmed,areaDuplicateArmed:next?false:areaDuplicateArmed};}} style={{display:'block',width:'100%',marginTop:10,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:saveAreaMode?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Save area: {saveAreaMode?'On':'Off'}</button>
        {/* BUILD 1037: AREA SELECT — drag a yellow rectangle on the
            ground to select everything inside it (houses, trees,
            paths, rocks, walls, decorations — placed and generated),
            then Move, Rotate, Delete, or Duplicate the whole group
            from the actions menu below. A drag that starts inside a
            live selection moves it; a tap inside it toggles one
            object in or out. */}
        <div style={{fontSize:11,opacity:.75,marginTop:10,lineHeight:1.4}}>Area select: turn it on, then drag a yellow rectangle on the ground to select everything inside it — houses, trees, roads, decorations, whole town sections. Then Move, Rotate, Delete, or Duplicate the group below. Drag inside the yellow area to move it; tap an object inside it to toggle that one object in or out.</div>
        <button type="button" data-testid="build-area-select-toggle" onClick={buildIx.toggleAreaSelect} style={{display:'block',width:'100%',marginTop:10,padding:'12px 6px',borderRadius:9,border:'3px solid #ffd94d',background:areaSelectMode?'#8a6d1f':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Area select: {areaSelectMode?'On':'Off'}</button>
        {saveSelection&&<div style={{marginTop:10,padding:10,borderRadius:9,background:'#22392d',border:'1px solid #c4d1bd'}}>
          <div style={{fontSize:12}}>Area {(saveSelection.x1-saveSelection.x0+1)}×{(saveSelection.y1-saveSelection.y0+1)} · {saveSelection.count} placed item{saveSelection.count===1?'':'s'}</div>
          <input type="text" data-testid="build-chunk-name-input" value={chunkName} onChange={e=>setChunkName(e.target.value)} placeholder={'Chunk '+(templates.length+1)} style={{display:'block',width:'100%',marginTop:8,padding:'10px 8px',borderRadius:9,border:'1px solid #c4d1bd',background:'#172c23',color:'#fff',fontSize:14,boxSizing:'border-box'}} />
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button type="button" data-testid="build-chunk-save" onClick={()=>{const world=stateRef.current.world;const items=captureChunk(world,saveSelection);if(items.length===0){setMessage('Nothing placed in this area anymore');setSaveSelection(null);return;}const name=uniquifyName(templates.map(t=>t.name),chunkName);setTemplates(prev=>[...prev,{name,items}]);setSaveSelection(null);setChunkName('');setSaveAreaMode(false);buildRef.current={...buildRef.current,saveAreaMode:false};setMessage('Saved chunk \''+name+'\' ('+items.length+' item'+(items.length===1?'':'s')+')');}} style={{flex:1,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#526d42',color:'#fff',fontWeight:700,fontSize:14}}>Save chunk</button>
            <button type="button" data-testid="build-chunk-cancel" onClick={()=>{setSaveSelection(null);setChunkName('');}} style={{padding:'12px 14px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Cancel</button>
          </div>
        </div>}
        {/* BUILD 1037: AREA SELECT actions menu — appears when a
            selection is live. MOVE arms a drag (or drag inside the
            yellow area directly); ROTATE turns the whole group 90°
            around the selection centre (houses keep their door face
            rotating with them); DELETE removes exactly the selected
            items (two taps when there are more than 10); DUPLICATE
            arms a tap-to-place copy (the selection moves to the copy).
            Every action is ONE Undo step. The item list below is the
            per-object control — × drops one object from the group
            without touching the world. */}
        {areaSelection&&<div data-testid="build-area-menu" style={{marginTop:10,padding:10,borderRadius:9,background:'#22392d',border:'3px solid #ffd94d'}}>
          <div style={{fontSize:12,fontWeight:700}}>Area {(areaSelection.rect.x1-areaSelection.rect.x0+1)}×{(areaSelection.rect.y1-areaSelection.rect.y0+1)} · {selectionCount(areaSelection)} item{selectionCount(areaSelection)===1?'':'s'}</div>
          <div style={{fontSize:11,opacity:.75,marginTop:2}}>{(()=>{const c=selectionCounts(areaSelection);return [c.houses>0?'Houses '+c.houses:null,c.trees>0?'Trees '+c.trees:null,c.paths>0?'Paths '+c.paths:null,c.rocks>0?'Rocks '+c.rocks:null,c.walls>0?'Walls '+c.walls:null,c.placed>0?'Other placed '+c.placed:null].filter(Boolean).join(' · ');})()}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10}}>
            <button type="button" data-testid="build-area-move" onClick={()=>{if(!areaSelection)return;buildIx.setAreaMoveArmedBoth(!areaMoveArmed);buildIx.setAreaDuplicateArmedBoth(false);setAreaDeleteArmed(false);setMessage(areaMoveArmed?'Move cancelled':'Drag the yellow area to a new location — everything moves together, keeping its layout');}} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:areaMoveArmed?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Move</button>
            <button type="button" data-testid="build-area-duplicate" onClick={()=>{if(!areaSelection)return;buildIx.setAreaDuplicateArmedBoth(!areaDuplicateArmed);buildIx.setAreaMoveArmedBoth(false);setAreaDeleteArmed(false);setMessage(areaDuplicateArmed?'Duplicate cancelled':'Tap the ground to place a copy of the area — its corner lands on the tapped tile');}} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:areaDuplicateArmed?'#526d42':'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Duplicate</button>
            <button type="button" data-testid="build-area-rotate-ccw" onClick={()=>buildIx.doAreaRotate(-1)} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>⟲ Rotate left</button>
            <button type="button" data-testid="build-area-rotate-cw" onClick={()=>buildIx.doAreaRotate(1)} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:14}}>Rotate right ⟳</button>
          </div>
          <button type="button" data-testid="build-area-delete" onClick={()=>{if(!areaSelection)return;const n=selectionCount(areaSelection);if(n>10&&!areaDeleteArmed){setAreaDeleteArmed(true);setMessage('Delete '+n+' items? Tap Delete again to confirm — Undo restores them');return;}buildIx.doAreaDelete();}} style={{display:'block',width:'100%',marginTop:8,padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:areaDeleteArmed?'#7a3b2e':'#5a2e24',color:'#fff',fontWeight:700,fontSize:14}}>{areaDeleteArmed?'Tap again to confirm delete':'Delete area'}</button>
          {/* BUILD 1042: Town Builder Stage 5 — LAYOUT HELPERS. Optional
            tools, nothing moves unless you tap one: each button runs
            its helper on this selection only, as one Undo step. Doors
            face paths turns each selected house (in place) so its door
            faces the nearest road or path. Trees off paths moves trees
            standing on a path to the nearest clear tile beside it.
            Lanterns along roads puts a lantern on the road's edge
            every few tiles. Fence property puts a low wooden fence
            around each selected house, with a gap at the door. Align
            row / Align column line the selected items up. ENHANCE
            fills empty ground with grass, bushes, and the odd tree —
            it never moves or removes anything. Spread out / Pack
            together move the selected items one tile apart / together.
            Scale, elevation, tree rotation, and vegetation size are
            NOT here — there is no per-item size feature yet, so those
            stay pending and are not faked. */}
          <div style={{marginTop:10,borderTop:'1px solid #c4d1bd',paddingTop:10}}>
            <div style={{fontSize:12,fontWeight:700}}>Layout helpers — optional tools, nothing moves unless you tap one</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
              <button type="button" data-testid="build-layout-doors" onClick={()=>buildIx.runLayoutHelper(doorsFacePaths,'Doors already face the nearest path')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Doors face paths</button>
              <button type="button" data-testid="build-layout-trees" onClick={()=>buildIx.runLayoutHelper(treesOffPaths,'No trees standing on paths here')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Trees off paths</button>
              <button type="button" data-testid="build-layout-lanterns" onClick={()=>buildIx.runLayoutHelper(lanternsAlongRoads,'No lanterns fit along these roads')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Lanterns along roads</button>
              <button type="button" data-testid="build-layout-fence" onClick={()=>buildIx.runLayoutHelper(fencesAroundProperty,'No fence fits around these houses')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Fence property</button>
              <button type="button" data-testid="build-layout-align-row" onClick={()=>buildIx.runLayoutHelper((w,s,pt,nt)=>alignArea(w,s,'row',pt,nt),'Already aligned to a row')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Align row</button>
              <button type="button" data-testid="build-layout-align-col" onClick={()=>buildIx.runLayoutHelper((w,s,pt,nt)=>alignArea(w,s,'col',pt,nt),'Already aligned to a column')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Align column</button>
              <button type="button" data-testid="build-layout-enhance" onClick={()=>buildIx.runLayoutHelper(enhanceArea,'Nothing to enhance here — the ground is already full')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>ENHANCE</button>
              <button type="button" data-testid="build-layout-spread" onClick={()=>buildIx.runLayoutHelper((w,s,pt,nt)=>adjustSpacing(w,s,'spread',pt,nt),'Nothing moved')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Spread out</button>
              <button type="button" data-testid="build-layout-pack" onClick={()=>buildIx.runLayoutHelper((w,s,pt,nt)=>adjustSpacing(w,s,'pack',pt,nt),'Nothing moved')} style={{padding:'12px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Pack together</button>
            </div>
            <div style={{fontSize:11,opacity:.75,marginTop:6,lineHeight:1.4}}>Each helper acts only on this selection, and one Undo undoes the whole thing. Scale, elevation, tree rotation, and vegetation size cannot change yet — there is no per-item size feature — so those are not here.</div>
          </div>
          {areaSelection.notes.length>0&&<div style={{fontSize:11,opacity:.75,marginTop:6,lineHeight:1.4}}>{areaSelection.notes.join(' · ')}</div>}
          <div style={{marginTop:10}}>
            <div style={{fontSize:11,opacity:.75}}>Items in this area — tap × to drop one from the group (the world is untouched):</div>
            {selectionItems(areaSelection).map((it,i)=>{
              const label=selectionItemLabel(it);
              const key=label+'|'+i;
              return <div key={key} style={{display:'flex',alignItems:'center',gap:8,marginTop:4,fontSize:12}}>
                <span style={{flex:1}}>{label}</span>
                <button type="button" data-testid="build-area-item-remove" aria-label={'Remove '+label+' from selection'} onClick={()=>{if(!areaSelection)return;const next=excludeItem(areaSelection,it);const after=selectionCount(next);if(after===0){buildIx.clearAreaSelection();setMessage('Selection cleared — nothing left in it');}else{setAreaSelection(next);setAreaDeleteArmed(false);const lab=areaSelectPreviewLabelRef.current;if(lab)lab.textContent='Area '+(next.rect.x1-next.rect.x0+1)+'×'+(next.rect.y1-next.rect.y0+1)+' · '+after+' item'+(after===1?'':'s');setMessage('Removed '+label+' from the area ('+after+' items)');}}} style={{padding:'4px 10px',borderRadius:8,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>×</button>
              </div>;
            })}
          </div>
          <button type="button" data-testid="build-area-clear" onClick={()=>{buildIx.clearAreaSelection();setMessage('Area selection cleared');}} style={{display:'block',width:'100%',marginTop:10,padding:'10px 6px',borderRadius:9,border:'1px solid #c4d1bd',background:'#22392d',color:'#fff',fontWeight:700,fontSize:13}}>Clear selection</button>
        </div>}
        {templates.length===0
          ? <div style={{fontSize:12,opacity:.7,marginTop:10}}>No saved chunks yet.</div>
          : <div style={{marginTop:10}}>{templates.map(t=><div key={t.name} style={{display:'flex',gap:8,marginTop:6}}>
              <button type="button" data-testid="build-chunk-paste" onClick={()=>{const next=pasteName===t.name?null:t.name;setPasteName(next);if(next){setPalette(null);setCustomSelection(null);setRemoveMode(false);setSaveAreaMode(false);setAreaSelectMode(false);setAreaMoveArmed(false);setAreaDuplicateArmed(false);}buildRef.current={palette:next?null:palette,removeMode:next?false:removeMode,moveMode:buildRef.current.moveMode,saveAreaMode:next?false:saveAreaMode,pasteName:next,customAssetId:next?null:buildRef.current.customAssetId,areaSelectMode:next?false:areaSelectMode,areaMoveArmed:next?false:areaMoveArmed,areaDuplicateArmed:next?false:areaDuplicateArmed};if(!next){const el=placePreviewRef.current;if(el)el.style.display='none';placeHoverRef.current=null;}setMessage(next?'Tap the ground to paste \''+t.name+'\' — its corner lands on the tapped tile. Tap the chunk again to stop.':'Stopped pasting');}} style={{flex:1,padding:'10px 8px',borderRadius:9,border:'1px solid #c4d1bd',background:pasteName===t.name?'#526d42':'#22392d',color:'#fff',fontWeight:pasteName===t.name?700:500,fontSize:13,textAlign:'left'}}>{t.name} <span style={{opacity:.75}}>({t.items.length} item{t.items.length===1?'':'s'})</span></button>
              <button type="button" data-testid="build-chunk-delete" aria-label={'Delete '+t.name} onClick={()=>{setTemplates(prev=>prev.filter(x=>x.name!==t.name));if(pasteName===t.name){setPasteName(null);buildRef.current={...buildRef.current,pasteName:null};}setMessage('Deleted chunk \''+t.name+'\'');}} style={{padding:'10px 12px',borderRadius:9,border:'1px solid #c4d1bd',background:'#7a3b2e',color:'#fff',fontWeight:700,fontSize:13}}>×</button>
            </div>)}</div>}
      </div>
      <div data-testid="build-count" style={{fontSize:12,opacity:.85,marginTop:10}}>Placed: {placedCount}</div>
      <div style={{fontSize:11,opacity:.7,marginTop:6,lineHeight:1.4}}>Houses have interiors now — stand by a door and tap Enter to step inside; Exit returns you to the doorstep. While inside, Build placement and removal are paused (taps move only). Placed items show in 3D mode; the 2.5D view does not show them yet.</div>
    </div>}
    </>
  );
}
