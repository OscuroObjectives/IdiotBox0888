// IMPORTANT: Replace this placeholder with the deployed BOX-0888 contract address.
const contractAddress = "0xE3215339B0c8E1b6365E716d6C8B82cbaE0420e7";

const contractABI = [
  "function startGame()",
  "function submitScore(uint256 score)",
  "function gameActive(address player) view returns (bool)",
  "function WINNING_SCORE() view returns (uint256)",
  "event GameStarted(address indexed player, uint256 indexed gameId)",
  "event ScoreSubmitted(address indexed player, uint256 indexed gameId, uint256 score)",
  "event AuthorizationCommandIssued(uint256 indexed commandId, uint8 command, address indexed issuedBy)"
];

// If the contract is deployed on Monad Mainnet, Chain ID is 143.
// Change this only if you deploy BOX-0888 to another network.
const EXPECTED_CHAIN_ID = 143;

let provider;
let signer;
let contract;
let userAddress;
let gameRunning = false;
let submittingScore = false;
let obstacleTimer = null;
let score = 0;
let obstacles = [];
let animationFrame = null;
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const connectButton = document.getElementById("connectButton");
const playButton = document.getElementById("playButton");
const walletAddressText = document.getElementById("walletAddress");
const statusText = document.getElementById("status");
const scoreDisplay = document.getElementById("scoreDisplay");

const player = { x: 100, y: 200, width: 40, height: 40, velocityY: 0, jumping: false };
const gravity = 0.8;

connectButton.addEventListener("click", connectWallet);
playButton.addEventListener("click", startPaidByTransactionGame);

async function connectWallet() {
  try {
    if (!window.ethereum) throw new Error("MetaMask was not detected. Open this site in a browser with MetaMask installed.");
    if (contractAddress.startsWith("REPLACE_")) throw new Error("The contract address has not been configured in script.js yet.");

    await window.ethereum.request({ method: "eth_requestAccounts" });
    provider = new ethers.providers.Web3Provider(window.ethereum);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== EXPECTED_CHAIN_ID) {
      throw new Error(`Wrong network. Switch MetaMask to Monad Mainnet (Chain ID ${EXPECTED_CHAIN_ID}) and reconnect.`);
    }

    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    contract = new ethers.Contract(contractAddress, contractABI, signer);
    walletAddressText.innerText = `Wallet: ${userAddress}`;
    statusText.innerText = "Status: Wallet connected. Press Start Game.";
    playButton.disabled = false;
  } catch (error) {
    console.error(error);
    statusText.innerText = `Status: ${friendlyError(error)}`;
  }
}

async function startPaidByTransactionGame() {
  if (!contract || gameRunning || submittingScore) return;
  try {
    playButton.disabled = true;
    statusText.innerText = "Status: Confirm Start Game in MetaMask...";
    const tx = await contract.startGame();
    statusText.innerText = "Status: Waiting for blockchain confirmation...";
    await tx.wait();
    statusText.innerText = "Status: Start Game confirmed. Game starting!";
    startGame();
  } catch (error) {
    console.error(error);
    statusText.innerText = `Status: Could not start game. ${friendlyError(error)}`;
    playButton.disabled = false;
  }
}

function startGame() {
  if (gameRunning) return;
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  if (obstacleTimer !== null) clearTimeout(obstacleTimer);
  score = 0;
  obstacles = [];
  gameRunning = true;
  submittingScore = false;
  player.y = 200;
  player.velocityY = 0;
  player.jumping = false;
  scoreDisplay.innerText = "Score: 0";
  statusText.innerText = "Status: Game running — reach 1,001 or higher.";
  spawnObstacle();
  animationFrame = requestAnimationFrame(gameLoop);
}

function gameLoop() {
  if (!gameRunning) return;
  update();
  draw();
  animationFrame = requestAnimationFrame(gameLoop);
}

function update() {
  score++;
  scoreDisplay.innerText = `Score: ${score}`;
  player.velocityY += gravity;
  player.y += player.velocityY;
  if (player.y > 200) {
    player.y = 200;
    player.velocityY = 0;
    player.jumping = false;
  }
  for (const obstacle of obstacles) obstacle.x -= 6;
  obstacles = obstacles.filter(obstacle => obstacle.x > -50);

  for (const obstacle of obstacles) {
    if (player.x < obstacle.x + obstacle.width &&
        player.x + player.width > obstacle.x &&
        player.y < obstacle.y + obstacle.height &&
        player.y + player.height > obstacle.y) {
      endGame();
      return;
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#888";
  ctx.fillRect(0, 240, canvas.width, 5);
  ctx.fillStyle = "#222";
  ctx.fillRect(player.x, player.y, player.width, player.height);
  ctx.fillStyle = "#16833b";
  for (const obstacle of obstacles) ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
  ctx.fillStyle = "#111";
  ctx.font = "24px Arial";
  ctx.fillText(`Score: ${score}`, 20, 40);
}

function spawnObstacle() {
  if (!gameRunning) return;
  obstacles.push({ x: canvas.width, y: 200, width: 30, height: 40 });
  obstacleTimer = setTimeout(spawnObstacle, Math.random() * 1000 + 900);
}

function jump() {
  if (gameRunning && !player.jumping) {
    player.velocityY = -15;
    player.jumping = true;
  }
}

document.addEventListener("keydown", event => {
  if ((event.code === "Space" || event.code === "ArrowUp") && gameRunning) {
    event.preventDefault();
    jump();
  }
});
canvas.addEventListener("pointerdown", () => jump());

async function endGame() {
  if (!gameRunning || submittingScore) return;
  gameRunning = false;
  submittingScore = true;
  if (obstacleTimer !== null) clearTimeout(obstacleTimer);
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  draw();

  const finalScore = score;
  statusText.innerText = `Status: Game over. Submitting score ${finalScore} to the blockchain...`;
  try {
    const tx = await contract.submitScore(finalScore);
    statusText.innerText = "Status: Score transaction submitted. Waiting for confirmation...";
    await tx.wait();

    if (finalScore > 1000) {
      statusText.innerText = `Status: Score ${finalScore} confirmed. AUTHORIZE command recorded; Render can enable Button 1.`;
    } else {
      statusText.innerText = `Status: Score ${finalScore} confirmed. Score must be above 1,000; Button 1 will not be enabled (DEAUTHORIZE command recorded).`;
    }
  } catch (error) {
    console.error(error);
    statusText.innerText = `Status: Score submission failed. ${friendlyError(error)}`;
  } finally {
    submittingScore = false;
    playButton.disabled = !contract;
  }
}

function friendlyError(error) {
  if (error && error.code === 4001) return "Transaction rejected in MetaMask.";
  return error?.reason || error?.data?.message || error?.message || "Please try again.";
}

// Keep the page aware if the wallet account or network changes.
if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => window.location.reload());
  window.ethereum.on("chainChanged", () => window.location.reload());
}

draw();
