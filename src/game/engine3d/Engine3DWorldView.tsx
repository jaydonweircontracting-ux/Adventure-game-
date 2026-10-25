import { useEffect, useRef, useState } from 'react';
import { isWalkableWorld, loadWorld, terrainAt, type IsoWorld } from '../iso/isoWorld';

type Vec3 = [number, number, number];
type Vertex = number[];
const SAVE_KEY = 'ag-3d-player-v1';
const COLORS: Record<string, Vec3> = {
  grass: [0.25, 0.43, 0.23], dirt: [0.47, 0.36, 0.23], sand: [0.68, 0.59, 0.39],
  stone: [0.48, 0.49, 0.46], water: [0.12, 0.36, 0.57],
};
type Position = { x: number; y: number };

function savedPosition(world: IsoWorld): Position {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Position;
      if (Number.isFinite(p.x) && Number.isFinite(p.y) && isWalkableWorld(world, world.crates, Math.round(p.x), Math.round(p.y))) return p;
    }
  } catch { /* use the world's authored spawn */ }
  return { x: world.playerStart.tx, y: world.playerStart.ty };
}

function buildWorldVertices(world: IsoWorld, center: Position): Float32Array {
  const data: Vertex = [];
  const tri = (a: Vec3, b: Vec3, c: Vec3, color: Vec3) => {
    for (const p of [a, b, c]) data.push(...p, ...color);
  };
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Vec3) => { tri(a, b, c, color); tri(a, c, d, color); };
  const cube = (x: number, z: number, w: number, h: number, d: number, color: Vec3) => {
    const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2,y0=0,y1=h;
    quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],color);
    quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],color.map(v=>v*.75) as Vec3);
    quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],color.map(v=>v*.84) as Vec3);
    quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],color.map(v=>v*.68) as Vec3);
    quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],color.map(v=>Math.min(1,v*1.15)) as Vec3);
  };
  const minX=Math.max(0,Math.floor(center.x)-22), maxX=Math.min(world.w-1,Math.floor(center.x)+22);
  const minY=Math.max(0,Math.floor(center.y)-22), maxY=Math.min(world.h-1,Math.floor(center.y)+22);
  for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) {
    const terrain=terrainAt(world,x,y);
    const c=COLORS[terrain]||COLORS.grass;
    const shade=((x*13+y*7)&3)*.012;
    quad([x,0,y],[x+1,0,y],[x+1,0,y+1],[x,0,y+1],[c[0]+shade,c[1]+shade,c[2]+shade]);
  }
  // Walls and stall counters use the editor-authored collision geometry.
  for(const wall of world.walls) if(wall.x>=minX&&wall.x<=maxX&&wall.y>=minY&&wall.y<=maxY) cube(wall.x+.5,wall.y+.5,1,.85,1,[.43,.39,.32]);
  for(const stall of world.stalls) if(stall.y0>=minY&&stall.y0<=maxY) for(let x=stall.x0;x<=stall.x1;x++) if(x>=minX&&x<=maxX) cube(x+.5,stall.y0+.5,1,.75,1,[.57,.31,.16]);
  for(const hut of world.huts) {
    if(hut.x1<minX||hut.x0>maxX||hut.y1<minY||hut.y0>maxY) continue;
    const x=(hut.x0+hut.x1+1)/2,z=(hut.y0+hut.y1+1)/2,w=hut.x1-hut.x0+1,d=hut.y1-hut.y0+1;
    cube(x,z,w,2.4,d,[.61,.43,.28]);
    cube(x, z, w+0.25, .7, d+0.25,[.36,.18,.14]);
  }
  for(const t of world.trees) if(t.tx>=minX&&t.tx<=maxX&&t.ty>=minY&&t.ty<=maxY) {
    cube(t.tx+.5,t.ty+.5,.22,1.3,.22,[.36,.23,.12]);
    cube(t.tx+.5,t.ty+.5,1.05,1.45,1.05,[.12,.36,.16]);
  }
  for(const r of world.rocks) if(r.tx>=minX&&r.tx<=maxX&&r.ty>=minY&&r.ty<=maxY) cube(r.tx+.5,r.ty+.5,.7,.6,.7,[.43,.45,.44]);
  for(const c of world.crates) if(c.tx>=minX&&c.tx<=maxX&&c.ty>=minY&&c.ty<=maxY) cube(c.tx+.5,c.ty+.5,.65,.7,.65,[.48,.29,.13]);
  return new Float32Array(data);
}

export default function Engine3DWorldView({ onExit }: { onExit?: () => void }) {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [message,setMessage]=useState('Connected to the editable world map');
  const [position,setPosition]=useState<Position>(()=>savedPosition(loadWorld()));
  const stateRef=useRef({position,world:loadWorld()});
  const needsWorldRebuild=useRef(true);
  stateRef.current={position,world:stateRef.current.world};
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const world=loadWorld();stateRef.current.world=world;
    const html=document.documentElement,body=document.body;
    const oldHtml={overflow:html.style.overflow,touchAction:html.style.touchAction,overscrollBehavior:html.style.overscrollBehavior};
    const oldBody={overflow:body.style.overflow,touchAction:body.style.touchAction,overscrollBehavior:body.style.overscrollBehavior,position:body.style.position,width:body.style.width};
    html.style.overflow='hidden';html.style.touchAction='none';html.style.overscrollBehavior='none';
    body.style.overflow='hidden';body.style.touchAction='none';body.style.overscrollBehavior='none';body.style.position='fixed';body.style.width='100%';
    const stopTouch=(e:TouchEvent)=>{if(e.cancelable)e.preventDefault()};
    window.addEventListener('touchmove',stopTouch,{passive:false});
    const gl=canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance'});
    if(!gl){setMessage('WebGL is unavailable in this browser');return;}
    const vs=gl.createShader(gl.VERTEX_SHADER)!;gl.shaderSource(vs,'attribute vec3 p;attribute vec3 c;uniform mat4 m;varying vec3 v;void main(){gl_Position=m*vec4(p,1.0);v=c;}');gl.compileShader(vs);
    const fs=gl.createShader(gl.FRAGMENT_SHADER)!;gl.shaderSource(fs,'precision mediump float;varying vec3 v;void main(){gl_FragColor=vec4(v,1.0);}');gl.compileShader(fs);
    const program=gl.createProgram()!;gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){setMessage(gl.getProgramInfoLog(program)||'3D renderer setup failed');return}
    gl.useProgram(program);
    const worldBuffer=gl.createBuffer()!,actorBuffer=gl.createBuffer()!;
    const pLoc=gl.getAttribLocation(program,'p'),cLoc=gl.getAttribLocation(program,'c'),mLoc=gl.getUniformLocation(program,'m');
    gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(.45,.63,.76,1);
    let yaw=.65,pitch=.7,zoom=12,drag=false,lx=0,ly=0,raf=0;
    const keys=new Set<string>();
    const keydown=(e:KeyboardEvent)=>{const k=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e'].includes(k)){e.preventDefault();keys.add(k);}};
    const keyup=(e:KeyboardEvent)=>keys.delete(e.key.toLowerCase());
    const down=(e:PointerEvent)=>{if((e.target as HTMLElement).closest('button'))return;drag=true;lx=e.clientX;ly=e.clientY;canvas.setPointerCapture?.(e.pointerId)};
    const move=(e:PointerEvent)=>{if(!drag)return;yaw+=(e.clientX-lx)*.008;pitch=Math.max(.22,Math.min(1.25,pitch+(e.clientY-ly)*.006));lx=e.clientX;ly=e.clientY};
    const up=()=>{drag=false};
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
    const perspective=(f:number,a:number,n:number,far:number)=>{const t=1/Math.tan(f/2),nf=1/(n-far);return [t/a,0,0,0,0,t,0,0,0,0,(far+n)*nf,-1,0,0,2*far*n*nf,0]};
    const lookAt=(eye:number[],center:number[])=>{const norm=(v:number[])=>{const l=Math.hypot(...v)||1;return v.map(n=>n/l)};const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];const sub=(a:number[],b:number[])=>a.map((n,i)=>n-b[i]);const z=norm(sub(eye,center)),x=norm(cross([0,1,0],z)),y=cross(z,x);return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),-(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),-(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]),1]};
    const mul=(a:number[],b:number[])=>{const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o};
    const upload=(buffer:WebGLBuffer,data:Float32Array)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12)};
    const draw=()=>{
      const dpr=Math.min(window.devicePixelRatio||1,1.5),w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;needsWorldRebuild.current=true}
      const current=stateRef.current,player=current.position;
      if(needsWorldRebuild.current){upload(worldBuffer,buildWorldVertices(world,player));needsWorldRebuild.current=false}
      gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const ex=player.x+Math.sin(yaw)*zoom,ez=player.y+Math.cos(yaw)*zoom,ey=zoom*.8+2;
      const mat=mul(perspective(Math.PI/3,w/h,.1,120),lookAt([ex,ey,ez],[player.x,0.8,player.y]));
      gl.uniformMatrix4fv(mLoc,false,new Float32Array(mat));
      gl.bindBuffer(gl.ARRAY_BUFFER,worldBuffer);gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(cLoc,3,gl.FLOAT,false,24,12);
      gl.drawArrays(gl.TRIANGLES,0,gl.getBufferParameter(gl.ARRAY_BUFFER,gl.BUFFER_SIZE)/24);
      const actors:Vertex=[];
      const cube=(x:number,z:number,color:Vec3,h=1.25)=>{const x0=x-.22,x1=x+.22,z0=z-.22,z1=z+.22,y0=0,y1=h;const tri=(a:Vec3,b:Vec3,c:Vec3)=>{for(const p of [a,b,c])actors.push(...p,...color)};const q=(a:Vec3,b:Vec3,c:Vec3,d:Vec3)=>{tri(a,b,c);tri(a,c,d)};q([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]);q([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]);q([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]);q([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]);q([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0])};
      for(const npc of world.npcSpawns) if(Math.abs(npc.x-player.x)<22&&Math.abs(npc.y-player.y)<22)cube(npc.x+.5,npc.y+.5,[.22,.55,.86],1.3);
      cube(player.x+.5,player.y+.5,[.96,.77,.22],1.55);
      upload(actorBuffer,new Float32Array(actors));gl.drawArrays(gl.TRIANGLES,0,actors.length/6);
      raf=requestAnimationFrame(draw);
    };
    const tryMove=(dx:number,dy:number)=>{const nextX=Math.round(stateRef.current.position.x+dx),nextY=Math.round(stateRef.current.position.y+dy);if(isWalkableWorld(world,world.crates,nextX,nextY)){const next={x:nextX,y:nextY};stateRef.current.position=next;setPosition(next);try{localStorage.setItem(SAVE_KEY,JSON.stringify(next))}catch{}needsWorldRebuild.current=true}};
    const action=(e:KeyboardEvent)=>{if(e.type!=='keydown')return;const k=e.key.toLowerCase();if(k==='e'){const p=stateRef.current.position;const near=world.npcSpawns.find(n=>Math.abs(n.x-p.x)<=1&&Math.abs(n.y-p.y)<=1);setMessage(near?'Nearby resident: '+near.name:'No one close enough to interact');return}const d:Record<string,[number,number]>={w:[0,-1],arrowup:[0,-1],s:[0,1],arrowdown:[0,1],a:[-1,0],arrowleft:[-1,0],d:[1,0],arrowright:[1,0]};const step=d[k];if(step)tryMove(step[0],step[1])};
    window.addEventListener('keydown',action);
    draw();
    const timer=window.setInterval(()=>{if(keys.size){const k=[...keys].at(-1)!;const d:Record<string,[number,number]>={w:[0,-1],arrowup:[0,-1],s:[0,1],arrowdown:[0,1],a:[-1,0],arrowleft:[-1,0],d:[1,0],arrowright:[1,0]};const step=d[k];if(step)tryMove(step[0],step[1])}},130);
    return()=>{cancelAnimationFrame(raf);window.clearInterval(timer);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('keydown',action);window.removeEventListener('touchmove',stopTouch);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);html.style.overflow=oldHtml.overflow;html.style.touchAction=oldHtml.touchAction;html.style.overscrollBehavior=oldHtml.overscrollBehavior;body.style.overflow=oldBody.overflow;body.style.touchAction=oldBody.touchAction;body.style.overscrollBehavior=oldBody.overscrollBehavior;body.style.position=oldBody.position;body.style.width=oldBody.width;gl.deleteBuffer(worldBuffer);gl.deleteBuffer(actorBuffer);gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs)};
  },[]);
  const move=(dx:number,dy:number)=>{const world=stateRef.current.world;const next={x:Math.round(position.x+dx),y:Math.round(position.y+dy)};if(isWalkableWorld(world,world.crates,next.x,next.y)){stateRef.current.position=next;setPosition(next);try{localStorage.setItem(SAVE_KEY,JSON.stringify(next))}catch{}needsWorldRebuild.current=true }};
  const pad=(dx:number,dy:number,label:string)=> <button key={label} type="button" aria-label={label} onPointerDown={e=>{e.preventDefault();move(dx,dy)}} style={{width:48,height:44,borderRadius:9,border:'1px solid #c4d1bd',background:'#172c23e8',color:'#fff',fontSize:19,fontWeight:800,touchAction:'none'}}>{label==='Forward'?'▲':label==='Back'?'▼':label==='Left'?'◀':'▶'}</button>;
  return <div data-testid="game-view-3d" style={{position:'fixed',inset:0,zIndex:20000,overflow:'hidden',background:'#789ebf',touchAction:'none',fontFamily:'system-ui,sans-serif'}}>
    <canvas ref={canvasRef} aria-label="3D Adventure world" style={{width:'100%',height:'100%',display:'block',touchAction:'none'}}/>
    <div style={{position:'absolute',left:10,top:10,padding:'7px 10px',borderRadius:8,background:'#14241ddf',color:'#f2f7f2',font:'700 11px/1.4 system-ui',pointerEvents:'none'}}>ADVENTURE 3D · WORLD LINKED <span style={{opacity:.8,fontWeight:400}}>Tile terrain · collision · saved position</span></div>
    <div style={{position:'absolute',left:10,bottom:14,padding:'7px 10px',borderRadius:8,background:'#14241ddf',color:'#fff',fontSize:12}}>{message} · {Math.round(position.x)},{Math.round(position.y)}</div>
    <div style={{position:'absolute',right:12,bottom:12,display:'grid',gridTemplateColumns:'48px 48px 48px',gridTemplateRows:'44px 44px 44px',gap:4,touchAction:'none'}}>
      <div/><div>{pad(0,-1,'Forward')}</div><div/>
      {pad(-1,0,'Left')}{pad(0,1,'Back')}{pad(1,0,'Right')}
    </div>
    <button type="button" onClick={onExit} style={{position:'absolute',right:12,top:12,zIndex:4,padding:'10px 13px',border:'1px solid #c4d1bd',borderRadius:9,background:'#172c23e8',color:'#fff',fontWeight:700}}>Exit 3D</button>
  </div>;
}
