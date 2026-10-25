/**
 * Contract for the independent 3D renderer.
 *
 * This module intentionally has no dependency on the existing 2D/2.5D
 * renderers. The application shell can load a concrete implementation lazily
 * and hand it a read-only snapshot of shared world state.
 */
export type GraphicsMode = '2d' | '2.5d' | '3d';

export interface WorldSnapshot {
  readonly revision: number;
  readonly player?: {
    readonly x: number;
    readonly y: number;
    readonly z?: number;
  };
  readonly tiles?: readonly unknown[];
  readonly entities?: readonly unknown[];
}

export interface Engine3DOptions {
  readonly canvas: HTMLCanvasElement;
  readonly getWorldSnapshot: () => WorldSnapshot;
  readonly onWorldAction?: (action: WorldAction3D) => void;
}

export type WorldAction3D =
  | { readonly type: 'move-player'; readonly x: number; readonly y: number }
  | { readonly type: 'interact'; readonly entityId: string };

export interface Engine3D {
  /** Initialize graphics and attach engine-owned listeners/resources. */
  start(): Promise<void>;
  /** Release listeners, GPU resources, and animation work. Safe to call once. */
  dispose(): void;
  /** True while the 3D engine owns an active rendering context. */
  isRunning(): boolean;
}

/**
 * The concrete WebGL/Three.js implementation is intentionally separate from
 * this contract. Do not import or modify the 2D/2.5D renderer from this module.
 */
export type Engine3DFactory = (options: Engine3DOptions) => Engine3D;

export const GRAPHICS_MODE_OPTIONS: ReadonlyArray<{
  value: GraphicsMode;
  label: string;
}> = [
  { value: '2d', label: '2D' },
  { value: '2.5d', label: '2.5D' },
  { value: '3d', label: '3D (experimental)' },
];
