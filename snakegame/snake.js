const canvas = document.getElementById('gc');
const ctx    = canvas.getContext('2d');
const CELL   = 22;

const maxW = Math.min(680, window.innerWidth - 16);
const COLS  = Math.floor(maxW / CELL);
const maxH  = Math.min(window.innerHeight - 230, 600);
const ROWS  = Math.floor(maxH / CELL);
const W = COLS * CELL, H = ROWS * CELL;
canvas.width = W; canvas.height = H;
document.getElementById('hudBar').style.maxWidth    = W + 'px';
document.getElementById('bottomBar').style.maxWidth = W + 'px';

const DIFFS = {
  beginner:     { label:'BEGINNER',     color:'#00ff88', baseSpeed:210, decay:6,  minSpeed:130, wallKill:false, numObs:0, mult:1   },
  moderate:     { label:'MODERATE',     color:'#00f5ff', baseSpeed:155, decay:8,  minSpeed:80,  wallKill:false, numObs:0, mult:1.5 },
  intermediate: { label:'INTERMEDIATE', color:'#ff8800', baseSpeed:108, decay:6,  minSpeed:58,  wallKill:true,  numObs:5, mult:2   },
  hard:         { label:'HARD',         color:'#ff006e', baseSpeed:65,  decay:4,  minSpeed:36,  wallKill:true,  numObs:10,mult:3   },
};

let snake,dir,nextDir,food,powerUp,obstacles,score,level,speed,gameState,animId,stepTimer,particles;
let selectedDiff = null;
let hiScores = JSON.parse(localStorage.getItem('snakeHiV2')||'{}');

const States = {LEVEL:'level',PLAYING:'playing',PAUSED:'paused',GAMEOVER:'gameover'};

const scoreEl  = document.getElementById('scoreDisplay');
const levelEl  = document.getElementById('levelDisplay');
const diffEl   = document.getElementById('diffDisplay');
const hiEl     = document.getElementById('hiDisplay');
const finalEl  = document.getElementById('finalScore');
const newHiEl  = document.getElementById('newHi');

function showScreen(id) {
  ['screenLevel','screenOver','screenPause'].forEach(s=>document.getElementById(s).classList.add('hidden'));
  if(id) document.getElementById(id).classList.remove('hidden');
}

// Particles
function spawnP(cx,cy,color,n=10) {
  for(let i=0;i<n;i++){
    const a=(Math.PI*2*i)/n+Math.random()*.6, sp=1.8+Math.random()*3.2;
    particles.push({x:cx,y:cy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,decay:.022+Math.random()*.02,r:2.5+Math.random()*3,color});
  }
}
function updateP() {
  particles=particles.filter(p=>p.life>0);
  particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.09;p.life-=p.decay;p.r*=.97;});
}
function drawP() {
  particles.forEach(p=>{
    ctx.save();ctx.globalAlpha=p.life;
    ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=7;
    ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.restore();
  });
}

function rndCell(exclude=[]) {
  let pos,t=0;
  do { pos={x:Math.floor(Math.random()*COLS),y:Math.floor(Math.random()*ROWS)};t++; }
  while(t<500&&exclude.some(e=>e.x===pos.x&&e.y===pos.y));
  return pos;
}
function placeFood() {
  food={...rndCell([...snake,...obstacles,powerUp].filter(Boolean))};
}
function placeObs(n) {
  obstacles=[];
  for(let i=0;i<n;i++){
    const o=rndCell([...snake,...obstacles]);obstacles.push(o);
    const d=Math.random()>.5?{x:1,y:0}:{x:0,y:1};
    const o2={x:(o.x+d.x+COLS)%COLS,y:(o.y+d.y+ROWS)%ROWS};
    if(!obstacles.some(e=>e.x===o2.x&&e.y===o2.y)) obstacles.push(o2);
  }
}
function placePU() {
  if(Math.random()<.35){
    const types=[{type:'gem',color:'#bf00ff',pts:30},{type:'speed',color:'#fffc00',pts:0}];
    const t=types[Math.floor(Math.random()*types.length)];
    powerUp={...rndCell([...snake,food,...obstacles]),...t,life:180};
  }
}

function init(diff) {
  selectedDiff=diff;
  const cfg=DIFFS[diff];
  const mid={x:Math.floor(COLS/2),y:Math.floor(ROWS/2)};
  snake=[{x:mid.x,y:mid.y},{x:mid.x-1,y:mid.y},{x:mid.x-2,y:mid.y}];
  dir={x:1,y:0};nextDir={x:1,y:0};
  score=0;level=1;speed=cfg.baseSpeed;
  powerUp=null;particles=[];stepTimer=0;
  placeObs(cfg.numObs);placeFood();
  scoreEl.textContent=0;levelEl.textContent=1;
  diffEl.textContent=cfg.label;diffEl.style.color=cfg.color;
  hiEl.textContent=hiScores[diff]||0;
  document.getElementById('pauseDiffInfo').textContent=cfg.label+' MODE';
}

// Input
const DM = {ArrowUp:{x:0,y:-1},w:{x:0,y:-1},W:{x:0,y:-1},ArrowDown:{x:0,y:1},s:{x:0,y:1},S:{x:0,y:1},ArrowLeft:{x:-1,y:0},a:{x:-1,y:0},A:{x:-1,y:0},ArrowRight:{x:1,y:0},d:{x:1,y:0},D:{x:1,y:0}};
document.addEventListener('keydown',e=>{
  if(e.key==='p'||e.key==='P'||e.key==='Escape'){togglePause();return;}
  const d=DM[e.key];
  if(d&&!(d.x===-dir.x&&d.y===-dir.y)){nextDir=d;if(e.key.startsWith('Arrow'))e.preventDefault();}
});
document.querySelectorAll('.ctrl-btn').forEach(btn=>{
  const press=e=>{
    e.preventDefault();btn.classList.add('active');
    const m={UP:{x:0,y:-1},DOWN:{x:0,y:1},LEFT:{x:-1,y:0},RIGHT:{x:1,y:0}};
    const d=m[btn.dataset.dir];
    if(d&&!(d.x===-dir.x&&d.y===-dir.y))nextDir=d;
    if(gameState===States.PAUSED)resumeGame();
    setTimeout(()=>btn.classList.remove('active'),120);
  };
  btn.addEventListener('touchstart',press,{passive:false});
  btn.addEventListener('mousedown',press);
});
let ts=null;
canvas.addEventListener('touchstart',e=>{ts=e.touches[0];},{passive:true});
canvas.addEventListener('touchend',e=>{
  if(!ts)return;
  const dx=e.changedTouches[0].clientX-ts.clientX,dy=e.changedTouches[0].clientY-ts.clientY;
  if(Math.abs(dx)>Math.abs(dy)){const d=dx>0?{x:1,y:0}:{x:-1,y:0};if(!(d.x===-dir.x))nextDir=d;}
  else{const d=dy>0?{x:0,y:1}:{x:0,y:-1};if(!(d.y===-dir.y))nextDir=d;}
  ts=null;if(gameState===States.PAUSED)resumeGame();
},{passive:true});

function step() {
  const cfg=DIFFS[selectedDiff];
  dir={...nextDir};
  let nx=snake[0].x+dir.x,ny=snake[0].y+dir.y;
  if(cfg.wallKill){if(nx<0||nx>=COLS||ny<0||ny>=ROWS){gameOver();return;}}
  else{nx=(nx+COLS)%COLS;ny=(ny+ROWS)%ROWS;}
  const head={x:nx,y:ny};
  if(snake.some(s=>s.x===head.x&&s.y===head.y)){gameOver();return;}
  if(obstacles.some(o=>o.x===head.x&&o.y===head.y)){gameOver();return;}
  snake.unshift(head);
  if(head.x===food.x&&head.y===food.y){
    const pts=Math.round(10*cfg.mult);addScore(pts);
    spawnP(food.x*CELL+CELL/2,food.y*CELL+CELL/2,'#ff006e',14);
    placeFood();if((snake.length-3)%5===0)placePU();doLvUp();
  } else {snake.pop();}
  if(powerUp&&head.x===powerUp.x&&head.y===powerUp.y){
    spawnP(powerUp.x*CELL+CELL/2,powerUp.y*CELL+CELL/2,powerUp.color,20);
    if(powerUp.type==='gem')addScore(Math.round(30*cfg.mult));
    if(powerUp.type==='speed')speed=Math.max(cfg.minSpeed,speed-18);
    powerUp=null;
  }
  if(powerUp){powerUp.life--;if(powerUp.life<=0)powerUp=null;}
}

function addScore(pts) {
  score+=pts;scoreEl.textContent=score;
  scoreEl.style.transform='scale(1.35)';setTimeout(()=>scoreEl.style.transform='',180);
}
function doLvUp() {
  const cfg=DIFFS[selectedDiff];
  const nLv=Math.floor(snake.length/5)+1;
  if(nLv>level){level=nLv;levelEl.textContent=level;speed=Math.max(cfg.minSpeed,cfg.baseSpeed-(level-1)*cfg.decay);
    levelEl.style.color='#fffc00';setTimeout(()=>levelEl.style.color='',400);}
}

function render() {
  ctx.fillStyle='#020c12';ctx.fillRect(0,0,W,H);
  // grid
  ctx.fillStyle='rgba(0,245,255,0.035)';
  for(let x=0;x<=COLS;x++)for(let y=0;y<=ROWS;y++)ctx.fillRect(x*CELL-1,y*CELL-1,2,2);

  // wall border indicator
  if(selectedDiff&&DIFFS[selectedDiff].wallKill){
    ctx.save();ctx.strokeStyle='rgba(255,0,110,0.2)';ctx.lineWidth=3;ctx.strokeRect(1,1,W-2,H-2);ctx.restore();
  }

  // obstacles
  obstacles.forEach(o=>{
    ctx.save();
    ctx.fillStyle='rgba(255,110,0,0.22)';ctx.strokeStyle='rgba(255,110,0,0.65)';ctx.lineWidth=1.5;
    ctx.shadowColor='#ff6e00';ctx.shadowBlur=8;
    ctx.beginPath();ctx.roundRect(o.x*CELL+1,o.y*CELL+1,CELL-2,CELL-2,3);ctx.fill();ctx.stroke();
    ctx.restore();
  });

  // food
  const fp=(Date.now()/380)%(Math.PI*2);
  ctx.save();
  ctx.shadowColor='#ff006e';ctx.shadowBlur=10+Math.sin(fp)*5;ctx.fillStyle='#ff006e';
  ctx.beginPath();ctx.arc(food.x*CELL+CELL/2,food.y*CELL+CELL/2,CELL/2-2+Math.sin(fp)*1.8,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#ff88bb';ctx.lineWidth=1.5;ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.35)';ctx.beginPath();ctx.arc(food.x*CELL+CELL/2-3,food.y*CELL+CELL/2-3,2.8,0,Math.PI*2);ctx.fill();
  ctx.restore();

  // powerup
  if(powerUp){
    const pp=(Date.now()/280)%(Math.PI*2);
    const flash=powerUp.life<50?(Math.floor(Date.now()/90)%2===0):true;
    if(flash){
      ctx.save();ctx.shadowColor=powerUp.color;ctx.shadowBlur=14+Math.sin(pp)*7;ctx.fillStyle=powerUp.color;
      ctx.translate(powerUp.x*CELL+CELL/2,powerUp.y*CELL+CELL/2);ctx.rotate(Math.PI/4+pp*.4);
      const s=CELL/2-3;ctx.fillRect(-s/2,-s/2,s,s);
      ctx.fillStyle='rgba(255,255,255,0.28)';ctx.fillRect(-s/4,-s/4,s/2.2,s/2.2);
      ctx.restore();
    }
  }

  // snake
  const cfg=selectedDiff?DIFFS[selectedDiff]:null;
  const hColor=cfg?cfg.color:'#00ff88';
  const hR=parseInt(hColor.slice(1,3),16),hG=parseInt(hColor.slice(3,5),16),hB=parseInt(hColor.slice(5,7),16);
  snake.forEach((seg,i)=>{
    const isHead=i===0,t=i/snake.length;
    const px=seg.x*CELL+1,py=seg.y*CELL+1,sz=CELL-2;
    ctx.save();
    if(isHead){ctx.shadowColor=hColor;ctx.shadowBlur=18;ctx.fillStyle=hColor;}
    else{
      const r=Math.round(hR*(1-t)),g=Math.round(hG*(1-t)+60*t),b=Math.round(hB*(1-t)+40*t);
      ctx.fillStyle=`rgb(${r},${g},${b})`;ctx.shadowColor=`rgba(${hR},${hG},${hB},0.2)`;ctx.shadowBlur=5;
    }
    ctx.beginPath();ctx.roundRect(px,py,sz,sz,isHead?6:4);ctx.fill();
    if(isHead){
      ctx.fillStyle='rgba(255,255,255,0.22)';ctx.beginPath();ctx.roundRect(px+3,py+2,sz-10,4,2);ctx.fill();
      const ex=dir.x===1?sz-5:dir.x===-1?3:sz/2;
      const ey=dir.y===1?sz-5:dir.y===-1?3:sz/2;
      const off=dir.x!==0?{a:{x:0,y:-3.5},b:{x:0,y:3.5}}:{a:{x:-3.5,y:0},b:{x:3.5,y:0}};
      ctx.fillStyle='#001a0e';
      ctx.beginPath();ctx.arc(px+ex+off.a.x,py+ey+off.a.y,2.8,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(px+ex+off.b.x,py+ey+off.b.y,2.8,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff';
      ctx.beginPath();ctx.arc(px+ex+off.a.x+.7,py+ey+off.a.y-.7,1.1,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(px+ex+off.b.x+.7,py+ey+off.b.y-.7,1.1,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  });
  drawP();
}

let lastTs=0;
function loop(ts){
  if(gameState!==States.PLAYING)return;
  animId=requestAnimationFrame(loop);
  const dt=ts-lastTs;lastTs=ts;stepTimer+=dt;
  if(stepTimer>=speed){step();stepTimer=0;if(gameState!==States.PLAYING)return;}
  updateP();render();
}

function startWithDiff(diff){
  init(diff);gameState=States.PLAYING;showScreen(null);
  lastTs=performance.now();stepTimer=0;animId=requestAnimationFrame(loop);
}
function gameOver(){
  gameState=States.GAMEOVER;cancelAnimationFrame(animId);render();
  ctx.fillStyle='rgba(255,0,110,0.1)';ctx.fillRect(0,0,W,H);
  finalEl.textContent=score;
  const hi=hiScores[selectedDiff]||0;
  if(score>hi){hiScores[selectedDiff]=score;localStorage.setItem('snakeHiV2',JSON.stringify(hiScores));hiEl.textContent=score;newHiEl.style.display='block';}
  else{newHiEl.style.display='none';}
  showScreen('screenOver');
}
function togglePause(){
  if(gameState===States.PLAYING){gameState=States.PAUSED;cancelAnimationFrame(animId);showScreen('screenPause');}
  else if(gameState===States.PAUSED){resumeGame();}
}
function resumeGame(){
  gameState=States.PLAYING;showScreen(null);lastTs=performance.now();animId=requestAnimationFrame(loop);
}

document.querySelectorAll('.lv-card').forEach(c=>{
  c.addEventListener('click',()=>startWithDiff(c.dataset.diff));
  c.addEventListener('touchend',e=>{e.preventDefault();startWithDiff(c.dataset.diff);});
});
document.getElementById('btnRestart').addEventListener('click',()=>startWithDiff(selectedDiff));
document.getElementById('btnLevels').addEventListener('click',()=>{gameState=States.LEVEL;showScreen('screenLevel');});
document.getElementById('btnResume').addEventListener('click',resumeGame);
document.getElementById('btnPauseLevels').addEventListener('click',()=>{cancelAnimationFrame(animId);gameState=States.LEVEL;showScreen('screenLevel');});
document.getElementById('pauseBtn').addEventListener('click',togglePause);

// Boot
gameState=States.LEVEL;
ctx.fillStyle='#020c12';ctx.fillRect(0,0,W,H);

// Idle animation behind level select
function idleBg(ts){
  if(gameState!==States.LEVEL&&gameState!==States.GAMEOVER)return;
  requestAnimationFrame(idleBg);
  ctx.fillStyle='rgba(2,12,18,0.15)';ctx.fillRect(0,0,W,H);
  const t=ts/900,len=8;
  ctx.save();ctx.shadowBlur=10;ctx.shadowColor='rgba(0,255,136,0.28)';
  for(let i=0;i<len;i++){
    const x=COLS/2+Math.cos(t+i*.45)*5,y=ROWS/2+Math.sin(t*.65+i*.45)*3.5;
    ctx.fillStyle=i===0?'#00ff88':`rgba(0,${185-i*16},60,${1-i*.11})`;
    ctx.fillRect(x*CELL+1,y*CELL+1,CELL-2,CELL-2);
  }
  ctx.restore();
}
requestAnimationFrame(idleBg);
showScreen('screenLevel');