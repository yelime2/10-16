const video = document.getElementById('webcam');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');

let gridSize = 5;
let cellSize = 40;
let targets = [];
let pieces = [];
let isShowingPattern = false;
let pinchPoint = { x:0, y:0, active:false };
let draggingIndex = -1;


function randColor(){ return `hsl(${Math.random()*360},75%,55%)`; }


function resizeCanvas(){
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  computeCellSize();
  drawScene();
}


function computeCellSize(){ cellSize = Math.min(canvas.width, canvas.height)/gridSize; }


function drawGrid(){
  ctx.lineWidth=0.8;
    ctx.strokeStyle='rgb(61, 61, 61)';
  for(let r=0;r<gridSize;r++){
    for(let c=0;c<gridSize;c++){
      ctx.strokeRect(c*cellSize,r*cellSize,cellSize,cellSize);
    }
  }
}


function generateTargets(count=1){
  targets = [];
  const used = new Set();
  while(targets.length<count){
    const r=Math.floor(Math.random()*gridSize);
    const c=Math.floor(Math.random()*gridSize);
    const key=`${r},${c}`;
    if(used.has(key)) continue;
    used.add(key);
    targets.push({row:r,col:c,color:randColor()});
  }
}


function drawTargets(alpha=1){
  ctx.save();
  ctx.globalAlpha=alpha;
  for(const t of targets){
    ctx.fillStyle=t.color;
    ctx.fillRect(t.col*cellSize,t.row*cellSize,cellSize,cellSize);
    ctx.strokeStyle='rgba(0,0,0,0.85)';
    ctx.strokeRect(t.col*cellSize,t.row*cellSize,cellSize,cellSize);
  }
  ctx.restore();
}


function scatterPieces(){
  const occupied = new Set();
  pieces = targets.map(t=>{
    let r,c,tries=0;
    while(true){
      r=Math.floor(Math.random()*gridSize);
      c=Math.floor(Math.random()*gridSize);
      const key=`${r},${c}`;
      if(!occupied.has(key)) break;
      if(++tries>100) break;
    }
    occupied.add(`${r},${c}`);
    return { row:r, col:c, color:t.color, correctRow:t.row, correctCol:t.col };
  });
}


function drawPieces(){
  for(const p of pieces){
    ctx.fillStyle=p.color;
    ctx.fillRect(p.col*cellSize,p.row*cellSize,cellSize,cellSize);
    ctx.strokeStyle='#222';
    ctx.strokeRect(p.col*cellSize,p.row*cellSize,cellSize,cellSize);
    ctx.fillStyle='rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.arc(p.col*cellSize+cellSize/2,p.row*cellSize+cellSize/2,Math.max(3,cellSize*0.06),0,Math.PI*2);
    ctx.fill();
  }
}


function drawScene(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawGrid();
  if(isShowingPattern) drawTargets(0.9);
  else drawPieces();
}


function startGame(){
  gridSize = Math.max(2,Math.min(20,parseInt(document.getElementById('gridSize').value)||5));
  computeCellSize();
  generateTargets(1); 
  isShowingPattern=true;
  drawScene();
  document.getElementById('timer').innerText="3초간 위치를 기억하세요...";
  setTimeout(()=>{
    scatterPieces();
    isShowingPattern=false;
    drawScene();
    document.getElementById('timer').innerText="사각형을 원래 위치로 옮기세요";
  },3000);
}


function checkWin(){
  if(pieces.length===0) return;
  const ok = pieces.every(p=>p.row===p.correctRow && p.col===p.correctCol);
  if(ok) document.getElementById('timer').innerText="완료ㅎ 잘했어요!";
  else document.getElementById('timer').innerText="틀렸습니다ㅠ 다시 해보세요!";
}


function normalizedToCanvas(lm){
  return { x: overlay.width*(1-lm.x), y: overlay.height*lm.y };
}

function drawOverlay(results){
  octx.clearRect(0,0,overlay.width,overlay.height);
  if(!results.multiHandLandmarks) return;
  for(const landmarks of results.multiHandLandmarks){
    window.drawConnectors(octx,landmarks,window.HAND_CONNECTIONS,{color:'#22c55e',lineWidth:2});
    window.drawLandmarks(octx,landmarks,{color:'#ec4899',lineWidth:1});
  }
}

function updatePinch(results){
  pinchPoint.active=false;
  if(!results.multiHandLandmarks || results.multiHandLandmarks.length===0) return;
  const lm=results.multiHandLandmarks[0];
  const t=normalizedToCanvas(lm[4]);
  const i=normalizedToCanvas(lm[8]);
  const dx=t.x-i.x, dy=t.y-i.y;
  const dist=Math.hypot(dx,dy);
  const threshold=Math.min(overlay.width,overlay.height)*0.05;
  if(dist<threshold){
    pinchPoint.active=true;
    pinchPoint.x=(t.x+i.x)/2;
    pinchPoint.y=(t.y+i.y)/2;
  }
}

function canvasPointToGrid(px,py){
  const col=Math.max(0,Math.min(gridSize-1,Math.floor(px/cellSize)));
  const row=Math.max(0,Math.min(gridSize-1,Math.floor(py/cellSize)));
  return { row, col };
}

function tryStartDrag(){
  if(!pinchPoint.active || draggingIndex!==-1) return;
  const g=canvasPointToGrid(pinchPoint.x,pinchPoint.y);
  const idx=pieces.findIndex(p=>p.row===g.row && p.col===g.col);
  if(idx!==-1) draggingIndex=idx;
}

function updateDrag(){
  if(draggingIndex===-1) return;
  if(!pinchPoint.active){
    draggingIndex=-1;
    return;
  }
  const g=canvasPointToGrid(pinchPoint.x,pinchPoint.y);
  const p=pieces[draggingIndex];
  p.row=g.row; p.col=g.col;
}

function onResults(results){
  drawOverlay(results);
  updatePinch(results);
  if(!isShowingPattern){
    if(pinchPoint.active) tryStartDrag();
    updateDrag();
    drawScene();
  }
}


function initHands(){
  const hands=new window.Hands({ locateFile:(file)=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
  hands.setOptions({ maxNumHands:1, minDetectionConfidence:0.6, minTrackingConfidence:0.6, modelComplexity:0 });
  hands.onResults(onResults);

  const camera=new window.Camera(video,{
    onFrame: async ()=>{ await hands.send({image:video}); },
    width:overlay.width,
    height:overlay.height
  });
  camera.start();
}


function init(){
  video.addEventListener('loadedmetadata',resizeCanvas);
  drawScene();
  initHands();
}



window.addEventListener('load',init);
document.getElementById('startBtn').addEventListener('click',startGame);
document.getElementById('completeBtn').addEventListener('click',checkWin);

