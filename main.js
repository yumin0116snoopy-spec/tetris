const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const DROP_BASE = 1000;

const canvas = document.getElementById('board');
const context = canvas.getContext('2d');
context.scale(BLOCK, BLOCK);

const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold');
const holdCtx = holdCanvas.getContext('2d');

const overlay = document.getElementById('overlay');
const startButton = document.getElementById('start-btn');
const stateMessage = document.getElementById('state-message');

const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');

const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
};

const COLORS = {
  I: '#38bdf8',
  J: '#6366f1',
  L: '#f59e0b',
  O: '#facc15',
  S: '#22c55e',
  T: '#a855f7',
  Z: '#ef4444',
};

let board;
let dropCounter = 0;
let dropInterval = DROP_BASE;
let lastTime = 0;
let animationId;

const player = {
  pos: { x: 0, y: 0 },
  matrix: null,
  type: null,
  hold: null,
  canHold: true,
};

let queue = [];

function createMatrix(w, h) {
  return Array.from({ length: h }, () => Array(w).fill(0));
}

function createPiece(type) {
  return SHAPES[type].map((row) => row.slice());
}

function getRandomBag() {
  const bag = Object.keys(SHAPES);
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function ensureQueue() {
  while (queue.length < 5) {
    queue = queue.concat(getRandomBag());
  }
}

function drawMatrix(matrix, offset, ctx = context) {
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        ctx.fillStyle = COLORS[value];
        ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.4)';
        ctx.lineWidth = 0.05;
        ctx.strokeRect(x + offset.x, y + offset.y, 1, 1);
      }
    });
  });
}

function drawBoardGrid() {
  context.lineWidth = 0.02;
  context.strokeStyle = 'rgba(148, 163, 184, 0.18)';
  for (let x = 0; x <= COLS; x += 1) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, ROWS);
    context.stroke();
  }
  for (let y = 0; y <= ROWS; y += 1) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(COLS, y);
    context.stroke();
  }
}

function draw() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawMatrix(board, { x: 0, y: 0 });
  drawMatrix(player.matrix, player.pos);
  drawBoardGrid();
}

function merge(boardMatrix, playerPiece) {
  playerPiece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        boardMatrix[y + playerPiece.pos.y][x + playerPiece.pos.x] = value;
      }
    });
  });
}

function collide(boardMatrix, playerPiece) {
  const { matrix, pos } = playerPiece;
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix[y].length; x += 1) {
      if (
        matrix[y][x] !== 0 &&
        (boardMatrix[y + pos.y] && boardMatrix[y + pos.y][x + pos.x]) !== 0
      ) {
        return true;
      }
    }
  }
  return false;
}

function rotate(matrix, dir) {
  const rotated = matrix[0].map((_, index) => matrix.map((row) => row[index]));
  if (dir > 0) {
    return rotated.map((row) => row.reverse());
  }
  return rotated.reverse();
}

function playerRotate(dir) {
  const oldMatrix = player.matrix;
  const rotated = rotate(oldMatrix, dir);
  const pos = player.pos.x;
  let offset = 1;
  player.matrix = rotated;
  while (collide(board, player)) {
    player.pos.x += offset;
    offset = -(offset + (offset > 0 ? 1 : -1));
    if (offset > oldMatrix[0].length) {
      player.matrix = oldMatrix;
      player.pos.x = pos;
      return;
    }
  }
}

function sweep() {
  let rowCount = 0;
  outer: for (let y = board.length - 1; y >= 0; y -= 1) {
    for (let x = 0; x < board[y].length; x += 1) {
      if (board[y][x] === 0) {
        continue outer;
      }
    }
    const row = board.splice(y, 1)[0].fill(0);
    board.unshift(row);
    y += 1;
    rowCount += 1;
  }
  if (rowCount > 0) {
    const scoreTable = [0, 40, 100, 300, 1200];
    player.score += scoreTable[rowCount] * (player.level + 1);
    player.lines += rowCount;
    player.level = Math.floor(player.lines / 10);
    dropInterval = Math.max(120, DROP_BASE - player.level * 80);
    updateScore();
  }
}

function hardDrop() {
  while (!collide(board, player)) {
    player.pos.y += 1;
  }
  player.pos.y -= 1;
  lockPiece();
}

function lockPiece() {
  merge(board, player);
  sweep();
  playerReset();
}

function playerDrop() {
  player.pos.y += 1;
  if (collide(board, player)) {
    player.pos.y -= 1;
    lockPiece();
  }
  dropCounter = 0;
}

function playerMove(dir) {
  player.pos.x += dir;
  if (collide(board, player)) {
    player.pos.x -= dir;
  }
}

function update(time = 0) {
  const delta = time - lastTime;
  lastTime = time;
  dropCounter += delta;
  if (dropCounter > dropInterval) {
    playerDrop();
  }
  draw();
  animationId = requestAnimationFrame(update);
}

function resetBoard() {
  board = createMatrix(COLS, ROWS);
}

function playerReset() {
  ensureQueue();
  const type = queue.shift();
  player.matrix = createPiece(type).map((row) => row.map((value) => (value ? type : 0)));
  player.type = type;
  player.pos.y = 0;
  player.pos.x = Math.floor(COLS / 2) - Math.ceil(player.matrix[0].length / 2);
  player.canHold = true;
  updatePreview();
  if (collide(board, player)) {
    gameOver();
  }
}

function drawPreviewPiece(ctx, canvas, type) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!type) return;
  const matrix = createPiece(type);
  const cell = canvas.width / 4;
  const offsetX = (4 - matrix[0].length) / 2;
  const offsetY = (4 - matrix.length) / 2;
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        ctx.fillStyle = COLORS[type];
        ctx.fillRect((x + offsetX) * cell, (y + offsetY) * cell, cell, cell);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
        ctx.lineWidth = Math.max(1, cell * 0.08);
        ctx.strokeRect((x + offsetX) * cell, (y + offsetY) * cell, cell, cell);
      }
    });
  });
}

function updatePreview() {
  ensureQueue();
  drawPreviewPiece(nextCtx, nextCanvas, queue[0]);
  drawPreviewPiece(holdCtx, holdCanvas, player.hold);
}

function hold() {
  if (!player.canHold) return;
  const currentType = player.type;
  if (player.hold) {
    const swapType = player.hold;
    player.hold = currentType;
    player.matrix = createPiece(swapType).map((row) => row.map((value) => (value ? swapType : 0)));
    player.type = swapType;
  } else {
    player.hold = currentType;
    playerReset();
  }
  player.pos.y = 0;
  player.pos.x = Math.floor(COLS / 2) - Math.ceil(player.matrix[0].length / 2);
  player.canHold = false;
  updatePreview();
}

function updateScore() {
  scoreEl.textContent = player.score;
  linesEl.textContent = player.lines;
  levelEl.textContent = player.level + 1;
}

function setupControls() {
  document.addEventListener('keydown', (event) => {
    if (overlay.classList.contains('hidden')) {
      switch (event.code) {
        case 'ArrowLeft':
          event.preventDefault();
          playerMove(-1);
          break;
        case 'ArrowRight':
          event.preventDefault();
          playerMove(1);
          break;
        case 'ArrowDown':
          event.preventDefault();
          playerDrop();
          break;
        case 'ArrowUp':
          event.preventDefault();
          playerRotate(1);
          break;
        case 'KeyZ':
          event.preventDefault();
          playerRotate(-1);
          break;
        case 'Space':
          event.preventDefault();
          hardDrop();
          break;
        case 'KeyC':
          event.preventDefault();
          hold();
          break;
        default:
          break;
      }
    }
  });
}

function startGame() {
  overlay.classList.add('hidden');
  cancelAnimationFrame(animationId);
  resetBoard();
  queue = [];
  ensureQueue();
  player.score = 0;
  player.lines = 0;
  player.level = 0;
  player.hold = null;
  playerReset();
  updateScore();
  dropInterval = DROP_BASE;
  lastTime = 0;
  dropCounter = 0;
  updatePreview();
  update();
}

function gameOver() {
  cancelAnimationFrame(animationId);
  overlay.classList.remove('hidden');
  stateMessage.textContent = `ゲームオーバー! スコア: ${player.score}`;
  startButton.textContent = 'もう一度';
}

startButton.addEventListener('click', () => {
  stateMessage.textContent = '準備完了';
  startButton.textContent = 'スタート';
  startGame();
});

setupControls();

// 初期描画
resetBoard();
player.matrix = createPiece('I').map((row) => row.map((value) => (value ? 'I' : 0)));
player.type = 'I';
player.pos = { x: 3, y: 3 };
player.score = 0;
player.lines = 0;
player.level = 0;
draw();
updatePreview();
