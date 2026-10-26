/**
 * Runtime loader for the actual low-poly medieval house FBX pack.
 *
 * The main game renderer remains its existing lightweight WebGL renderer.
 * FBXLoader is loaded lazily from esm.sh so the normal app bundle does not
 * gain a large 3D-engine dependency. The parsed geometry is converted into
 * normalized, flat-shaded triangles that the existing renderer can draw.
 * If the remote loader or a model fails, the game keeps its procedural house.
 */
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
] as const;

const houseModels: Array<PackedHouseTriangles | undefined> = new Array(HOUSE_FILES.length);
let loadPromise: Promise<number> | undefined;

export function getHouseModelTriangles(index: number): PackedHouseTriangles | undefined {
  return houseModels[((index % HOUSE_FILES.length) + HOUSE_FILES.length) % HOUSE_FILES.length];
}

function packFbxObject(root: any, THREE: any): Float32Array {
  root.updateMatrixWorld(true);
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
    const materialColor=(groupIndex:number)=>{
      const material=materials[groupIndex]||materials[0];
      const color=material?.color;
      if(color)return {r:color.r,g:color.g,b:color.b};
      return {r:0.58,g:0.47,b:0.35};
    };
    const groups=geometry.groups?.length?geometry.groups:[{start:0,count:index?index.count:position.count,materialIndex:0}];
    for(const group of groups){
      const color=materialColor(group.materialIndex||0);
      const end=group.start+group.count;
      for(let i=group.start;i+2<end;i+=3){
        for(let j=0;j<3;j++){
          const at=index?index.getX(i+j):i+j;
          const v=new THREE.Vector3(position.getX(at),position.getY(at),position.getZ(at)).applyMatrix4(object.matrixWorld);
          addVertex(v,color);
        }
      }
    }
  });
  if(!raw.length||!Number.isFinite(minX)||maxX-minX<1e-5||maxY-minY<1e-5||maxZ-minZ<1e-5) return new Float32Array();
  const sx=maxX-minX,sy=maxY-minY,sz=maxZ-minZ;
  const packed=new Float32Array(raw.length*6);
  for(let i=0;i<raw.length;i++){
    const v=raw[i],o=i*6;
    packed[o]=(v.x-minX)/sx;
    packed[o+1]=(v.y-minY)/sy;
    packed[o+2]=(v.z-minZ)/sz;
    packed[o+3]=Math.max(0,Math.min(1,v.r));
    packed[o+4]=Math.max(0,Math.min(1,v.g));
    packed[o+5]=Math.max(0,Math.min(1,v.b));
  }
  return packed;
}

export function loadHouseModelLibrary(): Promise<number> {
  if(loadPromise)return loadPromise;
  loadPromise=(async()=>{
    // Variable URLs with Vite's ignore directive intentionally keep these
    // optional runtime imports out of the compile-time module graph.
    const threeUrl='https://esm.sh/three@0.180.0';
    const loaderUrl='https://esm.sh/three@0.180.0/examples/jsm/loaders/FBXLoader.js';
    const THREE=await import(/* @vite-ignore */ threeUrl);
    const loaderModule=await import(/* @vite-ignore */ loaderUrl);
    const loader=new loaderModule.FBXLoader();
    let loaded=0;
    for(let i=0;i<HOUSE_FILES.length;i++){
      try{
        const url=`${import.meta.env.BASE_URL}3d-houses/${HOUSE_FILES[i]}`;
        const object=await loader.loadAsync(url);
        const packed=packFbxObject(object,THREE);
        if(packed.length){houseModels[i]=packed;loaded++;}
      }catch(error){
        console.warn('[Adventure 3D] Failed to load house model '+HOUSE_FILES[i],error);
      }
    }
    return loaded;
  })();
  return loadPromise;
}
