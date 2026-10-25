import { useEffect, useRef, useState } from 'react';

/** Isolated WebGL test scene. It does not touch either legacy renderer. */
export default function Engine3DView({ onExit }: { onExit?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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
    for(const [x,z] of [[-5,-4],[-7,2],[5,-5],[7,3],[-5,7],[6,8],[3,-9]]){
      cube(x,.7,z,.3,1.4,.3,[.36,.23,.12]);cube(x,1.7,z,1.15,1.25,1.15,[.12,.38,.16]);
    }
    const world=new Float32Array(data);
    const buffer=gl.createBuffer()!;
    const pLoc=gl.getAttribLocation(program,'p'),cLoc=gl.getAttribLocation(program,'c'),mLoc=gl.getUniformLocation(program,'m');
    gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.clearColor(.48,.67,.82,1);
    let px=0,pz=0,yaw=.55,pitch=.72,zoom=11,drag=false,lx=0,ly=0,raf=0,disposed=false;
    const keys=new Set<string>();
    const keydown=(e:KeyboardEvent)=>keys.add(e.key.toLowerCase()),keyup=(e:KeyboardEvent)=>keys.delete(e.key.toLowerCase());
    const down=(e:PointerEvent)=>{drag=true;lx=e.clientX;ly=e.clientY;canvas.setPointerCapture?.(e.pointerId);};
    const move=(e:PointerEvent)=>{if(!drag)return;yaw-=(e.clientX-lx)*.006;pitch=Math.max(.18,Math.min(1.4,pitch+(e.clientY-ly)*.005));lx=e.clientX;ly=e.clientY;};
    const up=()=>drag=false,wheel=(e:WheelEvent)=>zoom=Math.max(4,Math.min(22,zoom+e.deltaY*.012));
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:true});
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
      if(keys.has('w')||keys.has('arrowup')){px-=Math.sin(yaw)*s;pz-=Math.cos(yaw)*s;}
      if(keys.has('s')||keys.has('arrowdown')){px+=Math.sin(yaw)*s;pz+=Math.cos(yaw)*s;}
      if(keys.has('a')||keys.has('arrowleft')){px-=Math.cos(yaw)*s;pz+=Math.sin(yaw)*s;}
      if(keys.has('d')||keys.has('arrowright')){px+=Math.cos(yaw)*s;pz-=Math.sin(yaw)*s;}
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
      const eye=[px+Math.sin(yaw)*Math.cos(pitch)*zoom,Math.sin(pitch)*zoom+2,pz+Math.cos(yaw)*Math.cos(pitch)*zoom];
      gl.uniformMatrix4fv(mLoc,false,new Float32Array(mul(perspective(Math.PI/3,w/h,.1,120),view(eye,[px,0,pz]))));
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,world,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(pLoc);gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(cLoc);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);gl.drawArrays(gl.TRIANGLES,0,world.length/6);
      data.length=0;cube(px,.75,pz,.55,1.5,.55,[.95,.72,.2]);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,data.length/6);
      raf=requestAnimationFrame(frame);
    };
    raf=requestAnimationFrame(frame);
    return ()=>{disposed=true;cancelAnimationFrame(raf);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',wheel);gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);};
  },[]);
  return <div style={{position:'fixed',inset:0,zIndex:20000,background:'#18251d',color:'white',fontFamily:'system-ui,sans-serif'}}>
    <canvas ref={canvasRef} aria-label="Adventure 3D test scene" style={{width:'100%',height:'100%',display:'block',touchAction:'none'}}/>
    <div style={{position:'absolute',top:12,left:12,right:12,display:'flex',alignItems:'center',gap:8,pointerEvents:'none'}}>
      <strong style={{background:'#101913dd',padding:'9px 12px',borderRadius:8}}>Adventure · 3D Experimental</strong><span style={{background:'#101913dd',padding:'9px 12px',borderRadius:8,fontSize:12}}>WebGL prototype</span><span style={{flex:1}}/>
      {onExit&&<button onClick={onExit} style={{pointerEvents:'auto',padding:'10px 14px',border:0,borderRadius:8,background:'#f1c75b',fontWeight:700}}>Exit 3D</button>}
    </div>
    <div style={{position:'absolute',bottom:12,left:12,maxWidth:340,padding:12,borderRadius:8,background:'#101913dd',fontSize:13,lineHeight:1.5}}>WASD / arrows: move · Drag: orbit camera · Scroll: zoom<br/><span style={{opacity:.8}}>Isolated renderer test scene. Existing 2D/2.5D are unchanged; gameplay systems are not connected yet.</span></div>
    {error&&<div role="alert" style={{position:'absolute',left:'8%',right:'8%',top:'30%',padding:18,background:'#301d1d',borderRadius:10}}>{error}</div>}
  </div>;
}
