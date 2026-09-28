const WIDTH = 400;
const HEIGHT = 700;
const DEFAULT_COLUMNS = 18;
const DEFAULT_ROWS = 16;
const EDITOR_COLUMNS = 20;
const EDITOR_ROWS = 18;
const CELL = 20;
const DEFAULT_BOARD_Y = 28;
const FIXED_STEP = 1 / 120;
const MAX_FRAME_TIME = 0.08;
const BASE_SPEED = 240;
const BASE_PADDLE_WIDTH = 82;
const COMBO_GROWTH = 1.15;
const STORAGE_PREFIX = "art-breaker-prototype";
const LASER_COLOR = "#ff3da5";
const PROTOTYPE_APP_USERNAME = "art_breaker";
const PROTOTYPE_USER_USERNAME = "prototype_user";

const POWER_UPS = {
  wide: { label: "W", color: "#b6ff3b", name: "WIDE", weight: 15 },
  narrow: { label: "N", color: "#b6ff3b", name: "NARROW", weight: 15 },
  slow: { label: "S", color: "#ff4554", name: "SLOW", weight: 10 },
  shield: { label: "B", color: "#35d9ff", name: "SAFETY BAR", weight: 15 },
  laser: { label: "L", color: LASER_COLOR, name: "LASER", weight: 10 },
  fast: { label: "F", color: "#ffe14a", name: "FAST", weight: 10 },
  multi: { label: "M", color: "#f6f4eb", name: "MULTI-BALL", weight: 10 },
  fire: { icon: "fire", color: "#ff8a32", name: "FIREBALL", weight: 10 },
  chain: { icon: "bolt", color: "#92939c", name: "CHAIN LIGHTNING", weight: 5 },
};

function choosePowerType(random) {
  let roll = random() * 100;
  for (const [type, definition] of Object.entries(POWER_UPS)) {
    roll -= definition.weight;
    if (roll < 0) return type;
  }
  return "wide";
}

const PALETTE = [
  { name: "Red", hex: "#ff4554" },
  { name: "Orange", hex: "#ff8a32" },
  { name: "Yellow", hex: "#ffe14a" },
  { name: "Lime", hex: "#b6ff3b" },
  { name: "Green", hex: "#38df75" },
  { name: "Cyan", hex: "#35d9ff" },
  { name: "Blue", hex: "#4387ff" },
  { name: "Violet", hex: "#8f6bff" },
  { name: "Magenta", hex: "#df4dff" },
  { name: "Hot Pink", hex: "#ff3da5" },
  { name: "Gray", hex: "#92939c" },
  { name: "White", hex: "#f6f4eb" },
  { name: "Pink", hex: "#ff91c8" },
  { name: "Brown", hex: "#9a5b3f" },
];

const EDITOR_PALETTE_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 11, 12];

const dom = {
  views: [...document.querySelectorAll("[data-view]")],
  soundToggle: document.querySelector("#soundToggle"),
  postPreview: document.querySelector("#postPreview"),
  postTitle: document.querySelector("#postTitle"),
  postLevelName: document.querySelector("#postLevelName"),
  postByline: document.querySelector("#postByline"),
  postBest: document.querySelector("#postBest"),
  openPlay: document.querySelector("#openPlay"),
  openCreate: document.querySelector("#openCreate"),
  playTitle: document.querySelector("#playTitle"),
  scoreValue: document.querySelector("#scoreValue"),
  comboValue: document.querySelector("#comboValue"),
  bestValue: document.querySelector("#bestValue"),
  remainingCount: document.querySelector("#remainingCount"),
  gameCanvas: document.querySelector("#gameCanvas"),
  gameStage: document.querySelector("#gameStage"),
  gameOverlay: document.querySelector("#gameOverlay"),
  overlayKicker: document.querySelector("#overlayKicker"),
  overlayTitle: document.querySelector("#overlayTitle"),
  overlayHint: document.querySelector("#overlayHint"),
  restartGame: document.querySelector("#restartGame"),
  editorGrid: document.querySelector("#editorGrid"),
  palette: document.querySelector("#palette"),
  selectedColorName: document.querySelector("#selectedColorName"),
  brickCount: document.querySelector("#brickCount"),
  undoButton: document.querySelector("#undoButton"),
  redoButton: document.querySelector("#redoButton"),
  clearButton: document.querySelector("#clearButton"),
  previewButton: document.querySelector("#previewButton"),
  publishButton: document.querySelector("#publishButton"),
  editorMessage: document.querySelector("#editorMessage"),
  previewDialog: document.querySelector("#previewDialog"),
  creatorPreview: document.querySelector("#creatorPreview"),
  closePreview: document.querySelector("#closePreview"),
  playDraft: document.querySelector("#playDraft"),
  toast: document.querySelector("#toast"),
};

function makeSeedBoard() {
  const rainbow = [1, 2, 3, 5, 6, 7, 8];
  const board = new Array(DEFAULT_COLUMNS * DEFAULT_ROWS).fill(0);
  for (let row = 2; row < DEFAULT_ROWS; row += 1) {
    for (let column = 1; column < DEFAULT_COLUMNS - 1; column += 1) {
      board[row * DEFAULT_COLUMNS + column] = rainbow[(row - 2) % rainbow.length];
    }
  }
  return board;
}

function dimensionsForBoard(board, columns, rows) {
  if (columns && rows && columns * rows === board.length) return { columns, rows };
  if (board.length === EDITOR_COLUMNS * EDITOR_ROWS) return { columns: EDITOR_COLUMNS, rows: EDITOR_ROWS };
  return { columns: DEFAULT_COLUMNS, rows: DEFAULT_ROWS };
}

function canonicalBoard(board, columns, rows) {
  const dimensions = dimensionsForBoard(board, columns, rows);
  return `v2:${dimensions.columns}x${dimensions.rows}:${board.map((value) => value.toString(16)).join("")}`;
}

function hashBoard(board, columns, rows) {
  const input = canonicalBoard(board, columns, rows);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function formatScore(value) {
  return Math.round(value).toLocaleString("en-US");
}

function getBest(hash) {
  try {
    return Number.parseInt(localStorage.getItem(`${STORAGE_PREFIX}:best:${hash}`) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function setBest(hash, score) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}:best:${hash}`, String(score));
  } catch {
    // The game remains playable when browser storage is unavailable.
  }
}

function loadPublishedBoards() {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}:boards`) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((record) => Array.isArray(record.board)
        && [DEFAULT_COLUMNS * DEFAULT_ROWS, EDITOR_COLUMNS * EDITOR_ROWS].includes(record.board.length))
      .map((record) => ({ ...record, ...dimensionsForBoard(record.board, record.columns, record.rows) }));
  } catch {
    return [];
  }
}

function savePublishedBoards(records) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}:boards`, JSON.stringify(records.slice(-20)));
  } catch {
    // Local publishing is a progressive enhancement in this prototype.
  }
}

function drawBoardPreview(canvas, board, showGrid = false, columns, rows) {
  const context = canvas.getContext("2d");
  const dimensions = dimensionsForBoard(board, columns, rows);
  const boardX = (canvas.width - dimensions.columns * CELL) / 2;
  const occupiedRows = board
    .map((value, index) => value > 0 ? Math.floor(index / dimensions.columns) : -1)
    .filter((row) => row >= 0);
  const minOccupiedRow = occupiedRows.length ? Math.min(...occupiedRows) : 0;
  const maxOccupiedRow = occupiedRows.length ? Math.max(...occupiedRows) : dimensions.rows - 1;
  const artworkHeight = (maxOccupiedRow - minOccupiedRow + 1) * CELL;
  const boardY = showGrid
    ? (canvas.height - dimensions.rows * CELL) / 2
    : (canvas.height - artworkHeight) / 2 - minOccupiedRow * CELL;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111113";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < dimensions.rows; row += 1) {
    for (let column = 0; column < dimensions.columns; column += 1) {
      const value = board[row * dimensions.columns + column];
      const x = boardX + column * CELL;
      const y = boardY + row * CELL;
      if (value > 0) {
        context.fillStyle = PALETTE[value - 1].hex;
        context.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        context.fillStyle = "rgba(255,255,255,.2)";
        context.fillRect(x + 2, y + 2, CELL - 4, 2);
        context.fillStyle = "rgba(0,0,0,.2)";
        context.fillRect(x + 2, y + CELL - 4, CELL - 4, 2);
      } else if (showGrid) {
        context.strokeStyle = "#29292d";
        context.lineWidth = 1;
        context.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      }
    }
  }
}

class ChipAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.muted = false;
    this.voices = 0;
  }

  async enable() {
    if (this.muted) return false;
    try {
      if (!this.context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return false;
        this.context = new AudioContextClass();
        this.master = this.context.createGain();
        this.compressor = this.context.createDynamicsCompressor();
        this.master.gain.value = 3;
        this.compressor.threshold.value = -14;
        this.compressor.knee.value = 10;
        this.compressor.ratio.value = 8;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.12;
        this.master.connect(this.compressor).connect(this.context.destination);
      }
      if (this.context.state === "suspended") await this.context.resume();
      return true;
    } catch {
      return false;
    }
  }

  tone(frequency, duration = 0.06, type = "square", volume = 0.035, delay = 0) {
    if (this.muted || !this.context || this.voices > 12) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(40, frequency), now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.master || this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
    this.voices += 1;
    oscillator.addEventListener("ended", () => { this.voices = Math.max(0, this.voices - 1); }, { once: true });
  }

  effect(name, detail = 0) {
    if (this.muted || !this.context) return;
    const effects = {
      start: () => [220, 330, 440].forEach((note, index) => this.tone(note, 0.07, "square", 0.035, index * 0.055)),
      wall: () => this.tone(145, 0.025, "square", 0.012),
      paddle: () => this.tone(190 + detail * 90, 0.055, "square", 0.035),
      brick: () => this.tone(300 + detail * 34, 0.045, "square", 0.028),
      combo: () => [523, 659].forEach((note, index) => this.tone(note, 0.08, "square", 0.04, index * 0.04)),
      drop: () => this.tone(260, 0.08, "triangle", 0.028),
      pickup: () => [440, 660, 880].forEach((note, index) => this.tone(note, 0.055, "square", 0.035, index * 0.035)),
      laser: () => this.tone(760, 0.035, "sawtooth", 0.018),
      shield: () => [330, 250, 190].forEach((note, index) => this.tone(note, 0.08, "triangle", 0.04, index * 0.035)),
      lose: () => [220, 165, 110].forEach((note, index) => this.tone(note, 0.18, "square", 0.04, index * 0.12)),
      win: () => [392, 523, 659, 784].forEach((note, index) => this.tone(note, 0.12, "square", 0.045, index * 0.08)),
      paint: () => this.tone(500 + detail * 28, 0.025, "square", 0.012),
      erase: () => this.tone(150, 0.025, "triangle", 0.012),
      post: () => [440, 554, 659, 880].forEach((note, index) => this.tone(note, 0.08, "square", 0.035, index * 0.055)),
    };
    effects[name]?.();
  }

  toggle() {
    this.muted = !this.muted;
    if (!this.muted) this.enable();
    return this.muted;
  }
}

const audio = new ChipAudio();

function seededRandom(seedText) {
  let state = Number.parseInt(seedText.slice(0, 8), 16) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function makePowerPlan(board, hash, columns) {
  const occupied = board
    .map((value, index) => ({ value, index }))
    .filter((cell) => cell.value > 0);
  const target = occupied.length >= 12
    ? Math.min(11, Math.max(1, Math.round(occupied.length / 18)))
    : 0;
  const random = seededRandom(hash);
  const shuffled = [...occupied];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }

  const chosen = [];
  for (const candidate of shuffled) {
    const row = Math.floor(candidate.index / columns);
    const isSpaced = chosen.every((cell) => Math.abs(Math.floor(cell.index / columns) - row) >= 2);
    if (isSpaced || shuffled.length - chosen.length <= target) chosen.push(candidate);
    if (chosen.length === target) break;
  }
  while (chosen.length < target) {
    const fallback = shuffled.find((cell) => !chosen.some((item) => item.index === cell.index));
    if (!fallback) break;
    chosen.push(fallback);
  }

  return new Map(chosen.map((cell) => [cell.index, choosePowerType(random)]));
}

class ArtBreakerGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.record = null;
    this.state = "idle";
    this.particles = [];
    this.floaters = [];
    this.lightningArcs = [];
    this.shake = 0;
    this.keys = new Set();
    this.pointerX = WIDTH / 2;
    this.pointerActive = false;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.loop = this.loop.bind(this);
    this.bindInput();
    requestAnimationFrame(this.loop);
  }

  bindInput() {
    const updatePointerPosition = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointerX = Math.max(0, Math.min(WIDTH, (event.clientX - rect.left) * WIDTH / rect.width));
      this.pointerActive = true;
      if (this.state === "ready") {
        this.paddle.x = Math.max(0, Math.min(WIDTH - this.paddle.width, this.pointerX - this.paddle.width / 2));
        this.ball.x = this.paddle.x + this.paddle.width / 2;
      }
    };
    dom.gameStage.addEventListener("pointerdown", updatePointerPosition);
    dom.gameStage.addEventListener("pointermove", updatePointerPosition);

    window.addEventListener("keydown", (event) => {
      if (location.hash !== "#play") return;
      if (["ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
      if (event.key.toLowerCase() === "s" && this.state === "running" && !event.repeat) {
        event.preventDefault();
        this.breakRandomBrick();
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        this.pointerActive = false;
        this.keys.add(event.key);
      }
      if (event.key === " " && this.state !== "running") this.handleOverlay();
    });

    window.addEventListener("keyup", (event) => this.keys.delete(event.key));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "running") {
        this.state = "paused";
        this.setOverlay("PAUSED", "PRESS TO RESUME", "Your run is frozen");
      }
      this.lastTime = performance.now();
      this.accumulator = 0;
    });
  }

  breakRandomBrick() {
    const activeBricks = this.bricks.filter((brick) => brick.active);
    if (!activeBricks.length) return;
    const brick = activeBricks[Math.floor(Math.random() * activeBricks.length)];
    this.destroyBrick(brick, "shortcut");
    if (this.state === "running") {
      this.addFloater(brick.x + brick.width / 2, brick.y, "S BREAK!", "#f6f4eb");
    }
  }

  setBoard(record) {
    this.record = { ...record, ...dimensionsForBoard(record.board, record.columns, record.rows) };
    this.reset();
  }

  clearSession() {
    this.state = "idle";
    this.record = null;
    this.score = 0;
    this.combo = 0;
    this.remaining = 0;
    this.simulationTime = 0;
    this.speedTier = 0;
    this.ball = null;
    this.balls = [];
    this.bricks = [];
    this.powerUps = [];
    this.bullets = [];
    this.particles = [];
    this.floaters = [];
    this.lightningArcs = [];
    this.accumulator = 0;
    this.laserUntil = 0;
    this.shieldUntil = 0;
    this.slowUntil = 0;
    this.fastUntil = 0;
    this.chainUntil = 0;
    this.fireHitsRemaining = 0;
  }

  reset() {
    if (!this.record) return;
    this.state = "ready";
    this.score = 0;
    this.combo = 0;
    this.simulationTime = 0;
    this.speedTier = 0;
    this.shake = 0;
    this.particles = [];
    this.floaters = [];
    this.lightningArcs = [];
    this.powerUps = [];
    this.bullets = [];
    this.laserUntil = 0;
    this.shotTimer = 0;
    this.shieldUntil = 0;
    this.slowUntil = 0;
    this.fastUntil = 0;
    this.chainUntil = 0;
    this.paddleSizeType = null;
    this.paddleSizeUntil = 0;
    this.fireHitsRemaining = 0;
    this.lastSpeedMultiplier = 1;
    this.lastWallSound = -1;
    this.columns = this.record.columns;
    this.rows = this.record.rows;
    this.boardX = (WIDTH - this.columns * CELL) / 2;
    this.boardY = this.rows === DEFAULT_ROWS ? DEFAULT_BOARD_Y : 0;
    this.best = getBest(this.record.hash);
    this.bricks = this.record.board.map((value, index) => ({
      index,
      value,
      active: value > 0,
      x: this.boardX + (index % this.columns) * CELL,
      y: this.boardY + Math.floor(index / this.columns) * CELL,
      width: CELL - 2,
      height: CELL - 2,
    }));
    this.initialBrickCount = this.bricks.filter((brick) => brick.active).length;
    this.remaining = this.initialBrickCount;
    this.powerPlan = makePowerPlan(
      this.record.board,
      this.record.gameplaySeed || this.record.hash,
      this.columns,
    );
    this.paddle = { x: 159, y: 650, width: BASE_PADDLE_WIDTH, height: 10 };
    this.ball = { x: 200, y: 642, radius: 6, vx: 0, vy: 0, speed: BASE_SPEED };
    this.balls = [this.ball];
    this.updateHud();
    const action = window.matchMedia("(pointer: coarse)").matches ? "PRESS" : "CLICK";
    this.setOverlay("READY?", `${action} TO PLAY`, "Move with your pointer or arrow keys");
  }

  setOverlay(kicker, title, hint) {
    dom.overlayKicker.textContent = kicker;
    dom.overlayTitle.textContent = title;
    dom.overlayHint.textContent = hint;
    dom.gameOverlay.classList.remove("is-running");
  }

  async handleOverlay() {
    await audio.enable();
    if (this.state === "over") this.reset();
    if (this.state === "ready") this.start();
    else if (this.state === "paused") this.resume();
  }

  start() {
    const gameplaySeed = this.record.gameplaySeed || this.record.hash;
    const direction = Number.parseInt(gameplaySeed.slice(-1), 16) % 2 === 0 ? -1 : 1;
    const horizontal = 145 * direction;
    this.ball.vx = horizontal;
    this.ball.vy = -Math.sqrt(this.ball.speed ** 2 - horizontal ** 2);
    this.state = "running";
    this.lastTime = performance.now();
    this.accumulator = 0;
    dom.gameOverlay.classList.add("is-running");
    audio.effect("start");
  }

  resume() {
    this.state = "running";
    this.lastTime = performance.now();
    this.accumulator = 0;
    dom.gameOverlay.classList.add("is-running");
  }

  loop(now) {
    const elapsed = Math.min(MAX_FRAME_TIME, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    if (this.state === "running") {
      this.accumulator += elapsed;
      while (this.accumulator >= FIXED_STEP && this.state === "running") {
        this.update(FIXED_STEP);
        this.accumulator -= FIXED_STEP;
      }
    }
    this.updateEffects(elapsed);
    this.render();
    requestAnimationFrame(this.loop);
  }

  update(dt) {
    this.simulationTime += dt;
    this.updateTimedEffects();
    this.updatePaddle(dt);
    this.updateLaser(dt);
    this.updatePowerUps(dt);
    this.updateBalls(dt);
  }

  updateTimedEffects() {
    if (this.paddleSizeType && this.simulationTime >= this.paddleSizeUntil) {
      this.setPaddleWidth(BASE_PADDLE_WIDTH);
      this.paddleSizeType = null;
    }
    const multiplier = (this.simulationTime < this.slowUntil ? 0.6 : 1)
      * (this.simulationTime < this.fastUntil ? 1.35 : 1);
    if (multiplier !== this.lastSpeedMultiplier) {
      for (const ball of this.balls) {
        const magnitude = Math.hypot(ball.vx, ball.vy) || 1;
        const target = ball.speed * multiplier;
        ball.vx = ball.vx / magnitude * target;
        ball.vy = ball.vy / magnitude * target;
      }
      this.lastSpeedMultiplier = multiplier;
    }
  }

  setPaddleWidth(width) {
    const center = this.paddle.x + this.paddle.width / 2;
    this.paddle.width = width;
    this.paddle.x = Math.max(0, Math.min(WIDTH - width, center - width / 2));
  }

  updatePaddle(dt) {
    if (this.pointerActive) {
      this.paddle.x = Math.max(0, Math.min(WIDTH - this.paddle.width, this.pointerX - this.paddle.width / 2));
      return;
    }
    let direction = 0;
    if (this.keys.has("ArrowLeft")) direction -= 1;
    if (this.keys.has("ArrowRight")) direction += 1;
    this.paddle.x = Math.max(0, Math.min(WIDTH - this.paddle.width, this.paddle.x + direction * 360 * dt));
  }

  updateBalls(dt) {
    for (let index = this.balls.length - 1; index >= 0; index -= 1) {
      this.updateBall(this.balls[index], dt);
      if (this.state !== "running") return;
      if (this.balls[index].y - this.balls[index].radius > HEIGHT) this.balls.splice(index, 1);
    }
    if (this.balls.length === 0) this.finish(false);
    else this.ball = this.balls[0];
  }

  updateBall(ball, dt) {
    const previous = { x: ball.x, y: ball.y };
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x - ball.radius < 0) {
      ball.x = ball.radius;
      ball.vx = Math.abs(ball.vx);
      this.wallSound();
    } else if (ball.x + ball.radius > WIDTH) {
      ball.x = WIDTH - ball.radius;
      ball.vx = -Math.abs(ball.vx);
      this.wallSound();
    }
    if (ball.y - ball.radius < 0) {
      ball.y = ball.radius;
      ball.vy = Math.abs(ball.vy);
      this.wallSound();
    }

    const crossedPaddle = ball.vy > 0
      && previous.y + ball.radius <= this.paddle.y
      && ball.y + ball.radius >= this.paddle.y
      && ball.x + ball.radius >= this.paddle.x
      && ball.x - ball.radius <= this.paddle.x + this.paddle.width;

    if (crossedPaddle) {
      const center = this.paddle.x + this.paddle.width / 2;
      const hit = Math.max(-1, Math.min(1, (ball.x - center) / (this.paddle.width / 2)));
      const angle = hit * (Math.PI * 0.35);
      const effectiveSpeed = ball.speed * this.lastSpeedMultiplier;
      ball.vx = Math.sin(angle) * effectiveSpeed;
      ball.vy = -Math.abs(Math.cos(angle) * effectiveSpeed);
      ball.y = this.paddle.y - ball.radius;
      this.combo = 0;
      this.burst(ball.x, this.paddle.y, "#b6ff3b", 7, 90);
      audio.effect("paddle", (hit + 1) / 2);
      this.updateHud();
    }

    const collision = this.findBrickCollision(ball, previous);
    if (collision) {
      const { brick, normalX, normalY } = collision;
      const isFireball = this.fireHitsRemaining > 0;
      if (!isFireball) {
        const dot = ball.vx * normalX + ball.vy * normalY;
        if (dot < 0) {
          ball.vx -= 2 * dot * normalX;
          ball.vy -= 2 * dot * normalY;
        }
        if (normalX < 0) ball.x = brick.x - ball.radius;
        if (normalX > 0) ball.x = brick.x + brick.width + ball.radius;
        if (normalY < 0) ball.y = brick.y - ball.radius;
        if (normalY > 0) ball.y = brick.y + brick.height + ball.radius;
      }
      this.destroyBrick(brick, "ball");
      if (isFireball) this.fireHitsRemaining -= 1;
    }

    const shieldY = 676;
    if (this.simulationTime < this.shieldUntil && ball.vy > 0
      && previous.y + ball.radius <= shieldY
      && ball.y + ball.radius >= shieldY) {
      ball.y = shieldY - ball.radius;
      ball.vy = -Math.abs(ball.vy);
      this.shieldUntil = 0;
      this.shake = Math.max(this.shake, 5);
      this.burst(ball.x, shieldY, "#35d9ff", 20, 150);
      audio.effect("shield");
    }
  }

  findBrickCollision(ball, previous) {
    const candidates = [];
    for (const brick of this.bricks) {
      if (!brick.active) continue;
      const closestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.width));
      const closestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.height));
      const dx = ball.x - closestX;
      const dy = ball.y - closestY;
      if (dx * dx + dy * dy > ball.radius ** 2) continue;

      let normalX = 0;
      let normalY = 0;
      if (previous.y + ball.radius <= brick.y) normalY = -1;
      else if (previous.y - ball.radius >= brick.y + brick.height) normalY = 1;
      else if (previous.x + ball.radius <= brick.x) normalX = -1;
      else if (previous.x - ball.radius >= brick.x + brick.width) normalX = 1;
      else {
        const distances = [
          { value: Math.abs(ball.x - brick.x), x: -1, y: 0 },
          { value: Math.abs(ball.x - (brick.x + brick.width)), x: 1, y: 0 },
          { value: Math.abs(ball.y - brick.y), x: 0, y: -1 },
          { value: Math.abs(ball.y - (brick.y + brick.height)), x: 0, y: 1 },
        ].sort((a, b) => a.value - b.value);
        normalX = distances[0].x;
        normalY = distances[0].y;
      }
      const approaching = ball.vx * normalX + ball.vy * normalY < 0;
      if (approaching) candidates.push({ brick, normalX, normalY });
    }
    candidates.sort((a, b) => a.brick.index - b.brick.index);
    return candidates[0] || null;
  }

  wallSound() {
    if (this.simulationTime - this.lastWallSound > 0.04) {
      audio.effect("wall");
      this.lastWallSound = this.simulationTime;
    }
  }

  destroyBrick(brick, source = "ball") {
    if (!brick.active || this.state !== "running") return;
    brick.active = false;
    this.remaining -= 1;
    const comboBeforeHit = this.combo;
    const points = Math.round(100 * COMBO_GROWTH ** comboBeforeHit);
    this.score += points;
    this.combo += 1;
    const color = PALETTE[brick.value - 1].hex;
    this.burst(brick.x + brick.width / 2, brick.y + brick.height / 2, color, source === "laser" ? 5 : 9, 115);
    if (points >= 300 || this.combo % 5 === 0) this.addFloater(brick.x + 9, brick.y, `+${formatScore(points)}`, color);
    this.shake = Math.max(this.shake, Math.min(3.5, 0.8 + this.combo * 0.04));
    const row = Math.floor(brick.index / this.columns);
    const pitchStep = this.rows - 1 - row;
    audio.effect(this.combo % 10 === 0 ? "combo" : "brick", pitchStep);
    this.applySpeedTier();
    this.updateHud();

    const powerType = this.powerPlan.get(brick.index);
    if (powerType) {
      this.powerUps.push({
        x: brick.x + brick.width / 2,
        y: brick.y + brick.height / 2,
        radius: 8,
        speed: 95,
        type: powerType,
      });
      audio.effect("drop");
    }

    if (source === "ball" && this.simulationTime < this.chainUntil && this.remaining > 0) {
      this.triggerChain(brick);
      if (this.state !== "running") return;
    }

    if (this.remaining === 0) this.finish(true);
  }

  triggerChain(origin) {
    const originX = origin.x + origin.width / 2;
    const originY = origin.y + origin.height / 2;
    const nearby = this.bricks
      .filter((brick) => brick.active && Math.hypot(
        brick.x + brick.width / 2 - originX,
        brick.y + brick.height / 2 - originY,
      ) <= CELL * 4.5)
      .sort(() => Math.random() - 0.5);
    const count = Math.min(nearby.length, 2 + (Math.random() < 0.5 ? 0 : 1));
    for (const brick of nearby.slice(0, count)) {
      this.lightningArcs.push({
        x1: originX,
        y1: originY,
        x2: brick.x + brick.width / 2,
        y2: brick.y + brick.height / 2,
        life: 0.16,
        maxLife: 0.16,
      });
      this.destroyBrick(brick, "chain");
      if (this.state !== "running") return;
    }
  }

  applySpeedTier() {
    const destroyed = this.initialBrickCount - this.remaining;
    const nextTier = destroyed >= this.initialBrickCount * 2 / 3
      ? 2
      : destroyed >= this.initialBrickCount / 3 ? 1 : 0;
    if (nextTier <= this.speedTier) return;
    this.speedTier = nextTier;
    for (const ball of this.balls) {
      ball.speed = BASE_SPEED + this.speedTier * 34;
      const magnitude = Math.hypot(ball.vx, ball.vy) || 1;
      const target = ball.speed * this.lastSpeedMultiplier;
      ball.vx = ball.vx / magnitude * target;
      ball.vy = ball.vy / magnitude * target;
    }
  }

  updatePowerUps(dt) {
    for (let index = this.powerUps.length - 1; index >= 0; index -= 1) {
      const power = this.powerUps[index];
      power.y += power.speed * dt;
      const caught = power.y + power.radius >= this.paddle.y
        && power.y - power.radius <= this.paddle.y + this.paddle.height
        && power.x + power.radius >= this.paddle.x
        && power.x - power.radius <= this.paddle.x + this.paddle.width;
      if (caught) {
        const definition = POWER_UPS[power.type];
        this.activatePowerUp(power.type);
        this.addFloater(power.x, power.y, `${definition.name}!`, definition.color);
        this.burst(power.x, power.y, definition.color, 14, 130);
        this.powerUps.splice(index, 1);
        audio.effect("pickup");
      } else if (power.y - power.radius > HEIGHT) {
        this.powerUps.splice(index, 1);
      }
    }
  }

  activatePowerUp(type) {
    if (type === "laser") {
      this.laserUntil = this.simulationTime + 8;
      this.shotTimer = 0;
    } else if (type === "shield") {
      this.shieldUntil = this.simulationTime + 15;
    } else if (type === "wide" || type === "narrow") {
      this.paddleSizeType = type;
      this.paddleSizeUntil = this.simulationTime + (type === "wide" ? 15 : 10);
      this.setPaddleWidth(BASE_PADDLE_WIDTH * (type === "wide" ? 1.5 : 0.5));
    } else if (type === "slow") {
      this.slowUntil = this.simulationTime + 15;
    } else if (type === "fast") {
      this.fastUntil = this.simulationTime + 10;
    } else if (type === "chain") {
      this.chainUntil = this.simulationTime + 10;
    } else if (type === "fire") {
      this.fireHitsRemaining = 10;
    } else if (type === "multi") {
      this.addMultiBall();
    }
    this.updateTimedEffects();
  }

  addMultiBall() {
    const source = this.balls[0];
    if (!source) return;
    const angles = [-Math.PI / 9, Math.PI / 9];
    for (const angle of angles) {
      if (this.balls.length >= 5) break;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      this.balls.push({
        ...source,
        x: source.x + Math.sign(angle) * 2,
        vx: source.vx * cos - source.vy * sin,
        vy: source.vx * sin + source.vy * cos,
      });
    }
  }

  updateLaser(dt) {
    if (this.simulationTime < this.laserUntil) {
      this.shotTimer -= dt;
      if (this.shotTimer <= 0) {
        this.bullets.push(
          { x: this.paddle.x + 16, y: this.paddle.y, speed: 430 },
          { x: this.paddle.x + this.paddle.width - 16, y: this.paddle.y, speed: 430 },
        );
        this.shotTimer += 0.5;
        audio.effect("laser");
      }
    }

    for (let index = this.bullets.length - 1; index >= 0; index -= 1) {
      const bullet = this.bullets[index];
      bullet.y -= bullet.speed * dt;
      const hit = this.bricks.find((brick) => brick.active
        && bullet.x >= brick.x
        && bullet.x <= brick.x + brick.width
        && bullet.y <= brick.y + brick.height
        && bullet.y + 10 >= brick.y);
      if (hit) {
        this.bullets.splice(index, 1);
        this.destroyBrick(hit, "laser");
      } else if (bullet.y + 10 < 0) {
        this.bullets.splice(index, 1);
      }
      if (this.state !== "running") return;
    }
  }

  finish(won) {
    if (this.state === "over") return;
    this.state = "over";
    this.bullets = [];
    this.powerUps = [];
    this.laserUntil = 0;
    this.shieldUntil = 0;
    if (this.score > this.best) {
      this.best = this.score;
      setBest(this.record.hash, this.best);
    }
    this.updateHud();
    this.setOverlay(
      won ? `CLEAR · ${formatScore(this.score)}` : `GAME OVER · ${formatScore(this.score)}`,
      "PLAY AGAIN",
      `Best on this board: ${formatScore(this.best)}`,
    );
    this.shake = won ? 7 : 4;
    audio.effect(won ? "win" : "lose");
    if (won) {
      for (let index = 0; index < 7; index += 1) {
        this.burst(45 + index * 52, 420 + (index % 2) * 35, PALETTE[index].hex, 14, 190);
      }
    }
  }

  updateEffects(dt) {
    const motionScale = this.reducedMotion ? 0 : 1;
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index];
      particle.life -= dt;
      particle.x += particle.vx * dt * motionScale;
      particle.y += particle.vy * dt * motionScale;
      particle.vy += 190 * dt * motionScale;
      if (particle.life <= 0) this.particles.splice(index, 1);
    }
    for (let index = this.floaters.length - 1; index >= 0; index -= 1) {
      const floater = this.floaters[index];
      floater.life -= dt;
      floater.y -= 25 * dt * motionScale;
      if (floater.life <= 0) this.floaters.splice(index, 1);
    }
    for (let index = this.lightningArcs.length - 1; index >= 0; index -= 1) {
      this.lightningArcs[index].life -= dt;
      if (this.lightningArcs[index].life <= 0) this.lightningArcs.splice(index, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 18);
  }

  burst(x, y, color, count, force) {
    const amount = this.reducedMotion ? Math.min(3, count) : count;
    for (let index = 0; index < amount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = force * (0.35 + Math.random() * 0.65);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 2 + Math.random() * 3,
        life: 0.28 + Math.random() * 0.28,
        maxLife: 0.56,
      });
    }
  }

  addFloater(x, y, text, color) {
    this.floaters.push({ x, y, text, color, life: 0.75, maxLife: 0.75 });
  }

  updateHud() {
    dom.scoreValue.textContent = formatScore(this.score || 0);
    dom.comboValue.textContent = `×${this.combo || 0}`;
    dom.bestValue.textContent = formatScore(this.best || 0);
    dom.remainingCount.textContent = String(this.remaining || 0);
  }

  render() {
    if (!this.record || !this.ball) return;
    const context = this.context;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = "#111113";
    context.fillRect(0, 0, WIDTH, HEIGHT);

    context.save();
    if (!this.reducedMotion && this.shake > 0) {
      context.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    context.strokeStyle = "#44444a";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(1, 0);
    context.lineTo(1, HEIGHT);
    context.moveTo(WIDTH - 1, 0);
    context.lineTo(WIDTH - 1, HEIGHT);
    context.moveTo(0, 1);
    context.lineTo(WIDTH, 1);
    context.stroke();

    for (const brick of this.bricks) {
      if (!brick.active) continue;
      const color = PALETTE[brick.value - 1].hex;
      context.fillStyle = color;
      context.fillRect(brick.x, brick.y, brick.width, brick.height);
      context.fillStyle = "rgba(255,255,255,.22)";
      context.fillRect(brick.x + 2, brick.y + 2, brick.width - 4, 2);
      context.fillStyle = "rgba(0,0,0,.22)";
      context.fillRect(brick.x + 2, brick.y + brick.height - 3, brick.width - 4, 2);
    }

    if (this.simulationTime < this.shieldUntil) {
      context.save();
      context.strokeStyle = "#35d9ff";
      context.lineWidth = 2;
      context.setLineDash([7, 6]);
      context.lineDashOffset = -this.simulationTime * 30;
      context.beginPath();
      context.moveTo(8, 676);
      context.lineTo(WIDTH - 8, 676);
      context.stroke();
      context.restore();
    }

    for (const power of this.powerUps) this.drawPowerUp(power);

    context.fillStyle = LASER_COLOR;
    for (const bullet of this.bullets) context.fillRect(bullet.x - 2, bullet.y, 4, 10);

    context.fillStyle = "#b6ff3b";
    context.fillRect(this.paddle.x, this.paddle.y, this.paddle.width, this.paddle.height);
    context.fillStyle = "rgba(255,255,255,.35)";
    context.fillRect(this.paddle.x + 3, this.paddle.y + 2, this.paddle.width - 6, 2);
    if (this.simulationTime < this.laserUntil) {
      context.fillStyle = LASER_COLOR;
      context.fillRect(this.paddle.x + 10, this.paddle.y + 2, 6, this.paddle.height - 4);
      context.fillRect(this.paddle.x + this.paddle.width - 16, this.paddle.y + 2, 6, this.paddle.height - 4);
    }

    for (const arc of this.lightningArcs) {
      context.save();
      context.globalAlpha = Math.max(0, arc.life / arc.maxLife);
      context.strokeStyle = "#f6f4eb";
      context.shadowColor = "#35d9ff";
      context.shadowBlur = 7;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(arc.x1, arc.y1);
      for (let step = 1; step < 4; step += 1) {
        const progress = step / 4;
        context.lineTo(
          arc.x1 + (arc.x2 - arc.x1) * progress + (Math.random() - 0.5) * 9,
          arc.y1 + (arc.y2 - arc.y1) * progress + (Math.random() - 0.5) * 9,
        );
      }
      context.lineTo(arc.x2, arc.y2);
      context.stroke();
      context.restore();
    }

    for (const ball of this.balls) this.drawBall(ball);

    for (const particle of this.particles) {
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    context.globalAlpha = 1;

    context.font = '700 12px "JetBrains Mono", monospace';
    context.textAlign = "center";
    for (const floater of this.floaters) {
      context.globalAlpha = Math.max(0, floater.life / floater.maxLife);
      context.fillStyle = floater.color;
      context.fillText(floater.text, floater.x, floater.y);
    }
    context.globalAlpha = 1;

    this.drawActiveEffects();
    context.restore();
  }

  drawPowerUp(power) {
    const context = this.context;
    const definition = POWER_UPS[power.type];
    context.save();
    context.shadowColor = definition.color;
    context.shadowBlur = 7;
    context.fillStyle = definition.color;
    context.beginPath();
    context.arc(power.x, power.y, power.radius, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = "#111113";
    if (definition.icon === "fire") {
      context.beginPath();
      context.moveTo(power.x, power.y - 5.5);
      context.bezierCurveTo(power.x + 1, power.y - 2, power.x + 5, power.y - 1, power.x + 4, power.y + 3);
      context.bezierCurveTo(power.x + 3, power.y + 6, power.x - 4, power.y + 6, power.x - 4, power.y + 1);
      context.bezierCurveTo(power.x - 4, power.y - 1, power.x - 1, power.y - 2, power.x, power.y - 5.5);
      context.fill();
      context.fillStyle = definition.color;
      context.beginPath();
      context.arc(power.x, power.y + 2, 1.5, 0, Math.PI * 2);
      context.fill();
    } else if (definition.icon === "bolt") {
      context.beginPath();
      context.moveTo(power.x + 1, power.y - 6);
      context.lineTo(power.x - 4, power.y + 1);
      context.lineTo(power.x, power.y + 1);
      context.lineTo(power.x - 1, power.y + 6);
      context.lineTo(power.x + 5, power.y - 2);
      context.lineTo(power.x + 1, power.y - 2);
      context.closePath();
      context.fill();
    } else {
      context.font = '800 10px "JetBrains Mono", monospace';
      context.textAlign = "center";
      context.textBaseline = "alphabetic";
      const metrics = context.measureText(definition.label);
      const centeredBaseline = power.y
        + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
      context.fillText(definition.label, power.x, centeredBaseline);
    }
    context.restore();
  }

  drawBall(ball) {
    const context = this.context;
    if (this.fireHitsRemaining > 0) {
      const strength = this.fireHitsRemaining / 10;
      const magnitude = Math.hypot(ball.vx, ball.vy) || 1;
      const tailX = -ball.vx / magnitude;
      const tailY = -ball.vy / magnitude;
      context.save();
      context.globalAlpha = 0.35 + strength * 0.45;
      context.fillStyle = "#ff8a32";
      context.beginPath();
      context.arc(ball.x + tailX * (5 + strength * 4), ball.y + tailY * (5 + strength * 4), 3 + strength * 4, 0, Math.PI * 2);
      context.fill();
      context.shadowColor = "#ff4554";
      context.shadowBlur = 8 + strength * 10;
      context.fillStyle = "#ffe14a";
      context.beginPath();
      context.arc(ball.x, ball.y, ball.radius + strength * 2, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    context.save();
    context.shadowColor = this.fireHitsRemaining > 0 ? "#ff8a32" : "rgba(246,244,235,.7)";
    context.shadowBlur = 8;
    context.fillStyle = "#f6f4eb";
    context.beginPath();
    context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  drawActiveEffects() {
    const context = this.context;
    const statuses = [];
    const timed = (until) => Math.max(0, until - this.simulationTime).toFixed(1);
    if (this.simulationTime < this.laserUntil) statuses.push([`LASER ${timed(this.laserUntil)}s`, POWER_UPS.laser.color]);
    if (this.simulationTime < this.shieldUntil) statuses.push([`SAFETY ${timed(this.shieldUntil)}s`, POWER_UPS.shield.color]);
    if (this.paddleSizeType) statuses.push([`${POWER_UPS[this.paddleSizeType].name} ${timed(this.paddleSizeUntil)}s`, POWER_UPS[this.paddleSizeType].color]);
    if (this.simulationTime < this.slowUntil) statuses.push([`SLOW ${timed(this.slowUntil)}s`, POWER_UPS.slow.color]);
    if (this.simulationTime < this.fastUntil) statuses.push([`FAST ${timed(this.fastUntil)}s`, POWER_UPS.fast.color]);
    if (this.simulationTime < this.chainUntil) statuses.push([`CHAIN ${timed(this.chainUntil)}s`, POWER_UPS.chain.color]);
    if (this.fireHitsRemaining > 0) statuses.push([`FIRE ${this.fireHitsRemaining}/10`, POWER_UPS.fire.color]);
    context.font = '700 10px "JetBrains Mono", monospace';
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    statuses.forEach(([label, color], index) => {
      context.fillStyle = color;
      context.fillText(label, 10, 18 + index * 14);
    });
  }
}

const seedBoard = makeSeedBoard();
const seedRecord = {
  id: "seed",
  title: "Rainbow No. 1",
  creator: `Created by u/${PROTOTYPE_APP_USERNAME}`,
  columns: DEFAULT_COLUMNS,
  rows: DEFAULT_ROWS,
  board: seedBoard,
  hash: hashBoard(seedBoard, DEFAULT_COLUMNS, DEFAULT_ROWS),
};
let publishedBoards = loadPublishedBoards();
let currentRecord = seedRecord;
let activePlayRecord = seedRecord;
let playBackTarget = "post";
const game = new ArtBreakerGame(dom.gameCanvas);

function updatePost(record = currentRecord) {
  dom.postTitle.textContent = record.title;
  dom.postLevelName.textContent = record.title;
  dom.postByline.textContent = record.creator;
  const dimensions = dimensionsForBoard(record.board, record.columns, record.rows);
  const best = getBest(record.hash);
  dom.postBest.textContent = best ? formatScore(best) : "—";
  drawBoardPreview(dom.postPreview, record.board, false, dimensions.columns, dimensions.rows);
}

function showView(name) {
  if (name !== "play") game.clearSession();
  for (const view of dom.views) view.hidden = view.dataset.view !== name;
  if (name === "post") updatePost();
  if (name === "play") {
    dom.playTitle.textContent = activePlayRecord.title;
    game.setBoard(activePlayRecord);
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

function navigate(name) {
  if (location.hash === `#${name}`) showView(name);
  else location.hash = name;
}

function resolveRoute() {
  const route = location.hash.slice(1);
  showView(["post", "play", "create"].includes(route) ? route : "post");
}

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { dom.toast.hidden = true; }, 2600);
}

let editorBoard = new Array(EDITOR_COLUMNS * EDITOR_ROWS).fill(0);
let selectedColor = 1;
let undoStack = [];
let redoStack = [];
let editorDragging = false;
let strokeValue = 0;
let longPressTimer = 0;
let longPressIndex = -1;
const editorCells = [];

function cancelEditorLongPress() {
  window.clearTimeout(longPressTimer);
  longPressTimer = 0;
  longPressIndex = -1;
}

function buildEditor() {
  for (let index = 0; index < EDITOR_COLUMNS * EDITOR_ROWS; index += 1) {
    const row = Math.floor(index / EDITOR_COLUMNS);
    const column = index % EDITOR_COLUMNS;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "editor-cell";
    button.dataset.index = String(index);
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", `Row ${row + 1}, column ${column + 1}, empty`);
    dom.editorGrid.appendChild(button);
    editorCells.push(button);
  }

  EDITOR_PALETTE_ORDER.forEach((colorValue, displayIndex) => {
    const color = PALETTE[colorValue - 1];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch";
    button.style.setProperty("--swatch", color.hex);
    button.setAttribute("aria-label", color.name);
    button.setAttribute("aria-pressed", colorValue === selectedColor ? "true" : "false");
    button.addEventListener("click", async () => {
      selectedColor = colorValue;
      dom.selectedColorName.textContent = color.name.toUpperCase();
      [...dom.palette.children].forEach((swatch, swatchIndex) => {
        swatch.setAttribute("aria-pressed", swatchIndex === displayIndex ? "true" : "false");
      });
      await audio.enable();
      audio.effect("paint", selectedColor);
    });
    dom.palette.appendChild(button);
  });

  dom.editorGrid.addEventListener("pointerdown", (event) => {
    const cell = event.target.closest(".editor-cell");
    if (!cell) return;
    event.preventDefault();
    cancelEditorLongPress();
    const index = Number(cell.dataset.index);
    const sourceBoard = [...editorBoard];
    undoStack.push(sourceBoard);
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    strokeValue = sourceBoard[index] === selectedColor ? 0 : selectedColor;
    editorDragging = true;
    longPressIndex = index;
    void audio.enable();
    applyEditorCell(index, strokeValue);
    longPressTimer = window.setTimeout(() => {
      if (!editorDragging || longPressIndex !== index) return;
      fillEditorRegion(index, sourceBoard, strokeValue);
      editorDragging = false;
      cancelEditorLongPress();
    }, 550);
  });

  document.addEventListener("pointermove", (event) => {
    if (!editorDragging) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const cell = target?.closest?.(".editor-cell");
    if (!cell) {
      cancelEditorLongPress();
      return;
    }
    const index = Number(cell.dataset.index);
    if (index !== longPressIndex) cancelEditorLongPress();
    applyEditorCell(index, strokeValue, false);
  });
  document.addEventListener("pointerup", () => {
    editorDragging = false;
    cancelEditorLongPress();
  });
  document.addEventListener("pointercancel", () => {
    editorDragging = false;
    cancelEditorLongPress();
  });
  dom.editorGrid.addEventListener("contextmenu", (event) => event.preventDefault());

  dom.editorGrid.addEventListener("click", (event) => {
    if (event.detail !== 0) return;
    const cell = event.target.closest(".editor-cell");
    if (!cell) return;
    const index = Number(cell.dataset.index);
    undoStack.push([...editorBoard]);
    redoStack = [];
    applyEditorCell(index, editorBoard[index] === selectedColor ? 0 : selectedColor);
  });
}

function fillEditorRegion(startIndex, sourceBoard, value) {
  const sourceValue = sourceBoard[startIndex];
  const pending = [startIndex];
  const visited = new Uint8Array(sourceBoard.length);
  let changed = false;

  while (pending.length) {
    const index = pending.pop();
    if (visited[index] || sourceBoard[index] !== sourceValue) continue;
    visited[index] = 1;
    if (editorBoard[index] !== value) {
      editorBoard[index] = value;
      renderEditorCell(index);
      changed = true;
    }

    const row = Math.floor(index / EDITOR_COLUMNS);
    const column = index % EDITOR_COLUMNS;
    if (row > 0) pending.push(index - EDITOR_COLUMNS);
    if (row < EDITOR_ROWS - 1) pending.push(index + EDITOR_COLUMNS);
    if (column > 0) pending.push(index - 1);
    if (column < EDITOR_COLUMNS - 1) pending.push(index + 1);
  }

  if (changed) audio.effect(value === 0 ? "erase" : "paint", value);
  updateEditorControls();
}

function applyEditorCell(index, value, withSound = true) {
  if (editorBoard[index] === value) return;
  editorBoard[index] = value;
  if (withSound) audio.effect(value === 0 ? "erase" : "paint", value);
  renderEditorCell(index);
  updateEditorControls();
}

function renderEditorCell(index) {
  const value = editorBoard[index];
  const cell = editorCells[index];
  if (!cell) return;
  cell.style.background = value ? PALETTE[value - 1].hex : "#1b1b1e";
  const row = Math.floor(index / EDITOR_COLUMNS);
  const column = index % EDITOR_COLUMNS;
  cell.setAttribute("aria-label", `Row ${row + 1}, column ${column + 1}, ${value ? PALETTE[value - 1].name : "empty"}`);
}

function renderEditor() {
  editorBoard.forEach((_, index) => renderEditorCell(index));
  updateEditorControls();
}

function updateEditorControls() {
  const count = editorBoard.filter(Boolean).length;
  dom.brickCount.textContent = String(count);
  dom.undoButton.disabled = undoStack.length === 0;
  dom.redoButton.disabled = redoStack.length === 0;
  dom.clearButton.disabled = count === 0;
  dom.previewButton.disabled = count === 0;
  dom.publishButton.disabled = count === 0;
}

function resetEditor() {
  editorBoard = new Array(EDITOR_COLUMNS * EDITOR_ROWS).fill(0);
  undoStack = [];
  redoStack = [];
  dom.editorMessage.hidden = true;
  dom.editorMessage.replaceChildren();
  renderEditor();
}

function undoEditor() {
  if (!undoStack.length) return;
  redoStack.push([...editorBoard]);
  editorBoard = undoStack.pop();
  renderEditor();
}

function redoEditor() {
  if (!redoStack.length) return;
  undoStack.push([...editorBoard]);
  editorBoard = redoStack.pop();
  renderEditor();
}

function clearEditor() {
  if (!editorBoard.some(Boolean)) return;
  undoStack.push([...editorBoard]);
  redoStack = [];
  editorBoard = new Array(EDITOR_COLUMNS * EDITOR_ROWS).fill(0);
  audio.effect("erase");
  renderEditor();
}

function allKnownBoards() {
  return [seedRecord, ...publishedBoards];
}

function findDuplicate(board) {
  const canonical = canonicalBoard(board);
  return allKnownBoards().find((record) => record.hash === hashBoard(board)
    && canonicalBoard(record.board, record.columns, record.rows) === canonical);
}

function showDuplicate(record) {
  dom.editorMessage.replaceChildren();
  dom.editorMessage.append("This board is identical to one that already exists. ");
  const link = document.createElement("a");
  link.href = "#post";
  link.textContent = "Play it here.";
  link.addEventListener("click", () => { currentRecord = record; });
  dom.editorMessage.append(link);
  dom.editorMessage.hidden = false;
}

function publishBoard() {
  if (!editorBoard.some(Boolean)) return;
  const duplicate = findDuplicate(editorBoard);
  if (duplicate) {
    showDuplicate(duplicate);
    return;
  }

  const hash = hashBoard(editorBoard);
  const record = {
    id: `local-${hash}`,
    title: `Board ${hash.slice(0, 4).toUpperCase()}`,
    creator: `Created by u/${PROTOTYPE_USER_USERNAME}`,
    columns: EDITOR_COLUMNS,
    rows: EDITOR_ROWS,
    board: [...editorBoard],
    hash,
  };
  publishedBoards.push(record);
  savePublishedBoards(publishedBoards);
  currentRecord = record;
  audio.effect("post");
  showToast("Board posted locally — your new level is ready.");
  navigate("post");
}

dom.soundToggle.addEventListener("click", async () => {
  await audio.enable();
  const muted = audio.toggle();
  dom.soundToggle.setAttribute("aria-pressed", muted ? "true" : "false");
  dom.soundToggle.setAttribute("aria-label", muted ? "Turn sound on" : "Mute sound");
});

dom.openPlay.addEventListener("click", () => {
  activePlayRecord = currentRecord;
  playBackTarget = "post";
  navigate("play");
});
dom.openCreate.addEventListener("click", () => {
  resetEditor();
  navigate("create");
});
document.querySelectorAll("[data-back]").forEach((button) => button.addEventListener("click", () => {
  const target = location.hash === "#play" ? playBackTarget : "post";
  navigate(target);
}));
dom.gameOverlay.addEventListener("click", () => game.handleOverlay());
dom.restartGame.addEventListener("click", () => game.reset());
dom.undoButton.addEventListener("click", undoEditor);
dom.redoButton.addEventListener("click", redoEditor);
dom.clearButton.addEventListener("click", clearEditor);
dom.previewButton.addEventListener("click", () => {
  drawBoardPreview(dom.creatorPreview, editorBoard, true);
  dom.previewDialog.showModal();
});
dom.closePreview.addEventListener("click", () => dom.previewDialog.close());
dom.previewDialog.addEventListener("click", (event) => {
  if (event.target === dom.previewDialog) dom.previewDialog.close();
});
dom.playDraft.addEventListener("click", () => {
  const board = [...editorBoard];
  activePlayRecord = {
    id: "draft",
    title: "Untitled draft",
    creator: "Draft · not posted",
    columns: EDITOR_COLUMNS,
    rows: EDITOR_ROWS,
    board,
    hash: hashBoard(board),
  };
  playBackTarget = "create";
  dom.previewDialog.close();
  navigate("play");
});
dom.publishButton.addEventListener("click", publishBoard);
window.addEventListener("hashchange", resolveRoute);

buildEditor();
renderEditor();
updatePost();
resolveRoute();
