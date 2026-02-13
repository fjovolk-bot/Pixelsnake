(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const ui = {
    score: document.getElementById("score"),
    highscore: document.getElementById("highscore"),
    level: document.getElementById("level"),
    speed: document.getElementById("speed"),
    mode: document.getElementById("mode"),
    effectStatus: document.getElementById("effectStatus"),
  };

  const GRID_SIZE = 32;
  const CELL = canvas.width / GRID_SIZE;
  const TICK_BASE = 6;
  const TICK_CAP = 15;
  const LEVEL_EVERY = 4;
  const POWERUP_WINDOW_MIN = 20000;
  const POWERUP_WINDOW_MAX = 30000;

  const COLORS = {
    bg: "#0b1020",
    grid: "#111a2f",
    border: "#4b5563",
    snakeBody: "#16a34a",
    snakeAlt: "#22c55e",
    snakeHead: "#bbf7d0",
    eye: "#0f172a",
    foodA: "#f97316",
    foodB: "#fb7185",
    text: "#f8fafc",
    overlay: "rgba(4, 10, 20, 0.74)",
    powerSlow: "#60a5fa",
    powerDouble: "#facc15",
  };

  const DIR = {
    ArrowUp: { x: 0, y: -1, opposite: "ArrowDown" },
    ArrowDown: { x: 0, y: 1, opposite: "ArrowUp" },
    ArrowLeft: { x: -1, y: 0, opposite: "ArrowRight" },
    ArrowRight: { x: 1, y: 0, opposite: "ArrowLeft" },
  };

  const STATE = {
    MENU: "menu",
    RUNNING: "running",
    PAUSED: "paused",
    GAME_OVER: "game-over",
  };

  const game = {
    state: STATE.MENU,
    mode: "classic",
    snake: [],
    direction: "ArrowRight",
    nextDirection: "ArrowRight",
    inputQueue: [],
    food: null,
    powerUp: null,
    activeEffect: null,
    lastTick: 0,
    accumulator: 0,
    score: 0,
    level: 1,
    tickRate: TICK_BASE,
    nextPowerUpAt: performance.now() + randomInt(POWERUP_WINDOW_MIN, POWERUP_WINDOW_MAX),
  };

  function modeLabel(mode) {
    return mode === "wrap" ? "Wrap" : "Classic";
  }

  function highscoreKey(mode) {
    return `pixelSnakeTop5_${mode}`;
  }

  function getTopFive(mode) {
    try {
      const parsed = JSON.parse(localStorage.getItem(highscoreKey(mode)) || "[]");
      return Array.isArray(parsed) ? parsed.filter(Number.isFinite).slice(0, 5) : [];
    } catch {
      return [];
    }
  }

  function saveScore(mode, score) {
    const list = getTopFive(mode);
    list.push(score);
    list.sort((a, b) => b - a);
    localStorage.setItem(highscoreKey(mode), JSON.stringify(list.slice(0, 5)));
  }

  function maxHighscore(mode) {
    return getTopFive(mode)[0] ?? 0;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function isInsidePlayable(x, y) {
    return x >= 1 && x < GRID_SIZE - 1 && y >= 1 && y < GRID_SIZE - 1;
  }

  function snakeOccupies(x, y) {
    return game.snake.some((segment) => segment.x === x && segment.y === y);
  }

  function rollFreeCell() {
    const free = [];
    for (let y = 1; y < GRID_SIZE - 1; y += 1) {
      for (let x = 1; x < GRID_SIZE - 1; x += 1) {
        if (!snakeOccupies(x, y) && !(game.food && game.food.x === x && game.food.y === y) && !(game.powerUp && game.powerUp.x === x && game.powerUp.y === y)) {
          free.push({ x, y });
        }
      }
    }
    return free.length ? free[randomInt(0, free.length - 1)] : null;
  }

  function spawnFood() {
    const cell = rollFreeCell();
    if (cell) {
      game.food = { ...cell, bornAt: performance.now() };
    }
  }

  function maybeSpawnPowerUp(now) {
    if (game.powerUp || game.activeEffect) return;
    if (now < game.nextPowerUpAt) return;

    const cell = rollFreeCell();
    if (!cell) return;

    game.powerUp = {
      ...cell,
      type: Math.random() < 0.5 ? "slow" : "double",
      bornAt: now,
      ttl: 7000,
    };
    game.nextPowerUpAt = now + randomInt(POWERUP_WINDOW_MIN, POWERUP_WINDOW_MAX);
  }

  function activatePowerUp(type, now) {
    if (type === "slow") {
      game.activeEffect = {
        type,
        endsAt: now + 5000,
      };
    } else {
      game.activeEffect = {
        type,
        foodsLeft: 3,
      };
    }
  }

  function applyDirectionFromQueue() {
    while (game.inputQueue.length) {
      const proposed = game.inputQueue.shift();
      if (DIR[proposed] && proposed !== DIR[game.direction].opposite) {
        game.nextDirection = proposed;
        return;
      }
    }
  }

  function resetGame() {
    const mid = Math.floor(GRID_SIZE / 2);
    game.snake = [
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
      { x: mid - 3, y: mid },
    ];
    game.direction = "ArrowRight";
    game.nextDirection = "ArrowRight";
    game.inputQueue = [];
    game.food = null;
    game.powerUp = null;
    game.activeEffect = null;
    game.score = 0;
    game.level = 1;
    game.tickRate = TICK_BASE;
    game.nextPowerUpAt = performance.now() + randomInt(POWERUP_WINDOW_MIN, POWERUP_WINDOW_MAX);
    spawnFood();
    syncHud();
  }

  function startGame() {
    resetGame();
    game.state = STATE.RUNNING;
  }

  function backToMenu() {
    game.state = STATE.MENU;
    game.inputQueue = [];
  }

  function recomputeSpeed() {
    const baseLevel = 1 + Math.floor(game.score / LEVEL_EVERY);
    game.level = baseLevel;
    const scaled = TICK_BASE + (baseLevel - 1) * 0.7;
    game.tickRate = Math.min(TICK_CAP, scaled);
  }

  function effectiveTickRate() {
    if (game.activeEffect?.type === "slow") {
      return Math.max(3, game.tickRate - 2.5);
    }
    return game.tickRate;
  }

  function handleFood(now) {
    let points = 1;
    if (game.activeEffect?.type === "double") {
      points = 2;
      game.activeEffect.foodsLeft -= 1;
      if (game.activeEffect.foodsLeft <= 0) {
        game.activeEffect = null;
      }
    }
    game.score += points;
    recomputeSpeed();
    spawnFood();
    maybeSpawnPowerUp(now);
  }

  function moveSnake(now) {
    applyDirectionFromQueue();
    game.direction = game.nextDirection;

    const currentHead = game.snake[0];
    const d = DIR[game.direction];
    let nx = currentHead.x + d.x;
    let ny = currentHead.y + d.y;

    if (game.mode === "wrap") {
      if (nx <= 0) nx = GRID_SIZE - 2;
      if (nx >= GRID_SIZE - 1) nx = 1;
      if (ny <= 0) ny = GRID_SIZE - 2;
      if (ny >= GRID_SIZE - 1) ny = 1;
    } else if (!isInsidePlayable(nx, ny)) {
      gameOver();
      return;
    }

    if (snakeOccupies(nx, ny)) {
      gameOver();
      return;
    }

    game.snake.unshift({ x: nx, y: ny });

    if (game.food && game.food.x === nx && game.food.y === ny) {
      handleFood(now);
    } else {
      game.snake.pop();
    }

    if (game.powerUp && game.powerUp.x === nx && game.powerUp.y === ny) {
      activatePowerUp(game.powerUp.type, now);
      game.powerUp = null;
    }
  }

  function gameOver() {
    saveScore(game.mode, game.score);
    game.state = STATE.GAME_OVER;
  }

  function update(now) {
    if (game.state !== STATE.RUNNING) return;

    if (game.powerUp && now - game.powerUp.bornAt > game.powerUp.ttl) {
      game.powerUp = null;
    }

    if (game.activeEffect?.type === "slow" && now >= game.activeEffect.endsAt) {
      game.activeEffect = null;
    }

    maybeSpawnPowerUp(now);

    const step = 1000 / effectiveTickRate();
    game.accumulator += now - game.lastTick;
    while (game.accumulator >= step && game.state === STATE.RUNNING) {
      moveSnake(now);
      game.accumulator -= step;
    }
  }

  function syncHud() {
    ui.score.textContent = String(game.score);
    ui.highscore.textContent = String(maxHighscore(game.mode));
    ui.level.textContent = String(game.level);
    ui.speed.textContent = effectiveTickRate().toFixed(1);
    ui.mode.textContent = modeLabel(game.mode);

    if (!game.activeEffect) {
      ui.effectStatus.textContent = "Effekt: keiner";
    } else if (game.activeEffect.type === "slow") {
      const sec = Math.max(0, (game.activeEffect.endsAt - performance.now()) / 1000);
      ui.effectStatus.textContent = `Effekt: Slow (${sec.toFixed(1)}s)`;
    } else {
      ui.effectStatus.textContent = `Effekt: Double Score (${game.activeEffect.foodsLeft} Foods)`;
    }
  }

  function drawPixel(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
  }

  function drawBoard() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = COLORS.grid;
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        if ((x + y) % 2 === 0) {
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
    }

    for (let i = 0; i < GRID_SIZE; i += 1) {
      drawPixel(i, 0, COLORS.border);
      drawPixel(i, GRID_SIZE - 1, COLORS.border);
      drawPixel(0, i, COLORS.border);
      drawPixel(GRID_SIZE - 1, i, COLORS.border);
    }
  }

  function drawSnake() {
    game.snake.forEach((seg, index) => {
      const bodyColor = index === 0 ? COLORS.snakeHead : index % 2 === 0 ? COLORS.snakeBody : COLORS.snakeAlt;
      drawPixel(seg.x, seg.y, bodyColor);

      if (index === 0) {
        ctx.fillStyle = COLORS.eye;
        const eyeSize = Math.max(2, Math.floor(CELL * 0.18));
        let ox1 = seg.x * CELL + CELL * 0.25;
        let oy1 = seg.y * CELL + CELL * 0.25;
        let ox2 = seg.x * CELL + CELL * 0.6;
        let oy2 = seg.y * CELL + CELL * 0.25;

        if (game.direction === "ArrowLeft" || game.direction === "ArrowRight") {
          oy2 = seg.y * CELL + CELL * 0.62;
        }
        if (game.direction === "ArrowDown") {
          oy1 = seg.y * CELL + CELL * 0.6;
          oy2 = seg.y * CELL + CELL * 0.6;
        }

        ctx.fillRect(ox1, oy1, eyeSize, eyeSize);
        ctx.fillRect(ox2, oy2, eyeSize, eyeSize);
      }
    });
  }

  function drawFood(now) {
    if (!game.food) return;
    const pulse = 0.7 + Math.sin((now - game.food.bornAt) / 160) * 0.3;
    const inset = Math.floor((CELL * (1 - pulse)) / 2);
    ctx.fillStyle = COLORS.foodB;
    ctx.fillRect(game.food.x * CELL + inset, game.food.y * CELL + inset, CELL - inset * 2, CELL - inset * 2);
    ctx.fillStyle = COLORS.foodA;
    ctx.fillRect(game.food.x * CELL + inset + 2, game.food.y * CELL + inset + 2, CELL - inset * 2 - 4, CELL - inset * 2 - 4);
  }

  function drawPowerUp(now) {
    if (!game.powerUp) return;
    const blink = Math.sin((now - game.powerUp.bornAt) / 120) > 0;
    const color = game.powerUp.type === "slow" ? COLORS.powerSlow : COLORS.powerDouble;
    drawPixel(game.powerUp.x, game.powerUp.y, blink ? color : "#ffffff");
  }

  function drawCentered(lines, subLines = []) {
    ctx.fillStyle = COLORS.overlay;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 28px monospace";
    lines.forEach((line, idx) => {
      ctx.fillText(line, canvas.width / 2, canvas.height / 2 - 80 + idx * 36);
    });
    ctx.font = "16px monospace";
    subLines.forEach((line, idx) => {
      ctx.fillText(line, canvas.width / 2, canvas.height / 2 + idx * 24);
    });
  }

  function drawTopFive(mode) {
    const scores = getTopFive(mode);
    ctx.textAlign = "left";
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "14px monospace";
    ctx.fillText(`Top 5 (${modeLabel(mode)}):`, 36, canvas.height - 152);
    for (let i = 0; i < 5; i += 1) {
      const val = scores[i] ?? "-";
      ctx.fillText(`${i + 1}. ${val}`, 36, canvas.height - 126 + i * 22);
    }
  }

  function render(now) {
    drawBoard();
    if (game.state !== STATE.MENU) {
      drawFood(now);
      drawPowerUp(now);
      drawSnake();
    }

    if (game.state === STATE.MENU) {
      drawCentered(["PIXEL SNAKE"], [
        "Enter = Start", 
        "Pfeiltasten = Move", 
        `M = Mode wechseln (${modeLabel(game.mode)})`,
        "P = Pause | Esc = Menu",
      ]);
      drawTopFive(game.mode);
    } else if (game.state === STATE.PAUSED) {
      drawCentered(["PAUSE"], ["P = Resume", "Esc = Menu"]);
    } else if (game.state === STATE.GAME_OVER) {
      drawCentered(["GAME OVER"], [
        `Score: ${game.score}`,
        `Highscore: ${maxHighscore(game.mode)}`,
        "Enter = Restart",
        "Esc = Menu",
      ]);
      drawTopFive(game.mode);
    }

    syncHud();
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    const { key } = event;

    if (key in DIR) {
      game.inputQueue.push(key);
      event.preventDefault();
      return;
    }

    if (key === "m" || key === "M") {
      if (game.state === STATE.MENU || game.state === STATE.GAME_OVER) {
        game.mode = game.mode === "classic" ? "wrap" : "classic";
        syncHud();
      }
      return;
    }

    if (key === "p" || key === "P") {
      if (game.state === STATE.RUNNING) {
        game.state = STATE.PAUSED;
      } else if (game.state === STATE.PAUSED) {
        game.state = STATE.RUNNING;
      }
      return;
    }

    if (key === "Enter") {
      if (game.state === STATE.MENU || game.state === STATE.GAME_OVER) {
        startGame();
      }
      return;
    }

    if (key === "Escape") {
      backToMenu();
    }
  }

  function loop(now) {
    if (!game.lastTick) {
      game.lastTick = now;
    }
    update(now);
    render(now);
    game.lastTick = now;
    requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", onKeyDown);
  syncHud();
  requestAnimationFrame(loop);
})();
