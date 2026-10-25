import { useEffect, useRef, useState } from 'react';

/** Isolated WebGL test scene. It does not touch either legacy renderer. */
export default function Engine3DView({ onExit }: { onExit?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // iOS Safari can still scroll the document behind a fixed canvas unless the page
    // itself is locked while this full-screen mode is mounted.
    const html = document.documentElement;
    const body = document.body;
    const previousHtml = { overflow: html.style.overflow, touchAction: html.style.touchAction, overscrollBehavior: html.style.overscrollBehavior };
    const previousBody = { overflow: body.style.overflow, touchAction: body.style.touchAction, overscrollBehavior: body.style.overscrollBehavior, position: body.style.position, width: body.style.width };
    html.style.overflow = 'hidden'; html.style.touchAction = 'none'; html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden'; body.style.touchAction = 'none'; body.style.overscrollBehavior = 'none'; body.style.position = 'fixed'; body.style.width = '100%';
    const stopPageTouch = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
    const stopGesture = (e: Event) => e.preventDefault();
    window.addEventListener('touchmove', stopPageTouch, { passive: false });
    window.addEventListener('gesturestart', stopGesture, { passive: false });
    window.addEventListener('gesturechange', stopGesture, { passive: false });
    const gl = canvas.getContext('webgl', { antialias: true });
    if (!gl) { setError('WebGL is unavailable on this device.'); return; }
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, 'attribute vec3 p; attribute vec3 c; uniform mat4 m; varying vec3 v; void main(){gl_Position=m*vec4(p,1.0);v=c;}');
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, 'precision mediump float; varying vec3 v; void main(){gl_FragColor=vec4(v,1.0);}');
    gl.compileShader(fs);
    const program = gl.createProgram()!;
    gl.attachShader(program,vs); gl.attachShader(program,fs); gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) { setError(gl.getProgramInfoLog(program)||'WebGL setup failed'); return; }
    const data:number[]=[];
    const tri=(a:number[],b:number[],c:number[],color:number[])=>{for(const p of [a,b,c])data.push(...p,...color);};
    const quad=(a:number[],b:number[],c:number[],d:number[],color:number[])=>{tri(a,b,c,color);tri(a,c,d,color);};
    // Ground plane divided into alternating grass tiles.
    for(let x=-14;x<14;x++) for(let z=-14;z<14;z++) {
      const y=-0.08, col=((x+z)&1)?[0.23,0.39,0.22]:[0.28,0.44,0.25];
      quad([x,y,z],[x+1,y,z],[x+1,y,z+1],[x,y,z+1],col);
    }
    // A stone road through the test clearing.
    for(let z=-14;z<14;z++) for(let x=-1;x<=1;x++) {
      const px=x+Math.sin(z*.2)*1.4;
      quad([px,.01,z],[px+1,.01,z],[px+1,.01,z+1],[px,.01,z+1],[.45,.43,.36]);
    }
    const cube=(cx:number,cy:number,cz:number,sx:number,sy:number,sz:number,color:number[])=>{
      const x0=cx-sx/2,x1=cx+sx/2,y0=cy-sy/2,y1=cy+sy/2,z0=cz-sz/2,z1=cz+sz/2;
      quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],color);
      quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],color.map(v=>v*.75));
      quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],color.map(v=>v*.85));
      quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],color.map(v=>v*.7));
      quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],color.map(v=>Math.min(1,v*1.15)));
      quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],color.map(v=>v*.55));
    };
    const treePositions: Array<[number, number]> = [[-5,-4],[-7,2],[5,-5],[7,3],[-5,7],[6,8],[3,-9]];
    for(const [x,z] of treePositions){
      cube(x,.7,z,.3,1.4,.3,[.36,.23,.12]);cube(x,1.7,z,1.15,1.25,1.15,[.12,.38,.16]);
    }
    const world=new Float32Array(data);
    // Keep immutable terrain in its own GPU buffer; only the player mesh changes each frame.
    const worldBuffer=gl.createBuffer()!;
    const playerBuffer=gl.createBuffer()!;
    const pLoc=gl.getAttribLocation(program,'p'),cLoc=gl.getAttribLocation(program,'c'),mLoc=gl.getUniformLocation(program,'m');
    gl.bindBuffer(gl.ARRAY_BUFFER,worldBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,world,gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(.48,.67,.82,1);
    let px=0,pz=0,yaw=.55,pitch=.72,zoom=11,drag=false,lx=0,ly=0,raf=0,disposed=false;
    const keys=new Set<string>();
    const movementKeys=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
    const keydown=(e:KeyboardEvent)=>{const key=e.key.toLowerCase();if(movementKeys.has(key)){e.preventDefault();keys.add(key);}},keyup=(e:KeyboardEvent)=>keys.delete(e.key.toLowerCase());
    const down=(e:PointerEvent)=>{drag=true;lx=e.clientX;ly=e.clientY;canvas.setPointerCapture?.(e.pointerId);e.preventDefault();};
    const move=(e:PointerEvent)=>{if(!drag)return;e.preventDefault();yaw-=(e.clientX-lx)*.006;pitch=Math.max(.18,Math.min(1.4,pitch+(e.clientY-ly)*.005));lx=e.clientX;ly=e.clientY;};
    const up=(e?:PointerEvent)=>{drag=false;if(e?.pointerId!==undefined&&canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);};
    // Explicit camera controls remain usable in embedded previews where touch gestures
    // may be intercepted by the host container before reaching the canvas.
    const cameraStep=(direction:'up'|'down'|'left'|'right')=>{if(direction==='up')pitch=Math.max(.18,pitch-.09);if(direction==='down')pitch=Math.min(1.4,pitch+.09);if(direction==='left')yaw-=.12;if(direction==='right')yaw+=.12;};
    const wheel=(e:WheelEvent)=>{e.preventDefault();e.stopPropagation();zoom=Math.max(4,Math.min(22,zoom+e.deltaY*.012));};
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});
    const perspective=(f:number,a:number,n:number,far:number)=>{const t=1/Math.tan(f/2),nf=1/(n-far);return [t/a,0,0,0,0,t,0,0,0,0,(far+n)*nf,-1,0,0,2*far*n*nf,0];};
    const view=(eye:number[],center:number[])=>{
      const norm=(v:number[])=>{const l=Math.hypot(...v)||1;return v.map(q=>q/l);};
      const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
      const sub=(a:number[],b:number[])=>a.map((q,i)=>q-b[i]);
      const z=norm(sub(eye,center)),x=norm(cross([0,1,0],z)),y=cross(z,x);
      return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x.reduce((s,q,i)=>s+q*eye[i],0),-y.reduce((s,q,i)=>s+q*eye[i],0),-z.reduce((s,q,i)=>s+q*eye[i],0),1];
    };
    const mul=(a:number[],b:number[])=>{const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;};
    const frame=()=>{
      if(disposed)return;
      const ratio=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.floor(canvas.clientWidth*ratio)),h=Math.max(1,Math.floor(canvas.clientHeight*ratio));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);
      const s=.11;
      let dx=0,dz=0;
      if(keys.has('w')||keys.has('arrowup')){dx-=Math.sin(yaw)*s;dz-=Math.cos(yaw)*s;}
      if(keys.has('s')||keys.has('arrowdown')){dx+=Math.sin(yaw)*s;dz+=Math.cos(yaw)*s;}
      if(keys.has('a')||keys.has('arrowleft')){dx-=Math.cos(yaw)*s;dz+=Math.sin(yaw)*s;}
      if(keys.has('d')||keys.has('arrowright')){dx+=Math.cos(yaw)*s;dz-=Math.sin(yaw)*s;}
      // Keep the prototype player on the ground plane and prevent walking through trees.
      const canOccupy=(x:number,z:number)=>{
        if(x < -13.4 || x > 13.4 || z < -13.4 || z > 13.4) return false;
        return treePositions.every(([tx,tz])=>Math.hypot(x-tx,z-tz)>.78);
      };
      if(canOccupy(px+dx,pz)) px+=dx;
      if(canOccupy(px,pz+dz)) pz+=dz;
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
      const eye=[px+Math.sin(yaw)*Math.cos(pitch)*zoom,Math.sin(pitch)*zoom+2,pz+Math.cos(yaw)*Math.cos(pitch)*zoom];
      gl.uniformMatrix4fv(mLoc,false,new Float32Array(mul(perspective(Math.PI/3,w/h,.1,120),view(eye,[px,0,pz]))));
      gl.bindBuffer(gl.ARRAY_BUFFER,worldBuffer);
      gl.enableVertexAttribArray(pLoc);gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(cLoc);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);gl.drawArrays(gl.TRIANGLES,0,world.length/6);
      data.length=0;cube(px,.75,pz,.55,1.5,.55,[.95,.72,.2]);
      gl.bindBuffer(gl.ARRAY_BUFFER,playerBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);gl.drawArrays(gl.TRIANGLES,0,data.length/6);
      raf=requestAnimationFrame(frame);
    };
    raf=requestAnimationFrame(frame);
    return ()=>{disposed=true;cancelAnimationFrame(raf);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('touchmove',stopPageTouch);window.removeEventListener('gesturestart',stopGesture);window.removeEventListener('gesturechange',stopGesture);html.style.overflow=previousHtml.overflow;html.style.touchAction=previousHtml.touchAction;html.style.overscrollBehavior=previousHtml.overscrollBehavior;body.style.overflow=previousBody.overflow;body.style.touchAction=previousBody.touchAction;body.style.overscrollBehavior=previousBody.overscrollBehavior;body.style.position=previousBody.position;body.style.width=previousBody.width;canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',wheel);gl.deleteBuffer(worldBuffer);gl.deleteBuffer(playerBuffer);gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);};
  },[]);
  return <div style={{position:'fixed',inset:0,zIndex:20000,background:'#18251d',color:'white',fontFamily:'system-ui,sans-serif',overflow:'hidden',touchAction:'none',overscrollBehavior:'none',userSelect:'none',WebkitUserSelect:'none'}}>
    <canvas ref={canvasRef} aria-label="Adventure 3D test scene" style={{width:'100%',height:'100%',display:'block',touchAction:'none',overscrollBehavior:'none',userSelect:'none',WebkitUserSelect:'none',WebkitTapHighlightColor:'transparent'}}/>
    <div style={{position:'absolute',top:12,left:12,right:12,display:'flex',alignItems:'center',gap:8,pointerEvents:'none'}}>
      <strong style={{background:'#101913dd',padding:'9px 12px',borderRadius:8}}>Adventure · 3D Experimental</strong><span style={{background:'#101913dd',padding:'9px 12px',borderRadius:8,fontSize:12}}>WebGL prototype</span><span style={{flex:1}}/>
      {onExit&&<button onClick={onExit} style={{pointerEvents:'auto',padding:'10px 14px',border:0,borderRadius:8,background:'#f1c75b',fontWeight:700}}>Exit 3D</button>}
    </div>
    <div style={{position:'absolute',right:12,bottom:76,display:'grid',gridTemplateColumns:'repeat(3,46px)',gridTemplateRows:'repeat(2,46px)',gap:6,pointerEvents:'auto',touchAction:'none',userSelect:'none',WebkitUserSelect:'none'}} onContextMenu={(e)=>e.preventDefault()}>
      <span />
      {(['up'] as const).map(dir=><button key={dir} aria-label="Camera look up" onPointerDown={e=>{e.preventDefault();e.stopPropagation();cameraStep(dir);}} style={{gridColumn:2,gridRow:1,width:46,height:46,border:0,borderRadius:10,background:'#101913dd',color:'white',fontSize:22,touchAction:'none',userSelect:'none',WebkitUserSelect:'none'}}>↑</button>)}
      {(['left','down','right'] as const).map((dir,i)=><button key={dir} aria-label={'Camera look '+dir} onPointerDown={e=>{e.preventDefault();e.stopPropagation();cameraStep(dir);}} style={{gridColumn:i+1,gridRow:2,width:46,height:46,border:0,borderRadius:10,background:'#101913dd',color:'white',fontSize:22,touchAction:'none',userSelect:'none',WebkitUserSelect:'none'}}>{dir==='left'?'←':dir==='down'?'↓':'→'}</button>)}
    </div>
    <div style={{position:'absolute',bottom:12,left:12,maxWidth:340,padding:12,borderRadius:8,background:'#101913dd',fontSize:13,lineHeight:1.5}}>WASD / arrows: move · Drag: orbit camera · Scroll: zoom<br/><span style={{opacity:.8}}>Isolated renderer test scene. Existing 2D/2.5D are unchanged; gameplay systems are not connected yet.</span></div>
    {error&&<div role="alert" style={{position:'absolute',left:'8%',right:'8%',top:'30%',padding:18,background:'#301d1d',borderRadius:10}}>{error}</div>}
  </div>;
}
