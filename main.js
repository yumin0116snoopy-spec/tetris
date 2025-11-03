// ====== Canvas & Constants ======
const boardCanvas = document.getElementById("board");
const nextCanvas  = document.getElementById("next");
const holdCanvas  = document.getElementById("hold");
const ctx  = boardCanvas.getContext("2d");
const nctx = nextCanvas.getContext("2d");
const hctx = holdCanvas.getContext("2d");

const COLS = 10;
const ROWS = 20;
const SIZE = 30; // 1マス 30px => 300x600

// UI
const overlay = document.getElementById("overlay");
const stateMsg = document.getElementById("state-message");
const startBtn = document.getElementById("start-btn");
const $score = document.getElementById("score");
const $lines = document.getElementById("lines");
const $level = document.getElementById("level");

// ====== Game State ======
let board, piece, nextQueue, holdPiece, canHold;
let score, lines, level;
let dropCounter = 0;
let dropInterval = 1000; // ms
let lastTime = 0;
let running = false;
let gameOver = false;

// ====== Pieces ======
const COLORS = {
  I:"#22d3ee", J:"#60a5fa", L:"#fbbf24", O:"#fde047",
  S:"#34d399", T:"#c084fc", Z:"#f87171", G:"#334155" // G:ghost
};

// 各テトロミノの相対座標（回転の基準は [1,1] 付近）
const SHAPES = {
  I:[[0,1],[1,1],[2,1],[3,1]],
  J:[[0,0],[0,1],[1,1],[2,1]],
  L:[[2,0],[0,1],[1,1],[2,1]],
  O:[[1,0],[2,0],[1,1],[2,1]],
  S:[[1,0],[2,0],[0,1],[1,1]],
  T:[[1,0],[0,1],[1,1],[2,1]],
  Z:[[0,0],[1,0],[1,1],[2,1]],
};

// 7バッグ方式でキュー生成
function makeBag(){
  const bag = ["I","J","L","O","S","T","Z"];
  for (let i = bag.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

// ====== Helpers ======
function createMatrix(w,h){
  const m = [];
  while(h--){
    m.push(new Array(w).fill(0));
  }
  return m;
}

function clone(obj){ return JSON.parse(JSON.stringify(obj)); }

function drawCell(x,y,color,ghost=false){
  const c = ghost ? COLORS.G : color;
  ctx.fillStyle = c;
  ctx.fillRect(x*SIZE, y*SIZE, SIZE, SIZE);
  // 立体っぽい枠
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.strokeRect(x*SIZE+0.5, y*SIZE+0.5, SIZE-1, SIZE-1);
}

function valid(pos, shape){
  for (const [dx,dy] of shape){
    const x = pos.x + dx;
    const y = pos.y + dy;
    if (x<0 || x>=COLS || y>=ROWS) return false;
    if (y>=0 && board[y][x]) return false;
  }
  return true;
}

function rotate(shape){
  // 90度時計回り回転： [x,y] -> [y, -x] を正規化
  const rotated = shape.map(([x,y])=>[y, -x]);
  // 左上がマイナスにならないようにオフセット
  let minX = Math.min(...rotated.map(c=>c[0]));
  let minY = Math.min(...rotated.map(c=>c[1]));
  return rotated.map(([x,y])=>[x-minX, y-minY]);
}

// ウォールキック（簡易）：左右に1,2マス試す
function tryRotate(p){
  const r = rotate(p.shape);
  const tests = [0,-1,1,-2,2];
  for(const t of tests){
    const newPos = {x:p.pos.x+t, y:p.pos.y};
    if(valid(newPos, r)){ p.shape = r; p.pos = newPos; return; }
  }
}

// 盤面へ固定
function merge(p){
  for(const [dx,dy] of p.shape){
    const x = p.pos.x+dx;
    const y = p.pos.y+dy;
    if(y<0){ // 天井到達＝ゲームオーバー
      gameOver = true;
      running = false;
      showOverlay("ゲームオーバー");
      return;
    }
    board[y][x] = p.type;
  }
}

// ライン消去とスコア
function sweep(){
  let cleared = 0;
  outer: for(let y=ROWS-1; y>=0; y--){
    for(let x=0; x<COLS; x++){
      if(!board[y][x]) continue outer;
    }
    // 1行詰まり → 削除
    const row = board.splice(y,1)[0].fill(0);
    board.unshift(row);
    cleared++;
    y++; // 同じyを再チェック
  }
  if(cleared){
    const table = [0,100,300,500,800]; // 消した行数ごとの加点
    score += table[cleared]* (level);
    lines += cleared;
    if (Math.floor(lines/10)+1 > level){
      level++;
      dropInterval = Math.max(120, 1000 - (level-1)*80); // だんだん速く
    }
    updatePanel();
  }
}

function hardDrop(){
  while(move(0,1));
  lock();
}

function move(dx,dy){
  const newPos = {x:piece.pos.x+dx, y:piece.pos.y+dy};
  if(valid(newPos, piece.shape)){
    piece.pos = newPos; return true;
  }
  return false;
}

function lock(){
  merge(piece);
  if(gameOver){ return; }
  sweep();
  spawn();
}

// ゴースト（落下位置）
function ghostY(){
  const test = {pos:clone(piece.pos), shape:piece.shape};
  while(valid({x:test.pos.x,y:test.pos.y+1}, test.shape)){
    test.pos.y++;
  }
  return test.pos.y;
}

// ====== Spawn / Hold / Next ======
function makePiece(type){
  return {
    type,
    shape: clone(SHAPES[type]),
    pos: {x:3, y:-2}
  };
}

function spawn(){
  if (nextQueue.length < 7) nextQueue = nextQueue.concat(makeBag());
  const type = nextQueue.shift();
  piece = makePiece(type);
  canHold = true;
  drawNext();
}

function hold(){
  if(!canHold) return; // 1ターンに1回のみ
  canHold = false;
  if(!holdPiece){
    holdPiece = piece.type;
    spawn();
  }else{
    const tmp = holdPiece;
    holdPiece = piece.type;
    piece = makePiece(tmp);
  }
  drawHold();
}

function drawNext(){
  nctx.clearRect(0,0,nextCanvas.width,nextCanvas.height);
  const type = nextQueue[0];
  if(!type) return;
  drawMini(nctx, type);
}
function drawHold(){
  hctx.clearRect(0,0,holdCanvas.width,holdCanvas.height);
  if(!holdPiece) return;
  drawMini(hctx, holdPiece);
}

function drawMini(context, type){
  const shape = SHAPES[type];
  const cell = 24;
  // 形の幅高さを求め、中央寄せ
  const xs = shape.map(c=>c[0]);
  const ys = shape.map(c=>c[1]);
  const w = Math.max(...xs)-Math.min(...xs)+1;
  const h = Math.max(...ys)-Math.min(...ys)+1;
  const offX = Math.floor((context.canvas.width/cell - w)/2);
  const offY = Math.floor((context.canvas.height/cell - h)/2);
  context.fillStyle = COLORS[type];
  for(const [x,y] of shape){
    context.fillRect((x+offX)*cell, (y+offY)*cell, cell, cell);
    context.strokeStyle = "rgba(255,255,255,.1)";
    context.strokeRect((x+offX)*cell+.5, (y+offY)*cell+.5, cell-1, cell-1);
  }
}

// ====== Render ======
function draw(){
  ctx.clearRect(0,0,boardCanvas.width, boardCanvas.height);

  // 盤面
  for(let y=0; y<ROWS; y++){
    for(let x=0; x<COLS; x++){
      const t = board[y][x];
      if(t){ drawCell(x,y,COLORS[t]); }
    }
  }

  // ゴースト
  const gy = ghostY();
  for(const [dx,dy] of piece.shape){
    const x = piece.pos.x+dx;
    const y = gy+dy;
    if(y>=0) drawCell(x,y,COLORS.G,true);
  }

  // 現在のピース
  for(const [dx,dy] of piece.shape){
    const x = piece.pos.x+dx;
    const y = piece.pos.y+dy;
    if(y>=0) drawCell(x,y,COLORS[piece.type]);
  }
}

function update(time=0){
  if(!running) return;
  const delta = time - lastTime;
  lastTime = time;
  dropCounter += delta;

  if(dropCounter > dropInterval){
    if(!move(0,1)){ lock(); }
    dropCounter = 0;
  }
  draw();
  requestAnimationFrame(update);
}

// ====== UI & Controls ======
function updatePanel(){
  $score.textContent = score;
  $lines.textContent = lines;
  $level.textContent = level;
}

function showOverlay(msg){
  stateMsg.textContent = msg;
  overlay.classList.remove("hidden");
}
function hideOverlay(){
  overlay.classList.add("hidden");
}

function startGame(){
  board = createMatrix(COLS, ROWS);
  nextQueue = makeBag();
  holdPiece = null;
  canHold = true;

  score = 0; lines = 0; level = 1;
  dropInterval = 1000;
  updatePanel();

  spawn();
  drawHold();

  gameOver = false;
  running = true;
  hideOverlay();
  lastTime = 0; dropCounter = 0;
  requestAnimationFrame(update);
}

// キー操作
document.addEventListener("keydown", (e)=>{
  if(!running) return;
  switch(e.code){
    case "ArrowLeft":  move(-1,0); break;
    case "ArrowRight": move(1,0);  break;
    case "ArrowDown":  if(move(0,1)) score += 1, updatePanel(); break;
    case "ArrowUp":    tryRotate(piece); break;
    case "Space":      hardDrop(); break;
    case "KeyC":       hold(); break;
  }
});

startBtn.addEventListener("click", ()=>{
  if(gameOver){ startBtn.textContent = "リスタート"; }
  startGame();
});

// 初期表示
showOverlay("スタートを押してください");
drawNext();
drawHold();
