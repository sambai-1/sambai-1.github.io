import { FEATURES, FEATURE_NAMES, cardKey, isSet } from "./core.mjs";
import { formatDuration } from "./run-state.mjs";
import { boardColumnCount, claimSet, createTable, dealCards, findVisibleSet, tableHasSet } from "./table-state.mjs";
import { loadPreferences, savePreferences } from "./preferences.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";
const COLOR_PALETTES = {
  standard: { red: "#ed2134", purple: "#64369b", green: "#00a957" },
  colorblind: { red: "#e69f00", purple: "#0072b2", green: "#cc79a7" },
};
const COLOR_NAMES = {
  standard: { red: "red", purple: "purple", green: "green" },
  colorblind: { red: "orange", purple: "blue", green: "pink" },
};
const NUMBER_WORDS = { 1: "one", 2: "two", 3: "three" };
const FEATURE_LABELS = { shape: "Shape", color: "Color", number: "Number", shading: "Shading" };
const CORRECT_SET_HIGHLIGHT_MS = 500;
const elements = Object.fromEntries([
  "colorBlindButton", "howToButton", "howToDialog", "closeHowToButton", "doneHowToButton", "featureGuide", "exampleList",
  "correctStat", "wrongStat", "timeStat", "feedback", "gameBoard", "startPrompt", "newGameButton",
  "addThreeButton", "hintButton", "deckCount", "deckRemaining", "historyPanel", "historyList",
  "classicResultDialog", "classicResultTitle", "classicResultCorrect", "classicResultWrong", "classicResultTotalTime",
  "classicResultAverageTime", "classicShareButton", "classicCloseResultButton", "classicShareStatus", "classicResultsButton",
].map((id) => [id, document.getElementById(id)]));
const savedPreferences = loadPreferences();

const state = {
  active: false,
  finished: false,
  board: [],
  deck: [],
  selected: new Set(),
  wrongCards: new Set(),
  resolvingSet: false,
  hintedCardKey: null,
  correct: 0,
  wrong: 0,
  startedAt: 0,
  endedAt: 0,
  timer: null,
  solved: [],
  colorBlind: savedPreferences.colorBlind,
};
let svgSequence = 0;
let wrongSequence = 0;
let pendingSetTimeout = null;
let pendingResultTimeout = null;

function cardDescription(card) {
  const paletteName = card.color;
  const shape = card.number === 1 ? card.shape : `${card.shape}s`;
  return `${NUMBER_WORDS[card.number]} ${card.shading} ${COLOR_NAMES[state.colorBlind ? "colorblind" : "standard"][paletteName]} ${shape}`;
}

function symbolMarkup(card, x, patternId) {
  const palette = COLOR_PALETTES[state.colorBlind ? "colorblind" : "standard"];
  const color = palette[card.color];
  const fill = card.shading === "solid" ? color : card.shading === "striped" ? `url(#${patternId})` : "#fff";
  const common = `fill="${fill}" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"`;
  if (card.shape === "oval") return `<rect x="${x - 13}" y="18" width="26" height="60" rx="13" ${common}/>`;
  if (card.shape === "diamond") return `<path d="M ${x} 17 L ${x + 15} 48 L ${x} 79 L ${x - 15} 48 Z" ${common}/>`;
  return `<path d="M -7 22 C 0 20 7 23 9 29 C 12 36 10 43 7 49 C 5 55 12 62 11 65 C 10 69 4 71 -2 70 C -9 69 -11 64 -10 58 C -9 53 -7 49 -6 44 C -5 39 -8 35 -10 30 C -11 26 -10 23 -7 22 Z" transform="translate(${x} 48) scale(1.2) translate(0 -48)" ${common}/>`;
}

function createCardVisual(card, compact = false) {
  const wrapper = document.createElement("span");
  wrapper.className = `set-card${compact ? " is-compact" : ""}`;
  const patternId = `classic-stripe-${svgSequence += 1}`;
  const xPositions = card.number === 1 ? [75] : card.number === 2 ? [51, 99] : [31, 75, 119];
  const palette = COLOR_PALETTES[state.colorBlind ? "colorblind" : "standard"];
  wrapper.innerHTML = `<svg viewBox="0 0 150 96" aria-hidden="true" focusable="false" xmlns="${SVG_NS}"><defs><pattern id="${patternId}" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#fff"></rect><path d="M 0 1 H 6" stroke="${palette[card.color]}" stroke-width="1.5"></path></pattern></defs>${xPositions.map((x) => symbolMarkup(card, x, patternId)).join("")}</svg>`;
  return wrapper;
}

function updateStats(now = performance.now()) {
  elements.correctStat.textContent = state.correct;
  elements.wrongStat.textContent = state.wrong;
  const end = state.active ? now : state.endedAt;
  elements.timeStat.textContent = formatDuration(Math.max(0, end - state.startedAt), 1);
}

function setFeedback(message = "", kind = "") {
  elements.feedback.textContent = message;
  elements.feedback.className = `feedback${kind ? ` is-${kind}` : ""}`;
}

function renderBoard({ focusKey = null, motion = null } = {}) {
  const showBoard = state.active || state.finished;
  const visibleSet = state.active ? findVisibleSet(state.board) : null;
  const previousCards = motion
    ? new Map([...elements.gameBoard.querySelectorAll(".classic-card-button")]
      .map((button) => [button.dataset.cardKey, { button, rect: button.getBoundingClientRect() }]))
    : null;
  elements.gameBoard.style.setProperty("--board-columns", boardColumnCount(state.board.length));
  elements.gameBoard.replaceChildren();
  state.board.forEach((card) => {
    const key = cardKey(card);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "classic-card-button";
    button.dataset.cardKey = key;
    button.setAttribute("aria-label", cardDescription(card));
    button.setAttribute("aria-pressed", String(state.selected.has(key)));
    if (state.selected.has(key)) button.classList.add("is-selected");
    if (state.resolvingSet) {
      button.setAttribute("aria-disabled", "true");
      if (state.selected.has(key)) button.classList.add("is-correct");
    }
    if (state.wrongCards.has(key)) button.classList.add("is-wrong");
    if (state.hintedCardKey === key) {
      button.classList.add("is-hinted");
      button.setAttribute("aria-label", `Hint: ${cardDescription(card)} is part of a visible set`);
    }
    button.disabled = !state.active;
    button.append(createCardVisual(card));
    button.addEventListener("click", () => toggleCard(card));
    elements.gameBoard.append(button);
  });
  elements.deckRemaining.textContent = state.deck.length;
  elements.deckCount.hidden = !showBoard;
  elements.gameBoard.hidden = !showBoard;
  elements.startPrompt.hidden = showBoard;
  elements.addThreeButton.hidden = !state.active;
  elements.addThreeButton.disabled = state.finished || state.resolvingSet || state.deck.length === 0;
  elements.hintButton.hidden = !state.active;
  elements.hintButton.disabled = state.resolvingSet || visibleSet === null;
  elements.classicResultsButton.hidden = !state.finished;
  if (motion && previousCards && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    animateBoardChange(previousCards, motion);
  }
  if (focusKey && state.active) {
    const target = [...elements.gameBoard.querySelectorAll(".classic-card-button")]
      .find((button) => button.dataset.cardKey === focusKey)
      ?? (motion?.enteringKeys ?? []).map((key) => [...elements.gameBoard.querySelectorAll(".classic-card-button")]
        .find((button) => button.dataset.cardKey === key)).find(Boolean)
      ?? elements.gameBoard.querySelector(".classic-card-button");
    target?.focus();
  }
}

function animateBoardChange(previousCards, motion) {
  const duration = motion.reflow ? 500 : 210;
  const exitDuration = motion.reflow ? 190 : duration;
  const enteringKeys = new Set(motion.enteringKeys ?? []);
  const exitingKeys = new Set(motion.exitingKeys ?? []);
  const currentButtons = new Map([...elements.gameBoard.querySelectorAll(".classic-card-button")]
    .map((button) => [button.dataset.cardKey, button]));

  for (const [key, previous] of previousCards) {
    if (currentButtons.has(key)) {
      if (motion.reflow && !enteringKeys.has(key)) {
        const nextRect = currentButtons.get(key).getBoundingClientRect();
        const dx = previous.rect.left - nextRect.left;
        const dy = previous.rect.top - nextRect.top;
        if (dx || dy) {
          const button = currentButtons.get(key);
          button.style.position = "relative";
          button.style.zIndex = "2";
          const moveAnimation = button.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
            { duration, delay: exitDuration, fill: "backwards", easing: "linear" },
          );
          moveAnimation.finished.then(() => {
            button.style.removeProperty("position");
            button.style.removeProperty("z-index");
          }, () => {
            button.style.removeProperty("position");
            button.style.removeProperty("z-index");
          });
        }
      }
      continue;
    }

    if (!exitingKeys.has(key)) continue;
    const ghost = previous.button.cloneNode(true);
    const rect = previous.rect;
    ghost.setAttribute("aria-hidden", "true");
    ghost.tabIndex = -1;
    ghost.disabled = true;
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: "0",
      zIndex: "1",
      pointerEvents: "none",
    });
    document.body.append(ghost);
    const exitAnimation = ghost.animate(
      [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.88)" }],
      { duration: exitDuration, easing: "ease-out" },
    );
    exitAnimation.finished.then(() => ghost.remove(), () => ghost.remove());
  }

  for (const key of enteringKeys) {
    const button = currentButtons.get(key);
    if (!button) continue;
    button.animate(
      [{ opacity: 0, transform: "scale(.94)" }, { opacity: 1, transform: "scale(1)" }],
      { duration, easing: "cubic-bezier(.2,.75,.25,1)" },
    );
  }
}

function renderHistory() {
  elements.historyPanel.hidden = state.solved.length === 0;
  elements.historyList.replaceChildren();
  state.solved.forEach((solution, index) => {
    const item = document.createElement("article");
    item.className = "history-item";
    item.setAttribute("role", "group");
    item.setAttribute("aria-label", `Set ${index + 1}`);
    const cards = document.createElement("div");
    cards.className = "history-cards";
    solution.cards.forEach((card) => {
      const visual = createCardVisual(card, true);
      visual.setAttribute("role", "img");
      visual.setAttribute("aria-label", cardDescription(card));
      cards.append(visual);
    });
    item.append(cards);
    elements.historyList.append(item);
  });
}

function updateResultSummary() {
  const totalElapsedMs = Math.max(0, state.endedAt - state.startedAt);
  elements.classicResultTitle.textContent = "Game complete";
  elements.classicResultCorrect.textContent = String(state.correct);
  elements.classicResultWrong.textContent = String(state.wrong);
  elements.classicResultTotalTime.textContent = formatDuration(totalElapsedMs, 1);
  elements.classicResultAverageTime.textContent = state.correct > 0
    ? formatDuration(totalElapsedMs / state.correct, 1)
    : "—";
}

function openResultDialog() {
  if (state.finished && !elements.classicResultDialog.open) {
    elements.classicResultDialog.showModal();
  }
}

function scheduleResultDialog(delayMs) {
  if (pendingResultTimeout !== null) window.clearTimeout(pendingResultTimeout);
  pendingResultTimeout = window.setTimeout(() => {
    pendingResultTimeout = null;
    openResultDialog();
  }, delayMs);
}

function finishIfDone({ render = true, motionDuration = 0 } = {}) {
  if (!state.active || state.deck.length > 0 || tableHasSet(state.board)) return false;
  state.active = false;
  state.finished = true;
  state.endedAt = performance.now();
  if (state.timer !== null) window.clearInterval(state.timer);
  state.timer = null;
  setFeedback("No more sets. Game complete!", "correct");
  updateStats(state.endedAt);
  updateResultSummary();
  elements.classicResultsButton.hidden = false;
  if (render) {
    renderBoard();
  } else {
    elements.gameBoard.querySelectorAll(".classic-card-button").forEach((button) => { button.disabled = true; });
    elements.addThreeButton.hidden = true;
    elements.hintButton.hidden = true;
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  scheduleResultDialog(reducedMotion ? 0 : motionDuration);
  return true;
}

function drawCards(count) {
  dealCards({ board: state.board, deck: state.deck }, count);
}

function startNewGame() {
  if (state.timer !== null) window.clearInterval(state.timer);
  if (pendingSetTimeout !== null) window.clearTimeout(pendingSetTimeout);
  pendingSetTimeout = null;
  if (pendingResultTimeout !== null) window.clearTimeout(pendingResultTimeout);
  pendingResultTimeout = null;
  if (elements.classicResultDialog.open) elements.classicResultDialog.close();
  state.active = true;
  state.finished = false;
  state.resolvingSet = false;
  const table = createTable();
  state.deck = table.deck;
  state.board = table.board;
  state.selected.clear();
  state.wrongCards.clear();
  state.hintedCardKey = null;
  state.correct = 0;
  state.wrong = 0;
  state.solved = [];
  elements.classicResultsButton.hidden = true;
  elements.classicShareStatus.textContent = "";
  state.startedAt = performance.now();
  state.endedAt = state.startedAt;
  setFeedback("Select three cards to check for a set.");
  updateStats(state.startedAt);
  renderBoard();
  renderHistory();
  state.timer = window.setInterval(() => updateStats(), 100);
  elements.newGameButton.focus();
}

function wrongTriple(cards, message = "Not a set", focusKey = null) {
  state.wrong += 1;
  state.selected.clear();
  state.wrongCards = new Set(cards.map(cardKey));
  const sequence = ++wrongSequence;
  setFeedback(message, "wrong");
  updateStats();
  renderBoard({ focusKey });
  window.setTimeout(() => {
    if (sequence !== wrongSequence) return;
    state.wrongCards.clear();
    elements.gameBoard.querySelectorAll(".classic-card-button.is-wrong")
      .forEach((button) => button.classList.remove("is-wrong"));
  }, 520);
}

function completeSet(cards) {
  state.correct += 1;
  state.solved.push({ cards: [...cards] });
  const previousKeys = new Set(state.board.map(cardKey));
  const previousColumnCount = Math.ceil(state.board.length / 3);
  const exitingKeys = cards.map(cardKey);
  claimSet(state, cards);
  const currentKeys = new Set(state.board.map(cardKey));
  const enteringKeys = [...currentKeys].filter((key) => !previousKeys.has(key));
  const reflow = previousColumnCount > 4 && Math.ceil(state.board.length / 3) < previousColumnCount;
  state.resolvingSet = false;
  state.hintedCardKey = null;
  state.selected.clear();
  state.wrongCards.clear();
  setFeedback("Set found!", "correct");
  updateStats();
  renderBoard({
    focusKey: cards[0] ? cardKey(cards[0]) : null,
    motion: { reflow, exitingKeys, enteringKeys },
  });
  renderHistory();
  finishIfDone({ render: false, motionDuration: reflow ? 690 : 210 });
}

function checkSelected(focusKey) {
  const keys = state.selected;
  const cards = state.board.filter((card) => keys.has(cardKey(card)));
  if (!isSet(cards)) {
    wrongTriple(cards, "Not a set", cards.at(-1) ? cardKey(cards.at(-1)) : null);
    return;
  }

  state.resolvingSet = true;
  state.hintedCardKey = null;
  setFeedback("Set found!", "correct");
  renderBoard({ focusKey });
  pendingSetTimeout = window.setTimeout(() => {
    pendingSetTimeout = null;
    if (state.active && state.resolvingSet) completeSet(cards);
  }, CORRECT_SET_HIGHLIGHT_MS);
}

function toggleCard(card) {
  if (!state.active || state.resolvingSet) return;
  const key = cardKey(card);
  if (state.selected.has(key)) state.selected.delete(key);
  else if (state.selected.size < 3) state.selected.add(key);
  if (state.selected.size === 3) {
    checkSelected(key);
    return;
  }
  setFeedback(`${state.selected.size} of 3 cards selected.`);
  renderBoard({ focusKey: key });
}

function flashAddThreePenalty() {
  elements.addThreeButton.classList.remove("is-wrong");
  void elements.addThreeButton.offsetWidth;
  elements.addThreeButton.classList.add("is-wrong");
  wrongTriple([], "There is already a set on the board. Add 3 is a wrong move.");
  window.setTimeout(() => elements.addThreeButton.classList.remove("is-wrong"), 520);
}

function addThree() {
  if (!state.active || state.resolvingSet || state.deck.length === 0) return;
  if (tableHasSet(state.board)) {
    flashAddThreePenalty();
    return;
  }
  const previousKeys = new Set(state.board.map(cardKey));
  drawCards(3);
  const enteringKeys = state.board.map(cardKey).filter((key) => !previousKeys.has(key));
  state.hintedCardKey = null;
  state.selected.clear();
  setFeedback("Three cards added. Find a set.");
  renderBoard({ motion: { enteringKeys } });
  finishIfDone({ render: false, motionDuration: 210 });
}

function hintSet() {
  if (!state.active || state.resolvingSet) return;
  const visibleSet = findVisibleSet(state.board);
  if (!visibleSet) {
    elements.hintButton.disabled = true;
    setFeedback("No set is visible. Add 3 cards to continue.");
    return;
  }

  const hintedCard = visibleSet[0];
  state.wrong += 1;
  state.hintedCardKey = cardKey(hintedCard);
  updateStats();
  setFeedback(`Hint: ${cardDescription(hintedCard)} is highlighted and belongs to a visible set.`, "hint");
  renderBoard({ focusKey: state.hintedCardKey });
}

async function shareResults() {
  const totalElapsedMs = Math.max(0, state.endedAt - state.startedAt);
  const average = state.correct > 0 ? formatDuration(totalElapsedMs / state.correct, 1) : "—";
  const text = [
    "Classic Sets results",
    `Correct: ${state.correct}`,
    `Wrong: ${state.wrong}`,
    `Total time: ${formatDuration(totalElapsedMs, 1)}`,
    `Average per set: ${average}`,
    window.location.href,
  ].join("\n");

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    elements.classicResultDialog.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard copy failed");
  }

  elements.classicShareButton.textContent = "Copied!";
  elements.classicShareStatus.textContent = "Results copied to clipboard.";
  window.setTimeout(() => {
    elements.classicShareButton.textContent = "Share";
  }, 1800);
}

function buildInstructions() {
  elements.featureGuide.replaceChildren();
  elements.exampleList.replaceChildren();
  const sampleBuilders = {
    shape: (value) => ({ shape: value, color: "red", number: 1, shading: "solid" }),
    color: (value) => ({ shape: "oval", color: value, number: 1, shading: "solid" }),
    number: (value) => ({ shape: "oval", color: "green", number: value, shading: "solid" }),
    shading: (value) => ({ shape: "diamond", color: "purple", number: 1, shading: value }),
  };
  for (const feature of FEATURE_NAMES) {
    const block = document.createElement("section");
    block.className = "feature-block";
    const heading = document.createElement("h4");
    heading.textContent = FEATURE_LABELS[feature];
    const values = document.createElement("div");
    values.className = "feature-values";
    for (const value of FEATURES[feature]) {
      const sample = document.createElement("div");
      sample.className = "feature-value";
      sample.append(createCardVisual(sampleBuilders[feature](value), true));
      const label = document.createElement("span");
      label.textContent = feature === "number"
        ? NUMBER_WORDS[value]
        : feature === "color"
          ? COLOR_NAMES[state.colorBlind ? "colorblind" : "standard"][value]
          : String(value);
      sample.append(label);
      values.append(sample);
    }
    block.append(heading, values);
    elements.featureGuide.append(block);
  }

  const examples = [
    { cards: [{ shape: "oval", color: "red", number: 2, shading: "solid" }, { shape: "oval", color: "red", number: 2, shading: "striped" }, { shape: "oval", color: "red", number: 2, shading: "empty" }], description: "Same shape, color, and number — different shading" },
    { cards: [{ shape: "oval", color: "red", number: 1, shading: "solid" }, { shape: "squiggle", color: "purple", number: 2, shading: "solid" }, { shape: "diamond", color: "green", number: 3, shading: "solid" }], description: "Different shapes, colors, and numbers — same shading" },
    { cards: [{ shape: "oval", color: "red", number: 1, shading: "empty" }, { shape: "squiggle", color: "purple", number: 2, shading: "striped" }, { shape: "diamond", color: "green", number: 3, shading: "solid" }], description: "All four features are different" },
  ];
  for (const example of examples) {
    const row = document.createElement("div");
    row.className = "example-set";
    const cards = document.createElement("div");
    cards.className = "example-cards";
    example.cards.forEach((card) => cards.append(createCardVisual(card, true)));
    const description = document.createElement("p");
    description.textContent = example.description;
    row.append(cards, description);
    elements.exampleList.append(row);
  }
}

elements.newGameButton.addEventListener("click", startNewGame);
elements.addThreeButton.addEventListener("click", addThree);
elements.hintButton.addEventListener("click", hintSet);
elements.classicResultsButton.addEventListener("click", openResultDialog);
elements.classicCloseResultButton.addEventListener("click", () => elements.classicResultDialog.close());
elements.classicShareButton.addEventListener("click", () => {
  shareResults().catch(() => {
    elements.classicShareStatus.textContent = "Could not copy results. Please try again.";
  });
});
elements.timeStat.closest(".reveal-time-stat").addEventListener("click", (event) => {
  event.currentTarget.classList.toggle("is-revealed");
});
elements.colorBlindButton.setAttribute("aria-pressed", String(state.colorBlind));
elements.colorBlindButton.addEventListener("click", () => {
  state.colorBlind = !state.colorBlind;
  savePreferences({ ...savedPreferences, colorBlind: state.colorBlind });
  elements.colorBlindButton.setAttribute("aria-pressed", String(state.colorBlind));
  renderBoard();
  renderHistory();
  buildInstructions();
});
elements.howToButton.addEventListener("click", () => elements.howToDialog.showModal());
elements.closeHowToButton.addEventListener("click", () => elements.howToDialog.close());
elements.doneHowToButton.addEventListener("click", () => elements.howToDialog.close());
buildInstructions();
updateStats(0);
renderBoard();
