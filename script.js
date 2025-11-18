const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const menu = document.getElementById("menu");
const gameArea = document.getElementById("gameArea");
const modeButtons = document.querySelectorAll("[data-mode]");

const paddleWidth = 10;
const paddleHeight = 100;
const ballSize = 10;
const speed = 6;
let difficulty=3;
const serveDelayMs = 1200;
const serveOffset = 30;
const aiConfig = {
  maxSpeed: speed * 0.7,
  aimJitter: 50,
  noiseHoldFrames: 18,
};
const duoSpawnMargin = 60;
const duoSpawnMinGap = paddleHeight * 0.6;

let gameMode = null;
let balls = [];
let scoreAI=0;
let scorePlayer=0;
const inputState = {
  primaryUp: false,
  primaryDown: false,
  secondaryUp: false,
  secondaryDown: false,
};
const aiAimState = {
  leftTop: { offset: 0, cooldown: 0 },
  leftBottom: { offset: 0, cooldown: 0 },
};
let sharedServeSide = "left";
let sharedRoundsOnCurrentSide = 0;
let roundResetInProgress = false;

// Paddle positions: top and bottom on each side
const leftPaddleTop = {
  x: 10,
  y: 0,
  dy: 0,
  presetY: canvas.height / 4 - paddleHeight / 2,
};

const leftPaddleBottom = {
  x: 10,
  y: 0,
  dy: 0,
  presetY: (3 * canvas.height) / 4 - paddleHeight / 2,
};

const rightPaddleTop = {
  x: canvas.width - 20,
  y: 0,
  dy: 0,
  presetY: canvas.height / 4 - paddleHeight / 2,
};

const rightPaddleBottom = {
  x: canvas.width - 20,
  y: 0,
  dy: 0,
  presetY: (3 * canvas.height) / 4 - paddleHeight / 2,
};

function resetPaddles() {
  leftPaddleTop.y = leftPaddleTop.presetY;
  leftPaddleBottom.y = leftPaddleBottom.presetY;
  rightPaddleTop.y = rightPaddleTop.presetY;
  rightPaddleBottom.y = rightPaddleBottom.presetY;
  leftPaddleTop.dy = 0;
  leftPaddleBottom.dy = 0;
  rightPaddleTop.dy = 0;
  rightPaddleBottom.dy = 0;
  resetAiAimState();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resetAiAimState() {
  Object.keys(aiAimState).forEach((key) => {
    aiAimState[key].offset = 0;
    aiAimState[key].cooldown = 0;
  });
}

function getAiAimTarget(base, key) {
  const state = aiAimState[key];
  if (!state) return clamp(base, 0, canvas.height - paddleHeight);
  if (state.cooldown <= 0) {
    state.offset = (Math.random() - 0.5) * aiConfig.aimJitter;
    state.cooldown = aiConfig.noiseHoldFrames;
  } else {
    state.cooldown -= 1;
  }
  return clamp(base + state.offset, 0, canvas.height - paddleHeight);
}

function setAiMotionTowards(paddle, targetY, key) {
  const noisyTarget = getAiAimTarget(targetY, key);
  const delta = noisyTarget - paddle.y;
  if (Math.abs(delta) <= aiConfig.maxSpeed) {
    paddle.dy = 0;
    return;
  }
  paddle.dy = delta > 0 ? aiConfig.maxSpeed : -aiConfig.maxSpeed;
}

function createBall(initialSide = "left", lane = 0) {
  return {
  x: canvas.width / 2,
  y: canvas.height / 2,
    dx: 0,
    dy: 0,
    waitingForServe: true,
    roundsOnCurrentSide: 0,
    currentServeSide: initialSide,
    serveTimeoutId: null,
    lane,
    nextSpawnY: null,
    nextSpawnX: null,
  };
}

function clearBallTimers() {
  balls.forEach((ball) => {
    if (ball.serveTimeoutId) clearTimeout(ball.serveTimeoutId);
  });
}

function getNextServeSide(ball) {
  if (gameMode === "duo") return getSharedServeSide();
  ball.roundsOnCurrentSide += 1;
  if (ball.roundsOnCurrentSide > 2) {
    ball.roundsOnCurrentSide = 1;
    ball.currentServeSide = ball.currentServeSide === "left" ? "right" : "left";
  }
  return ball.currentServeSide;
}

function getSharedServeSide() {
  sharedRoundsOnCurrentSide += 1;
  if (sharedRoundsOnCurrentSide > 2) {
    sharedRoundsOnCurrentSide = 1;
    sharedServeSide = sharedServeSide === "left" ? "right" : "left";
  }
  return sharedServeSide;
}

function placeBallForServe(ball, side) {
  const baseSpeed = speed;
  let spawnY = canvas.height / 2 - ballSize / 2;
  if (gameMode === "duo") {
    if (typeof ball.nextSpawnY === "number") {
      spawnY = ball.nextSpawnY;
    } else {
      spawnY =
        duoSpawnMargin +
        Math.random() * (canvas.height - 2 * duoSpawnMargin - ballSize);
    }
  }
  ball.nextSpawnY = null;
  ball.y = spawnY;
  
  // Randomize launch angle between -45 and 45 degrees
  const angleDegrees = (Math.random() - 0.5) * 90; // -45 to +45 degrees
  const angleRadians = (angleDegrees * Math.PI) / 180;
  
  if (side === "left") {
    const paddleX = gameMode === "duo" ? leftPaddleTop.x : leftPaddleTop.x;
    const baseX = paddleX + paddleWidth + serveOffset;
    // Apply X offset if set (for duo mode)
    const xOffset = gameMode === "duo" && typeof ball.nextSpawnX === "number" 
      ? ball.nextSpawnX 
      : 0;
    ball.x = baseX + xOffset;
    ball.dx = baseSpeed * Math.cos(angleRadians);
    ball.dy = baseSpeed * Math.sin(angleRadians);
  } else {
    const paddleX = gameMode === "duo" ? rightPaddleTop.x : rightPaddleTop.x;
    const baseX = paddleX - paddleWidth - serveOffset - ballSize;
    // Apply X offset if set (for duo mode) - negative for right side
    const xOffset = gameMode === "duo" && typeof ball.nextSpawnX === "number" 
      ? -ball.nextSpawnX 
      : 0;
    ball.x = baseX + xOffset;
    ball.dx = -baseSpeed * Math.cos(angleRadians);
    ball.dy = baseSpeed * Math.sin(angleRadians);
  }
  ball.nextSpawnX = null;
}

function scheduleNextServe(ball, forcedSide) {
  ball.waitingForServe = true;
  ball.dx = 0;
  ball.dy = 0;
  if (ball.serveTimeoutId) clearTimeout(ball.serveTimeoutId);
  const side =
    forcedSide ||
    (gameMode === "duo" ? getSharedServeSide() : getNextServeSide(ball));
  ball.serveTimeoutId = setTimeout(() => {
    placeBallForServe(ball, side);
    ball.waitingForServe = false;
  }, serveDelayMs);
}

function setupBallsForMode() {
  clearBallTimers();
  balls = [];
  const ballCount = gameMode === "duo" ? 2 : 1;
  for (let i = 0; i < ballCount; i++) {
    const initialSide =
      gameMode === "duo" ? sharedServeSide : i % 2 === 0 ? "left" : "right";
    const lane = gameMode === "duo" ? i : 0;
    const newBall = createBall(initialSide, lane);
    balls.push(newBall);
  }
  if (gameMode === "duo") {
    serveAllBallsFromSharedSide();
  } else {
    balls.forEach((ball, index) => {
      const initialSide = index % 2 === 0 ? "left" : "right";
      scheduleNextServe(ball, initialSide);
    });
  }
}

function serveAllBallsFromSharedSide(forcedSide) {
  const side = forcedSide || getSharedServeSide();
  let spawnHeights = [];
  if (gameMode === "duo") {
    spawnHeights = generateDuoSpawnHeights(balls.length);
    // Assign different X offsets to each ball (e.g., 10, 20, 30, etc.)
    balls.forEach((ball, idx) => {
      ball.nextSpawnX = (idx + 1) * 10; // Ball 1: 10, Ball 2: 20, etc.
    });
  }
  balls.forEach((ball, idx) => {
    if (gameMode === "duo") {
      ball.nextSpawnY =
        spawnHeights[idx] ??
        canvas.height / 2 - ballSize / 2 +
          (idx === 0 ? -paddleHeight / 2 : paddleHeight / 2);
    }
    scheduleNextServe(ball, side);
  });
}

function resetServePattern() {
  sharedServeSide = "left";
  sharedRoundsOnCurrentSide = 0;
}

function generateDuoSpawnHeights(count) {
  const minY = duoSpawnMargin;
  const maxY = canvas.height - duoSpawnMargin - ballSize;
  const positions = [];
  let attempts = 0;
  while (positions.length < count && attempts < 100) {
    const candidate = minY + Math.random() * (maxY - minY);
    if (
      positions.every((pos) => Math.abs(pos - candidate) >= duoSpawnMinGap)
    ) {
      positions.push(candidate);
    }
    attempts += 1;
  }
  positions.sort((a, b) => a - b);
  return positions;
}

function startGame(mode) {
  gameMode = mode;
  scoreAI = 0;
  scorePlayer = 0;
  resetPaddles();
  resetServePattern();
  inputState.primaryUp = false;
  inputState.primaryDown = false;
  inputState.secondaryUp = false;
  inputState.secondaryDown = false;
  updatePlayerVelocity();
  setupBallsForMode();
  menu.classList.add("hidden");
  gameArea.classList.remove("hidden");
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode === "duo" ? "duo" : "solo";
    startGame(mode);
  });
});

function movePaddles() {
  if (gameMode === "duo") {
    leftPaddleTop.y += leftPaddleTop.dy;
    leftPaddleBottom.y += leftPaddleBottom.dy;
    rightPaddleTop.y += rightPaddleTop.dy;
    rightPaddleBottom.y += rightPaddleBottom.dy;

    leftPaddleTop.y = Math.max(
      Math.min(leftPaddleTop.y, canvas.height - paddleHeight),
      0
    );
    leftPaddleBottom.y = Math.max(
      Math.min(leftPaddleBottom.y, canvas.height - paddleHeight),
      0
    );
    rightPaddleTop.y = Math.max(
      Math.min(rightPaddleTop.y, canvas.height - paddleHeight),
      0
    );
    rightPaddleBottom.y = Math.max(
      Math.min(rightPaddleBottom.y, canvas.height - paddleHeight),
      0
    );
  } else {
    leftPaddleTop.y += leftPaddleTop.dy;
    rightPaddleTop.y += rightPaddleTop.dy;

    leftPaddleTop.y = Math.max(
      Math.min(leftPaddleTop.y, canvas.height - paddleHeight),
      0
    );
    rightPaddleTop.y = Math.max(
      Math.min(rightPaddleTop.y, canvas.height - paddleHeight),
      0
    );
  }
}

function moveAI() {
  if (!balls.length) return;
  
  if (gameMode === "duo") {
    // Coordinated AI for 2 vs 2 mode
    const activeBalls = balls.filter((ball) => !ball.waitingForServe && ball.dx < 0);
    
    if (activeBalls.length === 0) {
      // Reset to preset positions when waiting
      setAiMotionTowards(leftPaddleTop, leftPaddleTop.presetY, "leftTop");
      setAiMotionTowards(leftPaddleBottom, leftPaddleBottom.presetY, "leftBottom");
      return;
    }
    
    // Simple assignment: assign each ball to closest paddle
    if (activeBalls.length === 2) {
      // Two balls - assign one to each paddle based on predicted position
      const ball1 = activeBalls[0];
      const ball2 = activeBalls[1];
      
      // Predict where balls will be when they reach the paddle
      const timeToReach1 = Math.max(0.1, (ball1.x - (leftPaddleTop.x + paddleWidth)) / Math.abs(ball1.dx));
      const timeToReach2 = Math.max(0.1, (ball2.x - (leftPaddleTop.x + paddleWidth)) / Math.abs(ball2.dx));
      const predictedY1 = ball1.y + ball1.dy * timeToReach1;
      const predictedY2 = ball2.y + ball2.dy * timeToReach2;
      
      // Assign ball in upper half to top paddle, lower half to bottom paddle
      // If both in same half, assign based on which is closer to center
      if (predictedY1 < canvas.height / 2 && predictedY2 >= canvas.height / 2) {
        // Ball1 top, ball2 bottom
        const targetY1 = clamp(predictedY1 - paddleHeight / 2, 0, canvas.height - paddleHeight);
        const targetY2 = clamp(predictedY2 - paddleHeight / 2, 0, canvas.height - paddleHeight);
        setAiMotionTowards(leftPaddleTop, targetY1, "leftTop");
        setAiMotionTowards(leftPaddleBottom, targetY2, "leftBottom");
      } else if (predictedY1 >= canvas.height / 2 && predictedY2 < canvas.height / 2) {
        // Ball1 bottom, ball2 top
        const targetY1 = clamp(predictedY1 - paddleHeight / 2, 0, canvas.height - paddleHeight);
        const targetY2 = clamp(predictedY2 - paddleHeight / 2, 0, canvas.height - paddleHeight);
        setAiMotionTowards(leftPaddleBottom, targetY1, "leftBottom");
        setAiMotionTowards(leftPaddleTop, targetY2, "leftTop");
      } else {
        // Both in same half - assign based on distance to paddle centers
        const topCenter = leftPaddleTop.y + paddleHeight / 2;
        const bottomCenter = leftPaddleBottom.y + paddleHeight / 2;
        const dist1ToTop = Math.abs(predictedY1 - topCenter);
        const dist1ToBottom = Math.abs(predictedY1 - bottomCenter);
        const dist2ToTop = Math.abs(predictedY2 - topCenter);
        const dist2ToBottom = Math.abs(predictedY2 - bottomCenter);
        
        // Assign ball1 to closest
        const targetY1 = clamp(predictedY1 - paddleHeight / 2, 0, canvas.height - paddleHeight);
        const targetY2 = clamp(predictedY2 - paddleHeight / 2, 0, canvas.height - paddleHeight);
        if (dist1ToTop < dist1ToBottom) {
          setAiMotionTowards(leftPaddleTop, targetY1, "leftTop");
          setAiMotionTowards(leftPaddleBottom, targetY2, "leftBottom");
        } else {
          setAiMotionTowards(leftPaddleBottom, targetY1, "leftBottom");
          setAiMotionTowards(leftPaddleTop, targetY2, "leftTop");
        }
      }
    } else {
      // One ball - both paddles coordinate
      const ball = activeBalls[0];
      const timeToReach = Math.max(0.1, (ball.x - (leftPaddleTop.x + paddleWidth)) / Math.abs(ball.dx));
      const predictedY = ball.y + ball.dy * timeToReach;
      const targetY = clamp(predictedY - paddleHeight / 2, 0, canvas.height - paddleHeight);
      
      // Top paddle covers upper half, bottom covers lower half
      if (predictedY < canvas.height / 2) {
        // Top paddle primary
        setAiMotionTowards(leftPaddleTop, targetY, "leftTop");
        // Bottom paddle supports
        setAiMotionTowards(leftPaddleBottom, leftPaddleBottom.presetY, "leftBottom");
      } else {
        // Bottom paddle primary
        setAiMotionTowards(leftPaddleBottom, targetY, "leftBottom");
        // Top paddle supports
        setAiMotionTowards(leftPaddleTop, leftPaddleTop.presetY, "leftTop");
      }
    }
  } else {
    // Single AI paddle for solo mode
    const activeBall =
      balls.find((ball) => !ball.waitingForServe) || balls[0];
    const targetY = activeBall.waitingForServe
      ? canvas.height / 2 - paddleHeight / 2
      : activeBall.y - paddleHeight / 2;
    setAiMotionTowards(leftPaddleTop, clamp(targetY, 0, canvas.height - paddleHeight), "leftTop");
  }
}

function handleCollisions(ball) {
  if (ball.y <= 0 || canvas.height <= ball.y + ballSize) {
    ball.dy *= -1;
  }
  
  if (gameMode === "duo") {
    // Check collisions with all 4 paddles
    // Left side - top paddle
    if (
      ball.x <= leftPaddleTop.x + paddleWidth &&
      leftPaddleTop.y <= ball.y + ballSize &&
      ball.y <= leftPaddleTop.y + paddleHeight &&
      ball.dx < 0
    ) {
      ball.dx *= -1;
      ball.x = leftPaddleTop.x + paddleWidth;
    }
    // Left side - bottom paddle
    if (
      ball.x <= leftPaddleBottom.x + paddleWidth &&
      leftPaddleBottom.y <= ball.y + ballSize &&
      ball.y <= leftPaddleBottom.y + paddleHeight &&
      ball.dx < 0
    ) {
      ball.dx *= -1;
      ball.x = leftPaddleBottom.x + paddleWidth;
    }
    // Right side - top paddle
    if (
      rightPaddleTop.x <= ball.x + ballSize &&
      rightPaddleTop.y <= ball.y + ballSize &&
      ball.y <= rightPaddleTop.y + paddleHeight &&
      ball.dx > 0
    ) {
      ball.dx *= -1;
      ball.x = rightPaddleTop.x - paddleWidth;
    }
    // Right side - bottom paddle
    if (
      rightPaddleBottom.x <= ball.x + ballSize &&
      rightPaddleBottom.y <= ball.y + ballSize &&
      ball.y <= rightPaddleBottom.y + paddleHeight &&
      ball.dx > 0
    ) {
      ball.dx *= -1;
      ball.x = rightPaddleBottom.x - paddleWidth;
    }
  } else {
    // Solo mode - single paddle on each side
    if (
      ball.x <= leftPaddleTop.x + paddleWidth &&
      leftPaddleTop.y <= ball.y + ballSize &&
      ball.y <= leftPaddleTop.y + paddleHeight
  ) {
    ball.dx *= -1;
      ball.x = leftPaddleTop.x + paddleWidth;
    }
    if (
      rightPaddleTop.x <= ball.x + ballSize &&
      rightPaddleTop.y <= ball.y + ballSize &&
      ball.y <= rightPaddleTop.y + paddleHeight
  ) {
    ball.dx *= -1;
      ball.x = rightPaddleTop.x - paddleWidth;
    }
  }
}

function moveBalls() {
  balls.forEach((ball) => {
    if (ball.waitingForServe) return;
    ball.x += ball.dx;
    ball.y += ball.dy;
    handleCollisions(ball);
  });
}

function scoreUpdater(){
  let roundShouldReset = false;
  balls.forEach((ball) => {
    if (ball.waitingForServe || roundShouldReset) return;
    if (ball.x >= canvas.width) {
      scoreAI+=1;
      roundShouldReset = true;
    }
    if (ball.x + ballSize <= 0) {
      scorePlayer+=1;
      roundShouldReset = true;
    }
  });
  if (roundShouldReset) resetRoundAndServe();
}

function resetRoundAndServe() {
  if (roundResetInProgress) return;
  roundResetInProgress = true;
  resetPaddles();
  if (gameMode === "duo") {
    serveAllBallsFromSharedSide();
  } else {
    balls.forEach((ball) => scheduleNextServe(ball));
  }
  roundResetInProgress = false;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!gameMode) return;

  ctx.fillStyle = "white";
  
  if (gameMode === "duo") {
    // Draw all 4 paddles
    ctx.fillRect(leftPaddleTop.x, leftPaddleTop.y, paddleWidth, paddleHeight);
    ctx.fillRect(leftPaddleBottom.x, leftPaddleBottom.y, paddleWidth, paddleHeight);
    ctx.fillRect(rightPaddleTop.x, rightPaddleTop.y, paddleWidth, paddleHeight);
    ctx.fillRect(rightPaddleBottom.x, rightPaddleBottom.y, paddleWidth, paddleHeight);
  } else {
    // Solo mode - single paddle on each side
    ctx.fillRect(leftPaddleTop.x, leftPaddleTop.y, paddleWidth, paddleHeight);
    ctx.fillRect(rightPaddleTop.x, rightPaddleTop.y, paddleWidth, paddleHeight);
  }

  balls.forEach((ball) => {
    if (!ball.waitingForServe) {
  ctx.fillRect(ball.x, ball.y, ballSize, ballSize);
    }
  });

  ctx.font="bold 36px 'Press Start 2P', Arial"; 
  ctx.fillText(scorePlayer,canvas.width/2 +50,50);
  ctx.fillText(scoreAI,canvas.width/2 -71,50);

  ctx.beginPath();
  ctx.lineWidth=4;
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.strokeStyle = "white";
  ctx.setLineDash([20, 10]); 
  ctx.stroke();
  ctx.setLineDash([4]);
}

function updatePlayerVelocity() {
  if (gameMode === "duo") {
    // Top paddle controlled by arrow keys
    if (inputState.primaryUp && !inputState.primaryDown) {
      rightPaddleTop.dy = -speed;
    } else if (inputState.primaryDown && !inputState.primaryUp) {
      rightPaddleTop.dy = speed;
    } else {
      rightPaddleTop.dy = 0;
    }
    
    // Bottom paddle controlled by W/S keys
    if (inputState.secondaryUp && !inputState.secondaryDown) {
      rightPaddleBottom.dy = -speed;
    } else if (inputState.secondaryDown && !inputState.secondaryUp) {
      rightPaddleBottom.dy = speed;
    } else {
      rightPaddleBottom.dy = 0;
    }
  } else {
    // Solo mode - arrow keys control single paddle
    if (inputState.primaryUp && !inputState.primaryDown) {
      rightPaddleTop.dy = -speed;
    } else if (inputState.primaryDown && !inputState.primaryUp) {
      rightPaddleTop.dy = speed;
    } else {
      rightPaddleTop.dy = 0;
    }
  }
}

document.addEventListener("keydown", (e) => {
  if (!gameMode) return;
  if (e.key === "ArrowUp") inputState.primaryUp = true;
  if (e.key === "ArrowDown") inputState.primaryDown = true;
  if (gameMode === "duo" && e.key === "w") inputState.secondaryUp = true;
  if (gameMode === "duo" && e.key === "s") inputState.secondaryDown = true;
  updatePlayerVelocity();
});

document.addEventListener("keyup", (e) => {
  if (!gameMode) return;
  if (e.key === "ArrowUp") inputState.primaryUp = false;
  if (e.key === "ArrowDown") inputState.primaryDown = false;
  if (gameMode === "duo" && e.key === "w") inputState.secondaryUp = false;
  if (gameMode === "duo" && e.key === "s") inputState.secondaryDown = false;
  updatePlayerVelocity();
});

function update() {
  if (!gameMode) {
    requestAnimationFrame(update);
    return;
  }
  movePaddles();
  moveAI();
  moveBalls();
  scoreUpdater();
  draw();
  requestAnimationFrame(update);
}

update();
