import {
  CELL_SIZE,
  DEFAULT_BOARD_Y,
  GAME_HEIGHT,
  GAME_WIDTH,
  PALETTE,
  POWER_UPS,
  resolveAccuracyAttempt,
  scoreForClear,
  makePowerPlan,
  pointsForCombo,
  seededRandom,
  type Board,
  type AccuracyAttempt,
  type PowerUpName,
} from '../shared/game';

type Ball = { x: number; y: number; vx: number; vy: number; radius: number; speed: number; accuracyAttempt: AccuracyAttempt; fireHits: number };
type Brick = { index: number; value: number; active: boolean; x: number; y: number; width: number; height: number; flash: number };
type Pickup = { type: PowerUpName; x: number; y: number; radius: number };
type Bullet = { x: number; y: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number };
type Floater = { x: number; y: number; text: string; color: string; life: number; maxLife: number };
type LightningArc = { x1: number; y1: number; x2: number; y2: number; life: number; maxLife: number };
type BrickCollision = { brick: Brick; normalX: number; normalY: number };

export type GameHud = { score: number; combo: number; remaining: number };
export type RunResult = { score: number; baseScore: number; elapsedMs: number; cleared: boolean; brickHits: number; paddleHits: number; accuracyHits: number; accuracyAttempts: number; pickups: number };
type EngineCallbacks = { onHud: (hud: GameHud) => void; onFinish: (result: RunResult) => void };

const BASE_SPEED = 240;
const BASE_PADDLE_WIDTH = 82;
const FIXED_STEP = 1 / 120;
const PICKUP_RADIUS = 10;

class ChipAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = 0;
  muted = false;

  async enable(): Promise<void> {
    if (this.muted) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        const master = this.context.createGain();
        const compressor = this.context.createDynamicsCompressor();
        master.gain.value = 3;
        compressor.threshold.value = -14;
        compressor.knee.value = 10;
        compressor.ratio.value = 8;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.12;
        master.connect(compressor).connect(this.context.destination);
        this.master = master;
      }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch { /* Audio remains optional. */ }
  }

  tone(frequency: number, duration: number, volume: number, type: OscillatorType = 'square', delay = 0): void {
    if (this.muted || !this.context || this.voices >= 12) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master ?? this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
    this.voices += 1;
    oscillator.addEventListener('ended', () => { this.voices = Math.max(0, this.voices - 1); }, { once: true });
  }

  effect(name: 'start' | 'wall' | 'paddle' | 'brick' | 'combo' | 'drop' | 'pickup' | 'laser' | 'shield' | 'lose' | 'win', detail = 0): void {
    if (name === 'wall') this.tone(145, 0.025, 0.012);
    if (name === 'paddle') this.tone(190 + detail * 90, 0.055, 0.035);
    if (name === 'brick') this.tone(300 + detail * 34, 0.045, 0.028);
    if (name === 'drop') this.tone(260, 0.08, 0.028, 'triangle');
    if (name === 'laser') this.tone(760, 0.035, 0.018, 'sawtooth');
    if (name === 'start') [220, 330, 440].forEach((note, index) => this.tone(note, 0.07, 0.035, 'square', index * 0.055));
    if (name === 'combo') [523, 659].forEach((note, index) => this.tone(note, 0.08, 0.04, 'square', index * 0.04));
    if (name === 'pickup') [440, 660, 880].forEach((note, index) => this.tone(note, 0.055, 0.035, 'square', index * 0.035));
    if (name === 'shield') [330, 250, 190].forEach((note, index) => this.tone(note, 0.08, 0.04, 'triangle', index * 0.035));
    if (name === 'lose') [220, 165, 110].forEach((note, index) => this.tone(note, 0.18, 0.04, 'square', index * 0.12));
    if (name === 'win') [392, 523, 659, 784].forEach((note, index) => this.tone(note, 0.12, 0.045, 'square', index * 0.08));
  }

  close(): void { void this.context?.close(); this.context = null; this.master = null; }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!muted) void this.enable();
  }
}

export class ArtBreakerEngine {
  private drawing: CanvasRenderingContext2D;
  private board: Board;
  private callbacks: EngineCallbacks;
  private audio = new ChipAudio();
  private frame = 0;
  private finishTimer = 0;
  private lastTime = performance.now();
  private accumulator = 0;
  private state: 'ready' | 'running' | 'paused' | 'over' = 'ready';
  private balls: Ball[] = [];
  private bricks: Brick[] = [];
  private pickups: Pickup[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private lightningArcs: LightningArc[] = [];
  private powerPlan = new Map<number, PowerUpName>();
  private random: () => number;
  private score = 0;
  private combo = 0;
  private remaining = 0;
  private simulationTime = 0;
  private brickHits = 0;
  private paddleHits = 0;
  private accuracyHits = 0;
  private accuracyAttempts = 0;
  private pickupCount = 0;
  private initialBrickCount = 0;
  private speedTier = 0;
  private shake = 0;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private lastWallSound = -1;
  private paddle = { x: 159, y: 650, width: BASE_PADDLE_WIDTH, height: 10 };
  private pointerX = GAME_WIDTH / 2;
  private pointerActive = false;
  private keys = new Set<string>();
  private wheelDirection = 0;
  private wheelUntil = 0;
  private paddleSize: PowerUpName | null = null;
  private paddleSizeUntil = 0;
  private slowUntil = 0;
  private fastUntil = 0;
  private laserUntil = 0;
  private shieldUntil = 0;
  private chainUntil = 0;
  private shotTimer = 0;
  private lastMultiplier = 1;
  private lastHud = 0;

  constructor(private canvas: HTMLCanvasElement, board: Board, callbacks: EngineCallbacks) {
    const drawing = canvas.getContext('2d');
    if (!drawing) throw new Error('Canvas is unavailable.');
    this.drawing = drawing;
    this.board = board;
    this.callbacks = callbacks;
    this.random = seededRandom(board.gameplaySeed);
    this.onPointer = this.onPointer.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onVisibility = this.onVisibility.bind(this);
    this.loop = this.loop.bind(this);
    canvas.addEventListener('pointerdown', this.onPointer);
    canvas.addEventListener('pointermove', this.onPointer);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.reset();
    this.frame = requestAnimationFrame(this.loop);
  }

  setMuted(muted: boolean): void { this.audio.setMuted(muted); }
  async enableAudio(): Promise<void> { await this.audio.enable(); }
  playClearRevealSound(step: number): void {
    const middleBrickPitch = Math.floor((this.board.rows - 1) / 2);
    this.audio.effect('brick', middleBrickPitch + Math.max(0, step));
  }
  get status(): 'ready' | 'running' | 'paused' | 'over' { return this.state; }

  reset(): void {
    this.state = 'ready';
    this.score = 0; this.combo = 0; this.simulationTime = 0; this.brickHits = 0; this.paddleHits = 0; this.accuracyHits = 0; this.accuracyAttempts = 0; this.pickupCount = 0;
    this.pickups = []; this.bullets = []; this.particles = []; this.floaters = []; this.lightningArcs = []; this.keys.clear();
    this.wheelDirection = 0; this.wheelUntil = 0;
    this.speedTier = 0; this.shake = 0; this.lastWallSound = -1;
    this.paddle = { x: 159, y: 650, width: BASE_PADDLE_WIDTH, height: 10 };
    this.balls = [{ x: 200, y: 642, vx: 0, vy: 0, radius: 6, speed: BASE_SPEED, accuracyAttempt: 'none', fireHits: 0 }];
    this.paddleSize = null; this.paddleSizeUntil = 0; this.slowUntil = 0; this.fastUntil = 0;
    this.laserUntil = 0; this.shieldUntil = 0; this.chainUntil = 0; this.shotTimer = 0; this.lastMultiplier = 1;
    const boardX = (GAME_WIDTH - this.board.columns * CELL_SIZE) / 2;
    const boardY = this.board.rows === 16 ? DEFAULT_BOARD_Y : 0;
    this.bricks = this.board.cells.map((value, index) => ({
      index, value, active: value > 0, x: boardX + index % this.board.columns * CELL_SIZE,
      y: boardY + Math.floor(index / this.board.columns) * CELL_SIZE, width: CELL_SIZE - 2, height: CELL_SIZE - 2, flash: 0,
    }));
    this.remaining = this.bricks.filter((brick) => brick.active).length;
    this.initialBrickCount = this.remaining;
    this.powerPlan = makePowerPlan(this.board);
    this.random = seededRandom(`${this.board.gameplaySeed.slice(0, 6)}c7`);
    this.emitHud(true);
  }

  async startOrResume(): Promise<void> {
    await this.audio.enable();
    if (this.state === 'over') this.reset();
    if (this.state === 'ready') {
      const direction = Number.parseInt(this.board.gameplaySeed.slice(-1), 16) % 2 === 0 ? -1 : 1;
      const ball = this.balls[0];
      if (ball) {
        ball.vx = 145 * direction;
        ball.vy = -Math.sqrt(ball.speed ** 2 - ball.vx ** 2);
        ball.accuracyAttempt = 'pending';
        this.paddleHits += 1;
      }
      this.state = 'running'; this.audio.effect('start');
    } else if (this.state === 'paused') this.state = 'running';
    this.lastTime = performance.now(); this.accumulator = 0;
  }

  pause(): void { if (this.state === 'running') this.state = 'paused'; }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    window.clearTimeout(this.finishTimer);
    this.state = 'over'; this.balls = []; this.bricks = []; this.pickups = []; this.bullets = [];
    this.particles = []; this.floaters = []; this.lightningArcs = [];
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    this.canvas.removeEventListener('pointermove', this.onPointer);
    this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.audio.close();
  }

  private onPointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerX = Math.max(0, Math.min(GAME_WIDTH, (event.clientX - rect.left) * GAME_WIDTH / rect.width));
    this.pointerActive = true;
    if (this.state === 'ready') {
      this.paddle.x = Math.max(0, Math.min(GAME_WIDTH - this.paddle.width, this.pointerX - this.paddle.width / 2));
      const ball = this.balls[0]; if (ball) ball.x = this.paddle.x + this.paddle.width / 2;
    }
  }

  private onWheel(event: WheelEvent): void {
    if (this.state !== 'running' || event.deltaY === 0) return;
    event.preventDefault();
    this.pointerActive = false;
    this.wheelDirection = event.deltaY < 0 ? 1 : -1;
    this.wheelUntil = this.simulationTime + 0.12;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); this.pointerActive = false; this.keys.add(event.key); }
    if (event.key === ' ') { event.preventDefault(); void this.startOrResume(); }
  }
  private onKeyUp(event: KeyboardEvent): void { this.keys.delete(event.key); }
  private onVisibility(): void { if (document.hidden) this.pause(); this.lastTime = performance.now(); this.accumulator = 0; }

  private loop(time: number): void {
    const elapsed = Math.min(0.08, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    if (this.state === 'running') {
      this.accumulator += elapsed;
      while (this.accumulator >= FIXED_STEP) { this.update(FIXED_STEP); this.accumulator -= FIXED_STEP; }
    }
    this.updateEffects(elapsed);
    this.draw();
    this.frame = requestAnimationFrame(this.loop);
  }

  private update(dt: number): void {
    this.simulationTime += dt;
    if (this.paddleSize && this.simulationTime >= this.paddleSizeUntil) { this.setPaddleWidth(BASE_PADDLE_WIDTH); this.paddleSize = null; }
    const multiplier = (this.simulationTime < this.slowUntil ? 0.6 : 1) * (this.simulationTime < this.fastUntil ? 1.35 : 1);
    if (multiplier !== this.lastMultiplier) {
      for (const ball of this.balls) {
        const magnitude = Math.hypot(ball.vx, ball.vy) || 1;
        ball.vx = ball.vx / magnitude * ball.speed * multiplier;
        ball.vy = ball.vy / magnitude * ball.speed * multiplier;
      }
      this.lastMultiplier = multiplier;
    }
    this.updatePaddle(dt);
    if (this.simulationTime < this.laserUntil) {
      this.shotTimer -= dt;
      if (this.shotTimer <= 0) { this.bullets.push({ x: this.paddle.x + 16, y: this.paddle.y }, { x: this.paddle.x + this.paddle.width - 16, y: this.paddle.y }); this.shotTimer += 0.5; this.audio.effect('laser'); }
    }
    this.updateBullets(dt);
    this.updatePickups(dt);
    for (let index = this.balls.length - 1; index >= 0; index -= 1) {
      const ball = this.balls[index];
      if (!ball) continue;
      this.updateBall(ball, dt);
      if (ball.y - ball.radius > GAME_HEIGHT) {
        this.resolveAccuracyAttempt(ball, false);
        this.balls.splice(index, 1);
      }
      if (this.state !== 'running') return;
    }
    if (!this.balls.length) this.finish(false);
    for (const brick of this.bricks) brick.flash = Math.max(0, brick.flash - dt);
    this.emitHud();
  }

  private updatePaddle(dt: number): void {
    if (this.pointerActive) this.paddle.x = Math.max(0, Math.min(GAME_WIDTH - this.paddle.width, this.pointerX - this.paddle.width / 2));
    else {
      const arrowDirection = Number(this.keys.has('ArrowRight')) - Number(this.keys.has('ArrowLeft'));
      const wheelDirection = this.simulationTime < this.wheelUntil ? this.wheelDirection : 0;
      const direction = Math.max(-1, Math.min(1, arrowDirection + wheelDirection));
      this.paddle.x = Math.max(0, Math.min(GAME_WIDTH - this.paddle.width, this.paddle.x + direction * 360 * dt));
    }
  }

  private updateBall(ball: Ball, dt: number): void {
    const previousX = ball.x; const previousY = ball.y;
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (ball.x - ball.radius < 0) { ball.x = ball.radius; ball.vx = Math.abs(ball.vx); this.wallSound(); }
    else if (ball.x + ball.radius > GAME_WIDTH) { ball.x = GAME_WIDTH - ball.radius; ball.vx = -Math.abs(ball.vx); this.wallSound(); }
    if (ball.y - ball.radius < 0) { ball.y = ball.radius; ball.vy = Math.abs(ball.vy); this.wallSound(); }
    if (ball.vy > 0 && ball.y + ball.radius >= this.paddle.y && previousY + ball.radius <= this.paddle.y
      && ball.x >= this.paddle.x - ball.radius && ball.x <= this.paddle.x + this.paddle.width + ball.radius) {
      ball.y = this.paddle.y - ball.radius;
      const offset = Math.max(-1, Math.min(1, (ball.x - (this.paddle.x + this.paddle.width / 2)) / (this.paddle.width / 2)));
      const angle = offset * (Math.PI * 0.35); const effectiveSpeed = ball.speed * this.lastMultiplier;
      ball.vx = Math.sin(angle) * effectiveSpeed; ball.vy = -Math.abs(Math.cos(angle) * effectiveSpeed);
      this.resolveAccuracyAttempt(ball, true);
      ball.accuracyAttempt = 'pending';
      this.combo = 0; this.paddleHits += 1; this.audio.effect('paddle', (offset + 1) / 2);
      this.burst(ball.x, this.paddle.y, '#b6ff3b', 7, 90);
    }
    const shieldY = 676;
    if (this.simulationTime < this.shieldUntil && ball.vy > 0
      && previousY + ball.radius <= shieldY && ball.y + ball.radius >= shieldY) {
      ball.y = shieldY - ball.radius; ball.vy = -Math.abs(ball.vy); this.shieldUntil = 0;
      this.shake = Math.max(this.shake, 5); this.burst(ball.x, shieldY, '#35d9ff', 20, 150); this.audio.effect('shield');
    }
    const collision = this.findBrickCollision(ball, { x: previousX, y: previousY });
    if (!collision) return;
    const { brick: hit, normalX, normalY } = collision;
    const passThrough = ball.fireHits > 0;
    if (!passThrough) {
      const dot = ball.vx * normalX + ball.vy * normalY;
      if (dot < 0) { ball.vx -= 2 * dot * normalX; ball.vy -= 2 * dot * normalY; }
      if (normalX < 0) ball.x = hit.x - ball.radius;
      if (normalX > 0) ball.x = hit.x + hit.width + ball.radius;
      if (normalY < 0) ball.y = hit.y - ball.radius;
      if (normalY > 0) ball.y = hit.y + hit.height + ball.radius;
    }
    ball.accuracyAttempt = ball.accuracyAttempt === 'pending' ? 'hit' : ball.accuracyAttempt;
    this.destroyBrick(hit, 'ball');
    if (passThrough) ball.fireHits = Math.max(0, ball.fireHits - 1);

  }

  private findBrickCollision(ball: Ball, previous: { x: number; y: number }): BrickCollision | null {
    const candidates: BrickCollision[] = [];
    for (const brick of this.bricks) {
      if (!brick.active) continue;
      const closestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.width));
      const closestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.height));
      const dx = ball.x - closestX; const dy = ball.y - closestY;
      if (dx * dx + dy * dy > ball.radius ** 2) continue;
      let normalX = 0; let normalY = 0;
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
        ].sort((left, right) => left.value - right.value);
        const closest = distances[0]; if (!closest) continue;
        normalX = closest.x; normalY = closest.y;
      }
      if (ball.vx * normalX + ball.vy * normalY < 0) candidates.push({ brick, normalX, normalY });
    }
    candidates.sort((left, right) => left.brick.index - right.brick.index);
    return candidates[0] ?? null;
  }

  private wallSound(): void {
    if (this.simulationTime - this.lastWallSound > 0.04) { this.audio.effect('wall'); this.lastWallSound = this.simulationTime; }
  }

  private resolveAccuracyAttempt(ball: Ball, countMiss: boolean): void {
    const resolved = resolveAccuracyAttempt(ball.accuracyAttempt, countMiss);
    this.accuracyHits += resolved.hits;
    this.accuracyAttempts += resolved.attempts;
    ball.accuracyAttempt = 'none';
  }

  private updateBullets(dt: number): void {
    for (let index = this.bullets.length - 1; index >= 0; index -= 1) {
      const bullet = this.bullets[index]; if (!bullet) continue;
      bullet.y -= 430 * dt;
      const hit = this.bricks.find((brick) => brick.active && bullet.x >= brick.x && bullet.x <= brick.x + brick.width && bullet.y <= brick.y + brick.height && bullet.y >= brick.y - 8);
      if (hit) { this.destroyBrick(hit, 'laser'); this.bullets.splice(index, 1); }
      else if (bullet.y < -10) this.bullets.splice(index, 1);
      if (this.state !== 'running') return;
    }
  }

  private updatePickups(dt: number): void {
    for (let index = this.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = this.pickups[index]; if (!pickup) continue;
      pickup.y += 95 * dt;
      if (pickup.y + pickup.radius >= this.paddle.y && pickup.y - pickup.radius <= this.paddle.y + this.paddle.height
        && pickup.x + pickup.radius >= this.paddle.x && pickup.x - pickup.radius <= this.paddle.x + this.paddle.width) {
        const definition = POWER_UPS[pickup.type];
        this.activate(pickup.type); this.pickupCount += 1;
        this.addFloater(pickup.x, pickup.y, `${definition.displayName}!`, definition.color);
        this.burst(pickup.x, pickup.y, definition.color, 14, 130);
        this.pickups.splice(index, 1); this.audio.effect('pickup');
      } else if (pickup.y > GAME_HEIGHT + 20) this.pickups.splice(index, 1);
    }
  }

  private destroyBrick(brick: Brick, source: 'ball' | 'laser' | 'chain'): void {
    if (!brick.active) return;
    brick.active = false; brick.flash = 0.08; this.remaining -= 1; this.brickHits += 1;
    const points = pointsForCombo(this.combo); this.score += points; this.combo += 1;
    const color = PALETTE[brick.value - 1]?.hex ?? '#f6f4eb';
    this.burst(brick.x + brick.width / 2, brick.y + brick.height / 2, color, source === 'laser' ? 5 : 9, 115);
    if (points >= 300 || this.combo % 5 === 0) this.addFloater(brick.x + 9, brick.y, `+${points.toLocaleString('en-US')}`, color);
    this.shake = Math.max(this.shake, Math.min(3.5, 0.8 + this.combo * 0.04));
    const row = Math.floor(brick.index / this.board.columns); const pitchStep = this.board.rows - 1 - row;
    if (this.combo % 10 === 0) this.audio.effect('combo', pitchStep); else this.audio.effect('brick', pitchStep);
    this.applySpeedTier();
    const power = this.powerPlan.get(brick.index);
    if (power && this.remaining > 0) { this.pickups.push({ type: power, x: brick.x + brick.width / 2, y: brick.y + brick.height / 2, radius: PICKUP_RADIUS }); this.audio.effect('drop'); }
    if (source === 'ball' && this.simulationTime < this.chainUntil) this.chainFrom(brick);
    if (this.remaining <= 0) this.finish(true);
  }

  private chainFrom(origin: Brick): void {
    const originX = origin.x + origin.width / 2; const originY = origin.y + origin.height / 2;
    const candidates = this.bricks.filter((brick) => brick.active && Math.hypot(
      brick.x + brick.width / 2 - originX, brick.y + brick.height / 2 - originY,
    ) <= CELL_SIZE * 4.5);
    const count = 2 + Math.floor(this.random() * 2);
    for (let index = 0; index < Math.min(count, candidates.length); index += 1) {
      const swap = index + Math.floor(this.random() * (candidates.length - index));
      const selected = candidates[swap]; const current = candidates[index];
      if (selected && current) { candidates[index] = selected; candidates[swap] = current; }
      const brick = candidates[index];
      if (brick) {
        this.lightningArcs.push({ x1: originX, y1: originY, x2: brick.x + brick.width / 2, y2: brick.y + brick.height / 2, life: 0.16, maxLife: 0.16 });
        this.destroyBrick(brick, 'chain');
      }
      if (this.state !== 'running') return;
    }
  }

  private activate(type: PowerUpName): void {
    const duration = POWER_UPS[type].duration ?? 0;
    if (type === 'wide' || type === 'narrow') { this.paddleSize = type; this.paddleSizeUntil = this.simulationTime + duration; this.setPaddleWidth(BASE_PADDLE_WIDTH * (type === 'wide' ? 1.5 : 0.5)); }
    if (type === 'slow') this.slowUntil = this.simulationTime + duration;
    if (type === 'fast') this.fastUntil = this.simulationTime + duration;
    if (type === 'laser') { this.laserUntil = this.simulationTime + duration; this.shotTimer = 0; }
    if (type === 'shield') this.shieldUntil = this.simulationTime + duration;
    if (type === 'chain') this.chainUntil = this.simulationTime + duration;
    if (type === 'fire') for (const ball of this.balls) ball.fireHits = 10;
    if (type === 'multi') {
      const source = this.balls[0];
      if (source) for (const angle of [-Math.PI / 9, Math.PI / 9]) if (this.balls.length < 5) {
        const cosine = Math.cos(angle); const sine = Math.sin(angle);
        this.balls.push({ ...source, x: source.x + Math.sign(angle) * 2, vx: source.vx * cosine - source.vy * sine, vy: source.vx * sine + source.vy * cosine, accuracyAttempt: 'none' });
      }
    }
  }

  private setPaddleWidth(width: number): void { const center = this.paddle.x + this.paddle.width / 2; this.paddle.width = width; this.paddle.x = Math.max(0, Math.min(GAME_WIDTH - width, center - width / 2)); }

  private applySpeedTier(): void {
    const destroyed = this.initialBrickCount - this.remaining;
    const nextTier = destroyed >= this.initialBrickCount * 2 / 3 ? 2 : destroyed >= this.initialBrickCount / 3 ? 1 : 0;
    if (nextTier <= this.speedTier) return;
    this.speedTier = nextTier;
    for (const ball of this.balls) {
      ball.speed = BASE_SPEED + this.speedTier * 34;
      const magnitude = Math.hypot(ball.vx, ball.vy) || 1; const target = ball.speed * this.lastMultiplier;
      ball.vx = ball.vx / magnitude * target; ball.vy = ball.vy / magnitude * target;
    }
  }

  private updateEffects(dt: number): void {
    const motionScale = this.reducedMotion ? 0 : 1;
    this.particles = this.particles.flatMap((particle) => {
      const life = particle.life - dt; if (life <= 0) return [];
      return [{ ...particle, life, x: particle.x + particle.vx * dt * motionScale, y: particle.y + particle.vy * dt * motionScale, vy: particle.vy + 190 * dt * motionScale }];
    });
    this.floaters = this.floaters.flatMap((floater) => {
      const life = floater.life - dt; if (life <= 0) return [];
      return [{ ...floater, life, y: floater.y - 25 * dt * motionScale }];
    });
    this.lightningArcs = this.lightningArcs.flatMap((arc) => {
      const life = arc.life - dt; return life <= 0 ? [] : [{ ...arc, life }];
    });
    this.shake = Math.max(0, this.shake - dt * 18);
  }

  private burst(x: number, y: number, color: string, count: number, force: number): void {
    const amount = this.reducedMotion ? Math.min(3, count) : count;
    for (let index = 0; index < amount; index += 1) {
      const angle = Math.random() * Math.PI * 2; const speed = force * (0.35 + Math.random() * 0.65);
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color, size: 2 + Math.random() * 3, life: 0.28 + Math.random() * 0.28, maxLife: 0.56 });
    }
  }

  private addFloater(x: number, y: number, value: string, color: string): void {
    this.floaters.push({ x, y, text: value, color, life: 0.75, maxLife: 0.75 });
  }

  private finish(cleared: boolean): void {
    if (this.state === 'over') return;
    this.state = 'over'; this.bullets = []; this.pickups = []; this.laserUntil = 0; this.shieldUntil = 0;
    this.shake = cleared ? 7 : 4; this.audio.effect(cleared ? 'win' : 'lose'); this.emitHud(true);
    if (cleared) for (let index = 0; index < 7; index += 1) this.burst(45 + index * 52, 420 + index % 2 * 35, PALETTE[index]?.hex ?? '#f6f4eb', 14, 190);
    if (cleared) for (const ball of this.balls) this.resolveAccuracyAttempt(ball, true);
    const baseScore = this.score;
    const score = cleared
      ? scoreForClear(baseScore, this.accuracyHits, this.accuracyAttempts)
      : baseScore;
    const result = { score, baseScore, elapsedMs: Math.round(this.simulationTime * 1000), cleared, brickHits: this.brickHits, paddleHits: this.paddleHits, accuracyHits: this.accuracyHits, accuracyAttempts: this.accuracyAttempts, pickups: this.pickupCount };
    this.finishTimer = window.setTimeout(() => {
      this.finishTimer = 0;
      this.callbacks.onFinish(result);
    }, 460);
  }

  private emitHud(force = false): void {
    if (!force && this.simulationTime - this.lastHud < 0.08) return;
    this.lastHud = this.simulationTime;
    this.callbacks.onHud({ score: this.score, combo: this.combo, remaining: this.remaining });
  }

  private draw(): void {
    const context = this.drawing;
    context.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT); context.fillStyle = '#111113'; context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    context.save();
    if (!this.reducedMotion && this.shake > 0) context.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    context.strokeStyle = '#44444a'; context.lineWidth = 2; context.beginPath();
    context.moveTo(1, 0); context.lineTo(1, GAME_HEIGHT); context.moveTo(GAME_WIDTH - 1, 0); context.lineTo(GAME_WIDTH - 1, GAME_HEIGHT);
    context.moveTo(0, 1); context.lineTo(GAME_WIDTH, 1); context.stroke();
    for (const brick of this.bricks) {
      if (!brick.active) continue;
      context.fillStyle = PALETTE[brick.value - 1]?.hex ?? '#fff'; context.fillRect(brick.x, brick.y, brick.width, brick.height);
      context.fillStyle = 'rgba(255,255,255,.22)'; context.fillRect(brick.x + 2, brick.y + 2, brick.width - 4, 2);
      context.fillStyle = 'rgba(0,0,0,.22)'; context.fillRect(brick.x + 2, brick.y + brick.height - 3, brick.width - 4, 2);
    }
    if (this.simulationTime < this.shieldUntil) {
      context.save(); context.strokeStyle = '#35d9ff'; context.lineWidth = 2; context.setLineDash([7, 6]);
      context.lineDashOffset = -this.simulationTime * 30; context.beginPath(); context.moveTo(8, 676); context.lineTo(GAME_WIDTH - 8, 676); context.stroke(); context.restore();
    }
    for (const pickup of this.pickups) this.drawPickup(pickup);
    context.fillStyle = '#ff3da5'; for (const bullet of this.bullets) context.fillRect(bullet.x - 2, bullet.y, 4, 10);
    context.fillStyle = '#b6ff3b'; context.fillRect(this.paddle.x, this.paddle.y, this.paddle.width, this.paddle.height);
    context.fillStyle = 'rgba(255,255,255,.35)'; context.fillRect(this.paddle.x + 3, this.paddle.y + 2, this.paddle.width - 6, 2);
    if (this.simulationTime < this.laserUntil) {
      context.fillStyle = '#ff3da5'; context.fillRect(this.paddle.x + 10, this.paddle.y + 2, 6, this.paddle.height - 4);
      context.fillRect(this.paddle.x + this.paddle.width - 16, this.paddle.y + 2, 6, this.paddle.height - 4);
    }
    for (const arc of this.lightningArcs) {
      context.save(); context.globalAlpha = Math.max(0, arc.life / arc.maxLife); context.strokeStyle = '#f6f4eb';
      context.shadowColor = '#35d9ff'; context.shadowBlur = 7; context.lineWidth = 2; context.beginPath(); context.moveTo(arc.x1, arc.y1);
      for (let step = 1; step < 4; step += 1) {
        const progress = step / 4;
        context.lineTo(arc.x1 + (arc.x2 - arc.x1) * progress + (Math.random() - 0.5) * 9, arc.y1 + (arc.y2 - arc.y1) * progress + (Math.random() - 0.5) * 9);
      }
      context.lineTo(arc.x2, arc.y2); context.stroke(); context.restore();
    }
    for (const ball of this.balls) this.drawBall(ball);
    for (const particle of this.particles) {
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife); context.fillStyle = particle.color;
      context.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    context.globalAlpha = 1; context.font = '700 12px "JetBrains Mono", monospace'; context.textAlign = 'center';
    for (const floater of this.floaters) {
      context.globalAlpha = Math.max(0, floater.life / floater.maxLife); context.fillStyle = floater.color; context.fillText(floater.text, floater.x, floater.y);
    }
    context.globalAlpha = 1;
    this.drawStatuses();
    context.restore();
  }

  private drawBall(ball: Ball): void {
    const context = this.drawing;
    if (ball.fireHits > 0) {
      const strength = ball.fireHits / 10; const magnitude = Math.hypot(ball.vx, ball.vy) || 1;
      const tailX = -ball.vx / magnitude; const tailY = -ball.vy / magnitude;
      context.save(); context.globalAlpha = 0.35 + strength * 0.45; context.fillStyle = '#ff8a32'; context.beginPath();
      context.arc(ball.x + tailX * (5 + strength * 4), ball.y + tailY * (5 + strength * 4), 3 + strength * 4, 0, Math.PI * 2); context.fill();
      context.shadowColor = '#ff4554'; context.shadowBlur = 8 + strength * 10; context.fillStyle = '#ffe14a'; context.beginPath();
      context.arc(ball.x, ball.y, ball.radius + strength * 2, 0, Math.PI * 2); context.fill(); context.restore();
    }
    context.save(); context.shadowColor = ball.fireHits > 0 ? '#ff8a32' : 'rgba(246,244,235,.7)'; context.shadowBlur = 8;
    context.fillStyle = '#f6f4eb'; context.beginPath(); context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2); context.fill(); context.restore();
  }

  private drawPickup(pickup: Pickup): void {
    const definition = POWER_UPS[pickup.type]; const context = this.drawing;
    const iconScale = pickup.radius / 8;
    context.save(); context.shadowColor = definition.color; context.shadowBlur = 7; context.fillStyle = definition.color;
    context.beginPath(); context.arc(pickup.x, pickup.y, pickup.radius, 0, Math.PI * 2); context.fill(); context.shadowBlur = 0; context.fillStyle = '#111113';
    if (pickup.type === 'fire') {
      context.beginPath(); context.moveTo(pickup.x, pickup.y - 5.5 * iconScale);
      context.bezierCurveTo(pickup.x + iconScale, pickup.y - 2 * iconScale, pickup.x + 5 * iconScale, pickup.y - iconScale, pickup.x + 4 * iconScale, pickup.y + 3 * iconScale);
      context.bezierCurveTo(pickup.x + 3 * iconScale, pickup.y + 6 * iconScale, pickup.x - 4 * iconScale, pickup.y + 6 * iconScale, pickup.x - 4 * iconScale, pickup.y + iconScale);
      context.bezierCurveTo(pickup.x - 4 * iconScale, pickup.y - iconScale, pickup.x - iconScale, pickup.y - 2 * iconScale, pickup.x, pickup.y - 5.5 * iconScale); context.fill();
      context.fillStyle = definition.color; context.beginPath(); context.arc(pickup.x, pickup.y + 2 * iconScale, 1.5 * iconScale, 0, Math.PI * 2); context.fill();
    }
    else if (pickup.type === 'chain') { context.beginPath(); context.moveTo(pickup.x + iconScale, pickup.y - 6 * iconScale); context.lineTo(pickup.x - 4 * iconScale, pickup.y + iconScale); context.lineTo(pickup.x, pickup.y + iconScale); context.lineTo(pickup.x - iconScale, pickup.y + 6 * iconScale); context.lineTo(pickup.x + 5 * iconScale, pickup.y - 2 * iconScale); context.lineTo(pickup.x + iconScale, pickup.y - 2 * iconScale); context.fill(); }
    else {
      context.font = '800 12px "JetBrains Mono", monospace'; context.textAlign = 'center'; context.textBaseline = 'alphabetic';
      const metrics = context.measureText(definition.label); const baseline = pickup.y + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
      context.fillText(definition.label, pickup.x, baseline);
    }
    context.restore();
  }

  private drawStatuses(): void {
    const statuses: [string, string][] = [];
    const add = (type: PowerUpName, until: number) => { if (this.simulationTime < until) statuses.push([`${POWER_UPS[type].displayName} ${(until - this.simulationTime).toFixed(1)}s`, POWER_UPS[type].color]); };
    add('laser', this.laserUntil); add('shield', this.shieldUntil);
    if (this.paddleSize === 'wide' || this.paddleSize === 'narrow') add(this.paddleSize, this.paddleSizeUntil);
    add('slow', this.slowUntil); add('fast', this.fastUntil); add('chain', this.chainUntil);
    const fireHits = Math.max(0, ...this.balls.map((ball) => ball.fireHits));
    if (fireHits) statuses.push([`FIRE ${fireHits}/10`, POWER_UPS.fire.color]);
    this.drawing.font = '700 10px "JetBrains Mono", monospace'; this.drawing.textAlign = 'left'; this.drawing.textBaseline = 'alphabetic';
    statuses.forEach(([label, color], index) => { this.drawing.fillStyle = color; this.drawing.fillText(label, 10, 18 + index * 14); });
  }
}
