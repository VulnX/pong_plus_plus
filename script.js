const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const paddleWidth = 10;
const paddleHeight = 100;
const ballSize = 10;
const speed = 6;

let leftPaddle = {
  x: 10,
  y: canvas.height / 2 - paddleHeight / 2,
  dy: 0,
};

let rightPaddle = {
  x: canvas.width - 20,
  y: canvas.height / 2 - paddleHeight / 2,
  dy: 0,
};

let ball = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  dx: 2,
  dy: 2,
};

function movePaddles() {
  leftPaddle.y += leftPaddle.dy;
  rightPaddle.y += rightPaddle.dy;

  // Keep paddles in canvas limit
  leftPaddle.y = Math.max(
    Math.min(leftPaddle.y, canvas.height - paddleHeight),
    0
  );
  rightPaddle.y = Math.max(
    Math.min(rightPaddle.y, canvas.height - paddleHeight),
    0
  );
}

function moveBall() {
  ball.x += ball.dx;
  ball.y += ball.dy;
  // vertical collision
  if (ball.y <= 0 || canvas.height <= ball.y + ballSize) ball.dy *= -1;
  // left paddle collision
  if (
    ball.x <= leftPaddle.x + paddleWidth &&
    leftPaddle.y <= ball.y + ballSize &&
    ball.y <= leftPaddle.y + paddleHeight
  ) {
    ball.dx *= -1;
    ball.x = leftPaddle.x + paddleWidth;
  }
  // right paddle collision
  if (
    rightPaddle.x <= ball.x + ballSize &&
    rightPaddle.y <= ball.y + ballSize &&
    ball.y <= rightPaddle.y + paddleHeight
  ) {
    ball.dx *= -1;
    ball.x = rightPaddle.x - paddleWidth;
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Draw paddles
  ctx.fillStyle = "white";
  ctx.fillRect(leftPaddle.x, leftPaddle.y, paddleWidth, paddleHeight);
  ctx.fillRect(rightPaddle.x, rightPaddle.y, paddleWidth, paddleHeight);
  // Draw ball
  ctx.fillRect(ball.x, ball.y, ballSize, ballSize);
  // TODO: Draw scores
}

document.addEventListener("keydown", (e) => {
  if (e.key === "w") leftPaddle.dy = -speed;
  if (e.key === "s") leftPaddle.dy = speed;

  if (e.key === "ArrowUp") rightPaddle.dy = -speed;
  if (e.key === "ArrowDown") rightPaddle.dy = speed;
});

document.addEventListener("keyup", (e) => {
  if (["w", "s"].includes(e.key)) leftPaddle.dy = 0;

  if (["ArrowUp", "ArrowDown"].includes(e.key)) rightPaddle.dy = 0;
});

function update() {
  movePaddles();
  moveBall();
  draw();
  requestAnimationFrame(update);
}

update();
