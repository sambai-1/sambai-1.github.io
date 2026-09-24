import { FEATURES, FEATURE_NAMES, cardKey, isSet } from "./core.mjs";
import { formatDuration } from "./run-state.mjs";
import { claimSet, createTable, dealCards, tableHasSet } from "./table-state.mjs";
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
const elements = Object.fromEntries([
  "colorBlindButton", "howToButton", "howToDialog", "closeHowToButton", "doneHowToButton", "featureGuide", "exampleList",
  "correctStat", "wrongStat", "timeStat", "feedback", "gameBoard", "startPrompt", "newGameButton",
  "addThreeButton", "deckCount", "deckRemaining", "historyPanel", "historyCount", "historyList",
].map((id) => [id, document.getElementById(id)]));
const savedPreferences = loadPreferences();

const state = {
  active: false,
  finished: false,
  board: [],
  deck: [],
  selected: new Set(),
  wrongCards: new Set(),
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

function renderBoard({ focusKey = null } = {}) {
  const showBoard = state.active || state.finished;
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
    if (state.wrongCards.has(key)) button.classList.add("is-wrong");
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
  elements.addThreeButton.disabled = state.finished || state.deck.length === 0;
  if (focusKey && state.active) {
    const target = [...elements.gameBoard.querySelectorAll(".classic-card-button")]
      .find((button) => button.dataset.cardKey === focusKey)
      ?? elements.gameBoard.querySelector(".classic-card-button");
    target?.focus();
  }
}

function renderHistory() {
  elements.historyPanel.hidden = state.solved.length === 0;
  elements.historyCount.textContent = `${state.solved.length} solved`;
  elements.historyList.replaceChildren();
  state.solved.forEach((solution, index) => {
    const item = document.createElement("article");
    item.className = "history-item";
    const meta = document.createElement("div");
    meta.className = "history-meta";
    const title = document.createElement("strong");
    title.textContent = `Set ${index + 1}`;
    const time = document.createElement("span");
    time.textContent = formatDuration(solution.elapsedMs, 1);
    meta.append(title, time);
    const cards = document.createElement("div");
    cards.className = "history-cards";
    solution.cards.forEach((card) => cards.append(createCardVisual(card, true)));
    item.append(meta, cards);
    elements.historyList.append(item);
  });
}

function finishIfDone() {
  if (!state.active || state.deck.length > 0 || tableHasSet(state.board)) return false;
  state.active = false;
  state.finished = true;
  state.endedAt = performance.now();
  if (state.timer !== null) window.clearInterval(state.timer);
  state.timer = null;
  setFeedback("No more sets. Game complete!", "correct");
  updateStats(state.endedAt);
  renderBoard();
  return true;
}

function drawCards(count) {
  dealCards({ board: state.board, deck: state.deck }, count);
}

function startNewGame() {
  if (state.timer !== null) window.clearInterval(state.timer);
  state.active = true;
  state.finished = false;
  const table = createTable();
  state.deck = table.deck;
  state.board = table.board;
  state.selected.clear();
  state.wrongCards.clear();
  state.correct = 0;
  state.wrong = 0;
  state.solved = [];
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

function checkSelected() {
  const keys = state.selected;
  const cards = state.board.filter((card) => keys.has(cardKey(card)));
  if (!isSet(cards)) {
    wrongTriple(cards, "Not a set", cards.at(-1) ? cardKey(cards.at(-1)) : null);
    return;
  }

  const elapsedMs = performance.now() - state.startedAt;
  state.correct += 1;
  state.solved.push({ cards: [...cards], elapsedMs });
  claimSet(state, cards);
  state.selected.clear();
  state.wrongCards.clear();
  setFeedback("Set found!", "correct");
  updateStats();
  renderBoard({ focusKey: cards[0] ? cardKey(cards[0]) : null });
  renderHistory();
  finishIfDone();
}

function toggleCard(card) {
  if (!state.active) return;
  const key = cardKey(card);
  if (state.selected.has(key)) state.selected.delete(key);
  else if (state.selected.size < 3) state.selected.add(key);
  if (state.selected.size === 3) {
    checkSelected();
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
  if (!state.active || state.deck.length === 0) return;
  if (tableHasSet(state.board)) {
    flashAddThreePenalty();
    return;
  }
  drawCards(3);
  state.selected.clear();
  setFeedback("Three cards added. Find a set.");
  renderBoard();
  finishIfDone();
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
