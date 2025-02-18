"use strict";

// ===============================
// モード選択画面の生成＆処理
// ===============================

// 選択されたモード（初期値は null）
let selectedMode = null;

// モード選択画面のボタンを5つ生成する
function setupModeSelection() {
  const modeSelectionDiv = document.getElementById("modeSelection");
  const modeButtonsContainer = document.getElementById("modeButtonsContainer");
  modeButtonsContainer.innerHTML = "";
  for (let modeNum = 1; modeNum <= 5; modeNum++) {
    const button = document.createElement("button");
    button.textContent = "モード " + modeNum;
    button.classList.add("mode-button");
    button.setAttribute("data-mode", modeNum);
    button.addEventListener("click", function () {
      selectedMode = this.getAttribute("data-mode");
      console.log("選択されたモード:", selectedMode);
      modeSelectionDiv.style.display = "none";
      document.getElementById("startScreen").style.display = "block";
      loadConfigs();
    });
    modeButtonsContainer.appendChild(button);
  }
}

// backToModeButton のハンドラを設定する関数
function attachBackButtonHandler() {
  const backButton = document.getElementById("backToModeButton");
  if (backButton) {
    backButton.addEventListener("click", function () {
      // ゲーム中の場合はタイマー等を停止
      if (timerIntervalId) clearInterval(timerIntervalId);
      if (gameLoopId) cancelAnimationFrame(gameLoopId);
      // 選択されたモードをリセット
      selectedMode = null;
      // 必要に応じてBGM停止なども実施
      stopBGM();
      // すべての画面を非表示にしてモード選択画面を表示
      document.getElementById("startScreen").style.display = "none";
      document.getElementById("gameScreen").style.display = "none";
      document.getElementById("modeSelection").style.display = "block";
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    setupModeSelection();
    attachBackButtonHandler();
  });
} else {
  setupModeSelection();
  attachBackButtonHandler();
}

// ===============================
// 設定ファイル・データの読み込み
// ===============================
let gameConfig = null;
let rankData = [];
let wordData = [];

function loadConfigs() {
  // ゲーム設定の読み込み
  fetch(`config${selectedMode}/gameConfig.json`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `config${selectedMode}/gameConfig.json の読み込みに失敗しました`
        );
      }
      return response.json();
    })
    .then((data) => {
      gameConfig = data;
      setupGameConfig();
    })
    .catch((error) => {
      console.error("ゲーム設定の読み込みに失敗しました:", error);
      alert("未実装");
      // モード選択画面に戻る
      document.getElementById("modeSelection").style.display = "block";
      document.getElementById("startScreen").style.display = "none";
    });

  // ランクデータの読み込み（共通）
  fetch("ranks.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error("ranks.json の読み込みに失敗しました");
      }
      return response.json();
    })
    .then((data) => {
      rankData = data;
      console.log("Rank data loaded:", rankData);
    })
    .catch((error) => console.error("Error loading rank data:", error));

  // 問題データの読み込み
  fetch(`config${selectedMode}/questions.json`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `config${selectedMode}/questions.json の読み込みに失敗しました`
        );
      }
      return response.json();
    })
    .then((data) => {
      wordData = data;
      console.log("問題データを読み込みました:", wordData);
    })
    .catch((error) =>
      console.error("問題データの読み込みに失敗しました:", error)
    );
}

// ===============================
// ゲームエンジン本体
// ===============================
const TIME_LIMIT = 60;
let remainingTime = TIME_LIMIT;
let score = 0;
const FALL_SPEED = 100;
let SPAWN_INTERVAL = 2000;
const PENALTY_TIME = 5;

const ROW_HEIGHT = 30;
const SORTING_AREA_ROWS = 3;
const SORTING_AREA_HEIGHT = ROW_HEIGHT * SORTING_AREA_ROWS;

let combo = 0;
let maxCombo = 0;
let lowTimeAlerted = false;

window.categories = ["付属語", "自立語"]; // 初期値（後で gameConfig により上書き）

let fallingWords = [];
let landedWords = [];
let lastSpawnTime = Date.now();
let gameOver = false;
let gameLoopId;
let timerIntervalId;
let lastFrameTime = Date.now();
let wordIdCounter = 0;

function generateUniqueId() {
  return "word_" + wordIdCounter++;
}

// DOM要素の取得
const playArea = document.getElementById("playArea");
const timerDisplay = document.getElementById("timer");
const scoreDisplay = document.getElementById("score");
const comboDisplay = document.getElementById("combo");
const maxComboDisplay = document.getElementById("maxCombo");
const startScreen = document.getElementById("startScreen");
const gameScreen = document.getElementById("gameScreen");
const startButton = document.getElementById("startButton");
const returnButton = document.getElementById("returnButton");

// BGM設定
const normalBgm = new Audio("bgm.mp3");
normalBgm.loop = true;
const alertBgm = new Audio("bgm_alert.mp3");
alertBgm.loop = true;
let bgmSwitched = false;

function startBGM() {
  normalBgm.currentTime = 0;
  normalBgm.play();
}

function stopBGM() {
  normalBgm.pause();
  alertBgm.pause();
}

function setupGameConfig() {
  // タイトル、説明の更新
  document.title = gameConfig.gameName;
  const startScreenTitle = document.querySelector("#startScreen h1");
  const startScreenDesc = document.querySelector("#startScreen p");
  if (startScreenTitle) startScreenTitle.textContent = gameConfig.gameName;
  if (startScreenDesc) startScreenDesc.innerHTML = gameConfig.description;

  // 仕分けエリアの生成
  createSortingSpaces(gameConfig.sortingSpaces);
  window.categories = gameConfig.sortingSpaces;
}

function createSortingSpaces(spaces) {
  const overlay = document.getElementById("sortingAreaOverlay");
  overlay.innerHTML = "";
  const totalSpaces = spaces.length;
  const colors = ["#FFCCCC", "#CCFFCC", "#CCCCFF", "#FFFFCC", "#CCFFFF"];
  spaces.forEach((spaceName, index) => {
    const div = document.createElement("div");
    div.classList.add("sorting-space");
    div.style.width = 100 / totalSpaces + "%";
    div.style.backgroundColor = colors[index % colors.length];
    const span = document.createElement("span");
    span.classList.add("sorting-label");
    span.textContent = spaceName;
    span.style.fontSize = "16px";
    div.appendChild(span);
    overlay.appendChild(div);
    adjustFontSize(span);
  });
}

function adjustFontSize(label) {
  const container = label.parentNode;
  const availableWidth = container.clientWidth;
  let fontSize = parseInt(window.getComputedStyle(label).fontSize);
  const minFontSize = 10;
  label.style.display = "inline-block";
  while (label.scrollWidth > availableWidth && fontSize > minFontSize) {
    fontSize--;
    label.style.fontSize = fontSize + "px";
  }
}

function updateTimerDisplay() {
  timerDisplay.textContent = "Time: " + remainingTime;
  if (remainingTime < 10 && !bgmSwitched) {
    normalBgm.pause();
    alertBgm.currentTime = 0;
    alertBgm.play();
    bgmSwitched = true;
  } else if (remainingTime >= 10 && bgmSwitched) {
    alertBgm.pause();
    normalBgm.currentTime = 0;
    normalBgm.play();
    bgmSwitched = false;
  }
  if (remainingTime < 10) {
    timerDisplay.classList.add("low-time");
    if (!lowTimeAlerted) {
      playLowTimeSound();
      lowTimeAlerted = true;
    }
  } else {
    timerDisplay.classList.remove("low-time");
    lowTimeAlerted = false;
  }
}

function updateScoreDisplay() {
  scoreDisplay.textContent = "Score: " + score;
}

function updateComboDisplay() {
  comboDisplay.classList.remove("combo-effect", "combo-effect-50");
  if (combo > 0 && combo % 50 === 0) {
    comboDisplay.classList.add("combo-effect-50");
  } else if (combo > 0 && combo % 10 === 0) {
    comboDisplay.classList.add("combo-effect");
  }
  comboDisplay.textContent = `COMBO: ${combo}`;
  if (maxComboDisplay) {
    maxComboDisplay.textContent = "MAX: " + maxCombo;
  }
}

function correctAnswer() {
  combo++;
  if (combo > maxCombo) {
    maxCombo = combo;
  }
  updateComboDisplay();
}

function playLowTimeSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.2);
  } catch (e) {
    console.error("Web Audio APIがサポートされていません", e);
  }
}

function getRank(score) {
  for (let rankObj of rankData) {
    if (score >= rankObj.score) {
      return rankObj.rank;
    }
  }
  return "No Rank";
}

function spawnWord(xOverride) {
  if (!wordData || wordData.length === 0) {
    console.warn("wordData が空です。");
    return;
  }
  const data = wordData[Math.floor(Math.random() * wordData.length)];
  const wordDiv = document.createElement("div");
  wordDiv.classList.add("word");
  wordDiv.textContent = data.word;
  wordDiv.dataset.type = data.type;
  wordDiv.id = generateUniqueId();
  wordDiv.dataset.locked = "false";
  wordDiv.dataset.penalized = "false";
  wordDiv.style.whiteSpace = "nowrap";
  wordDiv.style.position = "absolute";
  playArea.appendChild(wordDiv);
  let wordWidth = wordDiv.offsetWidth;
  let x;
  if (xOverride !== undefined) {
    x = xOverride;
  } else {
    x = Math.random() * (playArea.clientWidth - wordWidth);
    let attempts = 0;
    while (attempts < 10) {
      let overlap = false;
      for (const other of fallingWords) {
        if (Math.abs(other.y - -30) < 50) {
          const otherLeft = other.x;
          const otherRight = other.x + other.element.offsetWidth;
          const newLeft = x;
          const newRight = x + wordWidth;
          if (!(newRight < otherLeft || newLeft > otherRight)) {
            overlap = true;
            break;
          }
        }
      }
      if (!overlap) break;
      x = Math.random() * (playArea.clientWidth - wordWidth);
      attempts++;
    }
  }
  if (x + wordWidth > playArea.clientWidth) {
    x = playArea.clientWidth - wordWidth;
  }
  wordDiv.style.left = `${x}px`;
  wordDiv.style.top = "-30px";
  wordDiv.addEventListener("mousedown", handleMouseDown);
  wordDiv.addEventListener("touchstart", handleTouchStart, { passive: false });
  fallingWords.push({ element: wordDiv, x: x, y: -30, speed: FALL_SPEED });
}

function lockWord(wordElem, dropSide) {
  if (wordElem.dataset.locked === "true") return;
  wordElem.dataset.locked = "true";
  wordElem.style.cursor = "default";
  const isCorrect = wordElem.dataset.type === dropSide;
  if (isCorrect) {
    wordElem.classList.add("correct"); // 正解時の光るエフェクト
    score += 50;
    remainingTime += 1;
    correctAnswer();
    updateTimerDisplay();
    updateScoreDisplay();
    const x = parseInt(wordElem.style.left) + wordElem.offsetWidth / 2;
    const y = parseInt(wordElem.style.top) - 20;
    showBonusEffect(x, y);
    setTimeout(() => {
      wordElem.remove();
    }, 500);
  } else {
    wordElem.classList.add("wrong"); // 誤答時の赤いエフェクト（animation-fill-modeで保持）
    remainingTime -= PENALTY_TIME;
    updateTimerDisplay();
    combo = 0;
    updateComboDisplay();
    const x = parseInt(wordElem.style.left) + wordElem.offsetWidth / 2;
    const y = parseInt(wordElem.style.top) - 20;
    showPenaltyEffect(x, y);
    landedWords.push({
      element: wordElem,
      x: parseInt(wordElem.style.left),
      y: parseInt(wordElem.style.top),
    });
  }
  fallingWords = fallingWords.filter((w) => w.element !== wordElem);
}

function getDecisionLineY() {
  const baseLine = playArea.clientHeight - SORTING_AREA_HEIGHT;
  if (landedWords.length === 0) return baseLine;
  const highestLandedY = Math.min(...landedWords.map((lw) => lw.y));
  return Math.min(baseLine, highestLandedY);
}

let currentDrag = null;

function handleMouseDown(e) {
  const wordElem = e.currentTarget;
  if (wordElem.dataset.locked === "true") return;
  e.preventDefault();
  const rect = wordElem.getBoundingClientRect();
  const playAreaRect = playArea.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;
  currentDrag = { element: wordElem, offsetX, offsetY };
  wordElem.classList.add("dragging");
}

function handleMouseMove(e) {
  if (!currentDrag) return;
  const playAreaRect = playArea.getBoundingClientRect();
  let newX = e.clientX - playAreaRect.left - currentDrag.offsetX;
  let newY = e.clientY - playAreaRect.top - currentDrag.offsetY;
  const wordElem = currentDrag.element;
  const elemWidth = wordElem.offsetWidth;
  const elemHeight = wordElem.offsetHeight;
  newX = Math.max(0, Math.min(newX, playArea.clientWidth - elemWidth));
  newY = Math.max(0, Math.min(newY, playArea.clientHeight - elemHeight));
  wordElem.style.left = newX + "px";
  wordElem.style.top = newY + "px";
  const fallingWord = fallingWords.find((w) => w.element === wordElem);
  if (fallingWord) {
    fallingWord.x = newX;
    fallingWord.y = newY;
  }
}

function handleMouseUp(e) {
  if (!currentDrag) return;
  const wordElem = currentDrag.element;
  wordElem.classList.remove("dragging");
  const top = parseInt(wordElem.style.top);
  if (top >= getDecisionLineY() && wordElem.dataset.locked === "false") {
    const dropX = parseInt(wordElem.style.left) + wordElem.offsetWidth / 2;
    const columnWidth = playArea.clientWidth / window.categories.length;
    const columnIndex = Math.floor(dropX / columnWidth);
    const dropCategory = window.categories[columnIndex];
    if (wordElem.dataset.type === dropCategory) {
      lockWord(wordElem, dropCategory);
    } else if (wordElem.dataset.penalized !== "true") {
      wordElem.classList.add("wrong");
      remainingTime -= PENALTY_TIME;
      updateTimerDisplay();
      combo = 0;
      updateComboDisplay();
      wordElem.dataset.penalized = "true";
      const effectX = parseInt(wordElem.style.left) + wordElem.offsetWidth / 2;
      const effectY = parseInt(wordElem.style.top) - 20;
      showPenaltyEffect(effectX, effectY);
    }
  }
  currentDrag = null;
}

function handleTouchStart(e) {
  const touch = e.touches[0];
  e.preventDefault();
  const simulatedEvent = {
    currentTarget: e.currentTarget,
    clientX: touch.clientX,
    clientY: touch.clientY,
    preventDefault: e.preventDefault.bind(e),
  };
  handleMouseDown(simulatedEvent);
}

function handleTouchMove(e) {
  if (!currentDrag) return;
  const touch = e.touches[0];
  const simulatedEvent = {
    clientX: touch.clientX,
    clientY: touch.clientY,
  };
  handleMouseMove(simulatedEvent);
}

function handleTouchEnd(e) {
  if (!currentDrag) return;
  const touch = e.changedTouches[0];
  const simulatedEvent = {
    clientX: touch.clientX,
    clientY: touch.clientY,
  };
  handleMouseUp(simulatedEvent);
}

document.addEventListener("mousemove", handleMouseMove);
document.addEventListener("mouseup", handleMouseUp);
document.addEventListener("touchmove", handleTouchMove, { passive: false });
document.addEventListener("touchend", handleTouchEnd);

function showBonusEffect(x, y) {
  console.log("Bonus effect at", x, y);
}

function showPenaltyEffect(x, y) {
  const penaltyElem = document.createElement("div");
  penaltyElem.classList.add("penalty-effect");
  penaltyElem.textContent = "-5";
  penaltyElem.style.left = x + "px";
  penaltyElem.style.top = y + "px";
  playArea.appendChild(penaltyElem);
  setTimeout(() => {
    penaltyElem.remove();
  }, 1000);
}

function initGame() {
  startScreen.style.display = "none";
  gameScreen.style.display = "block";
  remainingTime = TIME_LIMIT;
  score = 0;
  combo = 0;
  maxCombo = 0;
  lowTimeAlerted = false;
  gameOver = false;
  fallingWords = [];
  landedWords = [];
  const words = playArea.querySelectorAll(".word");
  words.forEach((word) => word.remove());
  updateScoreDisplay();
  updateTimerDisplay();
  updateComboDisplay();
  startBGM();
  gameLoop();
  startTimer();
}

function gameLoop() {
  if (gameOver) return;
  const now = Date.now();
  const delta = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  fallingWords.forEach((word) => {
    if (word.element.dataset.locked === "true") return;
    let currentSpeed = FALL_SPEED + 10 * Math.floor(score / 500);
    let newY = word.y + currentSpeed * delta;
    const wordHeight = word.element.offsetHeight;
    const decisionLineY = getDecisionLineY();
    if (newY >= decisionLineY) {
      const dropX = word.x + word.element.offsetWidth / 2;
      const columnWidth = playArea.clientWidth / window.categories.length;
      const columnIndex = Math.floor(dropX / columnWidth);
      const dropCategory = window.categories[columnIndex];
      if (word.element.dataset.type === dropCategory) {
        lockWord(word.element, dropCategory);
        return;
      } else {
        if (word.element.dataset.penalized !== "true") {
          word.element.classList.add("wrong");
          remainingTime -= PENALTY_TIME;
          updateTimerDisplay();
          combo = 0;
          updateComboDisplay();
          word.element.dataset.penalized = "true";
          const effectX = word.x + word.element.offsetWidth / 2;
          const effectY = newY - 20;
          showPenaltyEffect(effectX, effectY);
        }
        let landingY = playArea.clientHeight - wordHeight;
        landedWords.forEach((lw) => {
          const wordLeft = word.x;
          const wordRight = word.x + word.element.offsetWidth;
          const lwLeft = lw.x;
          const lwRight = lw.x + lw.element.offsetWidth;
          if (!(wordRight < lwLeft || wordLeft > lwRight)) {
            const candidate = lw.y - wordHeight;
            if (candidate < landingY) landingY = candidate;
          }
        });
        if (newY >= landingY) {
          newY = landingY;
          word.y = newY;
          word.element.style.top = word.y + "px";
          word.element.dataset.locked = "true";
          landedWords.push({ element: word.element, x: word.x, y: newY });
          word.landed = true;
          return;
        }
      }
    } else {
      if (newY > playArea.clientHeight) {
        word.element.remove();
        word.remove = true;
        return;
      }
    }
    word.y = newY;
    word.element.style.top = word.y + "px";
  });
  fallingWords = fallingWords.filter((word) => !word.landed && !word.remove);
  const sortingOverlay = document.getElementById("sortingAreaOverlay");
  if (sortingOverlay) {
    let currentDecisionLine = getDecisionLineY();
    sortingOverlay.style.top = currentDecisionLine + "px";
    sortingOverlay.style.height =
      playArea.clientHeight - currentDecisionLine + "px";
  }
  if (now - lastSpawnTime > SPAWN_INTERVAL) {
    let spawnCount = Math.min(5, 1 + Math.floor(score / 1000));
    if (spawnCount > 1) {
      const wordWidth = 50;
      const totalSpace = playArea.clientWidth - wordWidth;
      const spacing = totalSpace / (spawnCount - 1);
      const STAGGER_DELAY = 1000;
      for (let i = 0; i < spawnCount; i++) {
        const presetX = i * spacing;
        setTimeout(() => {
          spawnWord(presetX);
        }, i * STAGGER_DELAY);
      }
    } else {
      spawnWord();
    }
    lastSpawnTime = now;
  }
  gameLoopId = requestAnimationFrame(gameLoop);
}

function startTimer() {
  timerIntervalId = setInterval(() => {
    if (remainingTime > 0) {
      remainingTime--;
      updateTimerDisplay();
    } else {
      gameOver = true;
      clearInterval(timerIntervalId);
      cancelAnimationFrame(gameLoopId);
      showGameOver();
    }
  }, 1000);
}

function showGameOver() {
  console.log("Game Over");
  const rank = getRank(score);
  alert("ゲームオーバー！ スコアは " + score + "\nあなたのランクは " + rank);
  stopBGM();
  gameScreen.style.display = "none";
  startScreen.style.display = "block";
}

returnButton.addEventListener("click", () => {
  gameOver = true;
  clearInterval(timerIntervalId);
  cancelAnimationFrame(gameLoopId);
  stopBGM();
  gameScreen.style.display = "none";
  startScreen.style.display = "block";
});

startButton.addEventListener("click", () => {
  initGame();
});
