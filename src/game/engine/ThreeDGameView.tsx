import { useEffect, useRef } from 'react';

type Point = { x: number; y: number };
type Actor = { id: number | string; position: Point };
type Props = {
  position: Point;
  townsfolk?: Actor[];
  monsters?: Actor[];
  onTapMove?: (point: Point) => void;
};

/**
 * BUILD 3D-ENGINE-001: independent WebGL renderer.
 * Deliberately does not import or share the 2D/iso rendering pipeline.
 * It consumes world coordinates from App so the simulation remains authoritative.
 */
export default function ThreeDGameView({ position, townsfolk = [], monsters = [], onTapMove }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ position, townsfolk, monsters });
  latest.current = { position, townsfolk, monsters };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true, powerPreference: 'high-performance' });
    if (!gl) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#18251c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif';
        ctx.fillText('3D mode needs WebGL support in this browser.', 18, 32);
      }
      return;
    }

    const vertex = `
      attribute vec3 aPosition;
      attribute vec3 aColor;
      uniform mat4 uViewProjection;
      varying vec3 vColor;
      void main() { gl_Position = uViewProjection * vec4(aPosition, 1.0); vColor = aColor; }
    `;
    const fragment = `
      precision mediump float;
      varying vec3 vColor;
      void main() { gl_FragColor = vec4(vColor, 1.0); }
    `;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Unable to create WebGL shader');
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed');
      return shader;
    };
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const vertices: number[] = [];
    const tri = (a: number[], b: number[], c: number[], color: number[]) => {
      for (const p of [a,b,c]) vertices.push(p[0],p[1],p[2],color[0],color[1],color[2]);
    };
    const quad = (a: number[], b: number[], c: number[], d: number[], color: number[]) => { tri(a,b,c,color); tri(a,c,d,color); };
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, colors: number[][]) => {
      const p = [
        [x-w/2,y,z-d/2],[x+w/2,y,z-d/2],[x+w/2,y,z+d/2],[x-w/2,y,z+d/2],
        [x-w/2,y+h,z-d/2],[x+w/2,y+h,z-d/2],[x+w/2,y+h,z+d/2],[x-w/2,y+h,z+d/2],
      ];
      quad(p[0],p[1],p[5],p[4],colors[0]); quad(p[1],p[2],p[6],p[5],colors[1]);
      quad(p[2],p[3],p[7],p[6],colors[2]); quad(p[3],p[0],p[4],p[7],colors[3]);
      quad(p[4],p[5],p[6],p[7],colors[4]); quad(p[0],p[1],p[2],p[3],colors[5]);
    };
    // Large continuous 3D terrain plane, divided into subtle grass panels.
    for (let x=-80; x<180; x+=10) for (let z=-80; z<180; z+=10) {
      const shade = ((Math.floor(x/10)+Math.floor(z/10))&1) ? 0.20 : 0.23;
      quad([x,0,z],[x+10,0,z],[x+10,0,z+10],[x,0,z+10],[0.18,shade+0.12,0.16]);
    }
    // A readable road spine and a small plaza to make the independent engine useful immediately.
    box(50,0.025,50,13,0.04,150,[[0.36,0.31,0.24],[0.42,0.36,0.28],[0.35,0.30,0.23],[0.39,0.34,0.27],[0.48,0.42,0.33],[0.34,0.29,0.22]]);
    box(50,0.03,50,70,0.04,12,[[0.36,0.31,0.24],[0.42,0.36,0.28],[0.35,0.30,0.23],[0.39,0.34,0.27],[0.48,0.42,0.33],[0.34,0.29,0.22]]);
    // Simple, separate 3D town blockout; replaces the 2D/2.5D renderers only while this mode is selected.
    const buildings = [[22,25,11,7,12],[76,28,12,8,15],[26,75,13,8,10],[80,78,10,7,13],[50,18,15,10,18],[50,83,14,9,14]];
    for (const [x,z,w,d,h] of buildings) {
      box(x,0.05,z,w,h,d,[[0.48,0.31,0.20],[0.56,0.37,0.23],[0.43,0.27,0.18],[0.50,0.32,0.20],[0.69,0.49,0.31],[0.40,0.25,0.17]]);
      // Pitched roof represented as a raised ridge and two sloping roof slabs.
      box(x, h+0.8, z, w+2, 1.7, d+2, [[0.28,0.16,0.13],[0.35,0.19,0.15],[0.27,0.14,0.12],[0.32,0.17,0.14],[0.43,0.22,0.17],[0.25,0.13,0.11]]);
      box(x,0.1,z+d/2+0.03,2.2,4,0.12,[[0.16,0.10,0.06],[0.20,0.12,0.07],[0.15,0.09,0.05],[0.18,0.10,0.06],[0.23,0.14,0.08],[0.14,0.08,0.05]]);
    }
    // Low-poly trees and rocks add real depth without depending on 2D sprite assets.
    for (const [x,z] of [[12,15],[14,42],[17,88],[88,16],[92,48],[90,92],[35,12],[68,91],[8,68],[94,68]] as number[][]) {
      box(x,0,z,1.2,5,1.2,[[0.28,0.17,0.09],[0.33,0.20,0.10],[0.25,0.15,0.08],[0.29,0.17,0.09],[0.35,0.22,0.11],[0.24,0.14,0.07]]);
      box(x,4,z,5.5,7,5.5,[[0.10,0.28,0.13],[0.13,0.34,0.15],[0.08,0.24,0.11],[0.11,0.30,0.13],[0.16,0.39,0.17],[0.08,0.22,0.10]]);
    }

    const buffer = gl.createBuffer();
    const actorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
    const posLoc = gl.getAttribLocation(program, 'aPosition');
    const colorLoc = gl.getAttribLocation(program, 'aColor');
    gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc,3,gl.FLOAT,false,stride,0);
    gl.enableVertexAttribArray(colorLoc); gl.vertexAttribPointer(colorLoc,3,gl.FLOAT,false,stride,3*Float32Array.BYTES_PER_ELEMENT);
    const matrixLoc = gl.getUniformLocation(program, 'uViewProjection');
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);

    const perspective = (fovy: number, aspect: number, near: number, far: number) => {
      const f=1/Math.tan(fovy/2), nf=1/(near-far);
      return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,(2*far*near)*nf,0];
    };
    const lookAt = (eye: number[], center: number[], up: number[]) => {
      const norm=(v:number[])=>{const l=Math.hypot(...v)||1;return v.map(n=>n/l);};
      const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
      const sub=(a:number[],b:number[])=>a.map((n,i)=>n-b[i]);
      const z=norm(sub(eye,center)), x=norm(cross(up,z)), y=cross(z,x);
      return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),-(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),-(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]),1];
    };
    const multiply=(a:number[],b:number[])=>{
      const o=new Array(16).fill(0);
      for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];
      return o;
    };
    let raf=0;
    const draw=()=>{
      const dpr=Math.min(window.devicePixelRatio||1,1.6);
      const w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      gl.viewport(0,0,w,h); gl.clearColor(0.46,0.64,0.78,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const p=latest.current.position;
      const px=Math.max(0,Math.min(100,p.x)), pz=Math.max(0,Math.min(100,p.y));
      // Third-person follow camera, recalculated from the live simulation position.
      const view=lookAt([px+36,34,pz+42],[px,2,pz],[0,1,0]);
      gl.uniformMatrix4fv(matrixLoc,false,new Float32Array(multiply(perspective(Math.PI/3, w/h, 0.1, 500),view)));
      gl.drawArrays(gl.TRIANGLES,0,vertices.length/6);
      const actors:number[]=[];
      const actorBox=(x:number,z:number,color:number[])=>{
        const y=0.12,w=1.5,h=4.2,d=1.5;
        const p=[[x-w/2,y,z-d/2],[x+w/2,y,z-d/2],[x+w/2,y,z+d/2],[x-w/2,y,z+d/2],[x-w/2,y+h,z-d/2],[x+w/2,y+h,z-d/2],[x+w/2,y+h,z+d/2],[x-w/2,y+h,z+d/2]];
        const q=(a:number[],b:number[],c:number[],dd:number[])=>{for(const v of [a,b,c,a,c,dd])actors.push(v[0],v[1],v[2],color[0],color[1],color[2]);};
        q(p[0],p[1],p[5],p[4]);q(p[1],p[2],p[6],p[5]);q(p[2],p[3],p[7],p[6]);q(p[3],p[0],p[4],p[7]);q(p[4],p[5],p[6],p[7]);q(p[0],p[1],p[2],p[3]);
      };
      latest.current.townsfolk.slice(0,120).forEach(a=>actorBox(a.position.x,a.position.y,[0.24,0.55,0.84]));
      latest.current.monsters.slice(0,80).forEach(a=>actorBox(a.position.x,a.position.y,[0.75,0.18,0.16]));
      actorBox(px,pz,[0.96,0.78,0.25]);
      gl.bindBuffer(gl.ARRAY_BUFFER, actorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(actors),gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(posLoc,3,gl.FLOAT,false,stride,0);
      gl.vertexAttribPointer(colorLoc,3,gl.FLOAT,false,stride,3*Float32Array.BYTES_PER_ELEMENT);
      gl.drawArrays(gl.TRIANGLES,0,actors.length/6);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      raf=requestAnimationFrame(draw);
    };
    draw();
    return ()=>{cancelAnimationFrame(raf);gl.deleteBuffer(buffer);if(actorBuffer)gl.deleteBuffer(actorBuffer);gl.deleteProgram(program);};
  }, []);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onTapMove) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const nx = Math.max(0,Math.min(100,((event.clientX-rect.left)/rect.width)*100));
    const ny = Math.max(0,Math.min(100,((event.clientY-rect.top)/rect.height)*100));
    onTapMove({ x:nx, y:ny });
  };

  return <div data-testid="game-view-3d" aria-label="Adventure Game 3D engine" style={{ position:'absolute', inset:0, zIndex:4, overflow:'hidden', background:'#789ebf' }}>
    <canvas ref={canvasRef} onClick={handleClick} style={{ width:'100%', height:'100%', display:'block', touchAction:'manipulation' }} />
    <div style={{ position:'absolute',left:10,top:10,padding:'6px 9px',borderRadius:7,background:'rgba(12,20,17,.78)',color:'#f2f7f2',font:'700 11px/1.4 system-ui',pointerEvents:'none' }}>3D ENGINE · WebGL <span style={{opacity:.8,fontWeight:400}}>Independent renderer</span></div>
  </div>;
}
