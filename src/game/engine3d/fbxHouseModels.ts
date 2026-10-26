/**
 * Runtime loader for the actual low-poly medieval house FBX pack.
 *
 * The main game renderer remains its existing lightweight WebGL renderer.
 * Three.js and FBXLoader are bundled locally with the app. This avoids
 * external-module/CORS failures on mobile browsers and GitHub Pages. Parsed geometry is converted into
 * normalized triangles with their real FBX diffuse texture colours baked from UVs, so the existing renderer can draw them.
 * If the remote loader or a model fails, the game keeps its procedural house.
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export type PackedHouseTriangles = Float32Array;

const HOUSE_FILES = [
  'House_01_full.fbx',
  'House_02_full.fbx',
  'House_03_full.fbx',
  'House_04_full.fbx',
  'house_05_full.fbx',
  'house_06_full.fbx',
  'house_07_full.fbx',
  'house_08_full.fbx',
  'House_09_full.fbx',
  'House_10_full.fbx',
  'house_11_full.fbx',
  'House_12_full.fbx',
  'House_13_full.fbx',
  'house_14_full.fbx',
  'house_15_full.fbx',
  'House_16_full.fbx',
  'House_17_full.fbx',
  'House_18_Full.fbx',
  'House_19_full.fbx',
  'house_20_full.fbx',
] as const;

const houseModels: Array<PackedHouseTriangles | undefined> = new Array(HOUSE_FILES.length);
let loadPromise: Promise<number> | undefined;
let houseLibrarySettled = false;

/** True only after every FBX has either loaded or failed, preventing fallback meshes flashing in first. */
export function isHouseModelLibrarySettled(): boolean {
  return houseLibrarySettled;
}

export function getHouseModelTriangles(index: number): PackedHouseTriangles | undefined {
  return houseModels[((index % HOUSE_FILES.length) + HOUSE_FILES.length) % HOUSE_FILES.length];
}

function packFbxObject(root: any, THREE: any, modelIndex: number): Float32Array {
  root.updateMatrixWorld(true);
  // The lightweight world renderer accepts vertex colours, so sample each
  // FBX material's real diffuse texture at the mesh UVs before packing. This
  // preserves the uploaded house atlas/material appearance without replacing
  // the established renderer or requiring a second scene renderer.
  const pixelCache = new WeakMap<object, { data: Uint8ClampedArray; width: number; height: number }>();
  const texturePixel = (material: any, uv: any): { r:number; g:number; b:number } | undefined => {
    const image = material?.map?.image;
    if (!image || !uv || !(image.width || image.videoWidth) || !(image.height || image.videoHeight)) return;
    try {
      let pixels = pixelCache.get(image);
      if (!pixels) {
        const width = image.width || image.videoWidth, height = image.height || image.videoHeight;
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, width, height);
        pixels = { data: context.getImageData(0, 0, width, height).data, width, height };
        pixelCache.set(image, pixels);
      }
      const repeat = material.map?.repeat;
      const offset = material.map?.offset;
      const u = (((uv.x * (repeat?.x ?? 1) + (offset?.x ?? 0)) % 1) + 1) % 1;
      const v = (((uv.y * (repeat?.y ?? 1) + (offset?.y ?? 0)) % 1) + 1) % 1;
      const x = Math.min(pixels.width - 1, Math.floor(u * pixels.width));
      const y = Math.min(pixels.height - 1, Math.floor((1 - v) * pixels.height));
      const at = (y * pixels.width + x) * 4;
      if (pixels.data[at + 3] < 16) return;
      return { r: pixels.data[at] / 255, g: pixels.data[at + 1] / 255, b: pixels.data[at + 2] / 255 };
    } catch {
      // Cross-origin or unsupported images safely fall back to material colours.
      return;
    }
  };
  const raw: Array<{ x:number; y:number; z:number; r:number; g:number; b:number }> = [];
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  const addVertex=(v:any,color:any)=>{
    const p=v.clone();
    const x=p.x,y=p.y,z=p.z;
    minX=Math.min(minX,x);minY=Math.min(minY,y);minZ=Math.min(minZ,z);
    maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);maxZ=Math.max(maxZ,z);
    raw.push({x,y,z,r:color.r,g:color.g,b:color.b});
  };
  root.traverse((object:any)=>{
    if(!object.isMesh||!object.geometry?.attributes?.position)return;
    const geometry=object.geometry;
    const position=geometry.attributes.position;
    const index=geometry.index;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    const wallPalettes = [
      {r:0.78,g:0.66,b:0.48}, {r:0.72,g:0.78,b:0.67}, {r:0.72,g:0.58,b:0.48},
      {r:0.63,g:0.73,b:0.79}, {r:0.82,g:0.74,b:0.57}, {r:0.70,g:0.65,b:0.78},
      {r:0.78,g:0.62,b:0.64}, {r:0.61,g:0.72,b:0.56}
    ];
    const roofPalettes = [
      {r:0.58,g:0.16,b:0.12}, {r:0.30,g:0.35,b:0.40}, {r:0.48,g:0.25,b:0.12},
      {r:0.25,g:0.32,b:0.22}, {r:0.43,g:0.18,b:0.24}, {r:0.34,g:0.29,b:0.22}
    ];
    const materialColor=(groupIndex:number)=>{
      const material=materials[groupIndex]||materials[0];
      const color=material?.color;
      const name=String(material?.name||'').toLowerCase();
      // The custom WebGL renderer stores vertex colours, not FBX texture maps.
      // Many of the uploaded FBX materials are white because their original
      // appearance lives in a texture atlas. Never bake that white placeholder
      // into the game mesh: give texture-backed/white materials a readable
      // medieval palette based on their material names instead.
      const palette =
        /roof|tile|shingle/.test(name) ? roofPalettes[modelIndex % roofPalettes.length] :
        /wood|beam|door|timber|frame/.test(name) ? {r:0.24,g:0.15,b:0.09} :
        /stone|brick|chimney|foundation/.test(name) ? {r:0.52,g:0.49,b:0.43} :
        /glass|window/.test(name) ? {r:0.20,g:0.48,b:0.72} :
        /dark|shadow|iron|metal/.test(name) ? {r:0.16,g:0.17,b:0.19} :
        wallPalettes[modelIndex % wallPalettes.length];
      if(color && Math.min(color.r,color.g,color.b) < 0.88) return {r:color.r,g:color.g,b:color.b};
      return palette;
    };
    const groups=geometry.groups?.length?geometry.groups:[{start:0,count:index?index.count:position.count,materialIndex:0}];
    for(const group of groups){
      const material=materials[group.materialIndex||0]||materials[0];
      const fallbackColor=materialColor(group.materialIndex||0);
      const uvAttribute=geometry.attributes.uv;
      const end=group.start+group.count;
      for(let i=group.start;i+2<end;i+=3){
        const points:number[]=[];
        const vertices:any[]=[];
        const uvs:any[]=[];
        for(let j=0;j<3;j++){
          const at=index?index.getX(i+j):i+j;
          const v=new THREE.Vector3(position.getX(at),position.getY(at),position.getZ(at)).applyMatrix4(object.matrixWorld);
          vertices.push(v);
          points.push(v.x,v.y,v.z);
          uvs.push(uvAttribute ? new THREE.Vector2(uvAttribute.getX(at), uvAttribute.getY(at)) : undefined);
        }
        // Some of the uploaded FBXs reference external texture atlases that
        // are not included alongside the FBX. If a neutral/white material has
        // no readable texture, shade the actual model geometry by face angle
        // so roof planes, walls and ground-facing surfaces remain distinct
        // instead of collapsing into one tan silhouette.
        const ab=vertices[1].clone().sub(vertices[0]);
        const ac=vertices[2].clone().sub(vertices[0]);
        const normal=ab.cross(ac).normalize();
        const colorIsNeutral=!material?.color ||
          (Math.max(material.color.r,material.color.g,material.color.b)-Math.min(material.color.r,material.color.g,material.color.b)<0.2);
        let faceFallback=fallbackColor;
        const materialName=String(material?.name||'').toLowerCase();
        // Use a deliberately colourful painted medieval palette in the
        // lightweight renderer. The uploaded atlas is not consistently mapped
        // across all 20 FBXs, and sampling it was washing every house to tan.
        if(/roof|tile|shingle/.test(materialName) || Math.abs(normal.y)>0.42) {
          faceFallback=roofPalettes[modelIndex % roofPalettes.length];
        } else if(/glass|window/.test(materialName)) {
          faceFallback={r:0.20,g:0.48,b:0.72};
        } else if(/wood|beam|door|timber|frame/.test(materialName)) {
          faceFallback={r:0.24,g:0.15,b:0.09};
        } else if(/stone|brick|chimney|foundation/.test(materialName)) {
          faceFallback={r:0.52,g:0.49,b:0.43};
        } else if(colorIsNeutral || material?.map?.image) {
          faceFallback=wallPalettes[modelIndex % wallPalettes.length];
          if(Math.abs(normal.y)<0.12) faceFallback=wallPalettes[modelIndex % wallPalettes.length];
        }
        // The canvas renderer has flat vertex-colour triangles, not texture sampling.
        // Sampling a different atlas texel at each corner creates ugly colour
        // gradients and speckled seams across a single face. Use one stable
        // representative texel per face so the uploaded atlas gives coherent
        // wall/roof colours without the glitchy vertex interpolation.
        const validUvs = uvs.filter((uv:any) => uv);
        let sampled: {r:number;g:number;b:number} | undefined;
        if(validUvs.length === 3) {
          const centerUv = new THREE.Vector2(
            (validUvs[0].x + validUvs[1].x + validUvs[2].x) / 3,
            (validUvs[0].y + validUvs[1].y + validUvs[2].y) / 3
          );
          sampled = texturePixel(material, centerUv);
        }
        // The atlas is retained and loaded for compatibility, but avoid its
        // unreliable FBX UV mapping here; use the intentional per-model palette.
        const faceColor = faceFallback;
        for(let j=0;j<3;j++) addVertex(vertices[j], faceColor);
      }
    }
  });
  if(!raw.length||!Number.isFinite(minX)||maxX-minX<1e-5||maxY-minY<1e-5||maxZ-minZ<1e-5) return new Float32Array();
  // Keep source proportions: independently normalizing X, Y and Z squashes
  // real houses into identical boxes and makes imported meshes look mangled.
  const span=Math.max(maxX-minX,maxZ-minZ);
  const centerX=(minX+maxX)/2,centerZ=(minZ+maxZ)/2;
  const packed=new Float32Array(raw.length*6);
  for(let i=0;i<raw.length;i++){
    const v=raw[i],o=i*6;
    packed[o]=0.5+(v.x-centerX)/span;
    packed[o+1]=(v.y-minY)/span;
    packed[o+2]=0.5+(v.z-centerZ)/span;
    packed[o+3]=Math.max(0,Math.min(1,v.r));
    packed[o+4]=Math.max(0,Math.min(1,v.g));
    packed[o+5]=Math.max(0,Math.min(1,v.b));
  }
  return packed;
}

export function loadHouseModelLibrary(): Promise<number> {
  if(loadPromise)return loadPromise;
  loadPromise=(async()=>{
    const loader=new FBXLoader();
    let atlas: any;
    try {
      // The uploaded source pack includes its shared texture atlas. FBXLoader
      // can miss the original relative texture path on GitHub Pages, so load
      // the atlas explicitly and attach it to materials that lost their map.
      const atlasUrl = `${import.meta.env.BASE_URL}game%20sprites/starting%20house/House_texture_atlas.png`;
      atlas = await new THREE.TextureLoader().loadAsync(atlasUrl);
      atlas.colorSpace = THREE.SRGBColorSpace;
      atlas.needsUpdate = true;
    } catch (error) {
      console.warn('[Adventure 3D] House texture atlas could not be loaded', error);
    }
    let loaded=0;
    for(let i=0;i<HOUSE_FILES.length;i++){
      try{
        const url=`${import.meta.env.BASE_URL}3d-houses/${HOUSE_FILES[i]}`;
        const object=await loader.loadAsync(url);
        if (atlas) {
          object.traverse((part: any) => {
            if (!part.isMesh) return;
            const materials = Array.isArray(part.material) ? part.material : [part.material];
            for (const material of materials) {
              // FBXLoader can leave a map object behind whose image did not
              // resolve from the original authoring-machine path. Treat that
              // the same as a missing map and use the bundled atlas instead.
              if (material && !material.map?.image) {
                material.map = atlas;
                material.needsUpdate = true;
              }
            }
          });
        }
        const packed=packFbxObject(object,THREE,i);
        if(packed.length){houseModels[i]=packed;loaded++;}
      }catch(error){
        console.warn('[Adventure 3D] Failed to load house model '+HOUSE_FILES[i],error);
      }
    }
    houseLibrarySettled = true;
    return loaded;
  })().catch((error) => {
    houseLibrarySettled = true;
    throw error;
  });
  return loadPromise;
}
