import {
  FEATURES,
  FEATURE_NAMES,
  cardKey,
  createPhotoRound,
  shuffle,
} from "./core.mjs";
import {
  RUN_MODES,
  activeElapsed,
  buildShareText,
  completionReason,
  createRun,
  enterReview,
  finishRun,
  formatDuration,
  pauseRun,
  recordCorrect,
  recordWrong,
  resumeRun,
} from "./run-state.mjs";
import { loadPreferences, savePreferences } from "./preferences.mjs";

const SHARE_URL = "https://sambai-1.github.io/projects/sets/";
const SVG_NS = "http://www.w3.org/2000/svg";
const COLOR_PALETTES = Object.freeze({
  standard: Object.freeze({ red: "#ed2134", purple: "#64369b", green: "#00a957" }),
  colorblind: Object.freeze({ red: "#e69f00", purple: "#0072b2", green: "#cc79a7" }),
});
const COLOR_NAMES = Object.freeze({
  standard: Object.freeze({ red: "red", purple: "purple", green: "green" }),
  colorblind: Object.freeze({ red: "orange", purple: "blue", green: "pink" }),
});
const NUMBER_WORDS = Object.freeze({ 1: "one", 2: "two", 3: "three" });
const FEATURE_LABELS = Object.freeze({
  shape: "Shape",
  color: "Color",
  number: "Number",
  shading: "Shading",
});
const elements = {
  howToButton: document.querySelector("#howToButton"),
  howToDialog: document.querySelector("#howToDialog"),
  closeHowToButton: document.querySelector("#closeHowToButton"),
  doneHowToButton: document.querySelector("#doneHowToButton"),
  featureGuide: document.querySelector("#featureGuide"),
  exampleList: document.querySelector("#exampleList"),
  layoutModeControls: document.querySelector("#layoutModeControls"),
  runModeControls: document.querySelector("#runModeControls"),
  candidateSettings: document.querySelector("#candidateSettings"),
  candidateSettingsButton: document.querySelector("#candidateSettingsButton"),
  candidateSettingsCard: document.querySelector("#candidateSettingsCard"),
  candidateSlider: document.querySelector("#candidateSlider"),
  candidateSliderValue: document.querySelector("#candidateSliderValue"),
  differenceSettings: document.querySelector("#differenceSettings"),
  differenceSettingsButton: document.querySelector("#differenceSettingsButton"),
  differenceSettingsCard: document.querySelector("#differenceSettingsCard"),
  differenceSlider: document.querySelector("#differenceSlider"),
  differenceSliderValue: document.querySelector("#differenceSliderValue"),
  colorSettings: document.querySelector("#colorSettings"),
  colorSettingsButton: document.querySelector("#colorSettingsButton"),
  colorSettingsCard: document.querySelector("#colorSettingsCard"),
  colorBlindToggle: document.querySelector("#colorBlindToggle"),
  gameModeLabel: document.querySelector("#gameModeLabel"),
  correctStat: document.querySelector("#correctStat"),
  wrongStat: document.querySelector("#wrongStat"),
  timeLabel: document.querySelector("#timeLabel"),
  timeStat: document.querySelector("#timeStat"),
  feedback: document.querySelector("#feedback"),
  photoBoard: document.querySelector("#photoBoard"),
  reviewControls: document.querySelector("#reviewControls"),
  reshareButton: document.querySelector("#reshareButton"),
  newGameButton: document.querySelector("#newGameButton"),
  historyPanel: document.querySelector("#historyPanel"),
  historyCount: document.querySelector("#historyCount"),
  historyList: document.querySelector("#historyList"),
  resultDialog: document.querySelector("#resultDialog"),
  resultEyebrow: document.querySelector("#resultEyebrow"),
  resultTitle: document.querySelector("#resultTitle"),
  resultStats: document.querySelector("#resultStats"),
  sharePreview: document.querySelector("#sharePreview"),
  copyStatus: document.querySelector("#copyStatus"),
  shareButton: document.querySelector("#shareButton"),
  closeResultButton: document.querySelector("#closeResultButton"),
};

const savedPreferences = loadPreferences();

const state = {
  settings: {
    layoutMode: savedPreferences.layoutMode,
    runMode: savedPreferences.runMode,
    difficulty: savedPreferences.difficulty,
    complexity: savedPreferences.complexity,
  },
  run: null,
  round: null,
  embeddedEntries: [],
  finalSelection: null,
  colorBlind: savedPreferences.colorBlind,
  helpPausedRun: false,
  animationFrame: null,
};

let svgSequence = 0;
let wrongFlashSequence = 0;

function cardDescription(card) {
  const pluralShape = card.number === 1 ? card.shape : `${card.shape}s`;
  const paletteName = state.colorBlind ? "colorblind" : "standard";
  return `${NUMBER_WORDS[card.number]} ${card.shading} ${COLOR_NAMES[paletteName][card.color]} ${pluralShape}`;
}

function symbolMarkup(card, x, patternId) {
  const palette = state.colorBlind ? COLOR_PALETTES.colorblind : COLOR_PALETTES.standard;
  const color = palette[card.color];
  const fill =
    card.shading === "solid"
      ? color
      : card.shading === "striped"
        ? `url(#${patternId})`
        : "#fff";
  const common = `fill="${fill}" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"`;

  if (card.shape === "oval") {
    return `<rect x="${x - 13}" y="18" width="26" height="60" rx="13" ${common}/>`;
  }
  if (card.shape === "diamond") {
    return `<path d="M ${x} 17 L ${x + 15} 48 L ${x} 79 L ${x - 15} 48 Z" ${common}/>`;
  }
  return `<path d="M -7 22 C 0 20 7 23 9 29 C 12 36 10 43 7 49 C 5 55 12 62 11 65 C 10 69 4 71 -2 70 C -9 69 -11 64 -10 58 C -9 53 -7 49 -6 44 C -5 39 -8 35 -10 30 C -11 26 -10 23 -7 22 Z" transform="translate(${x} 48) scale(1.2) translate(0 -48)" ${common}/>`;
}

function createCardElement(card, { compact = false } = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = `set-card${compact ? " is-compact" : ""}`;
  wrapper.setAttribute("role", "img");
  wrapper.setAttribute("aria-label", cardDescription(card));

  const patternId = `stripe-${svgSequence += 1}`;
  const xPositions =
    card.number === 1 ? [75] : card.number === 2 ? [51, 99] : [31, 75, 119];
  wrapper.innerHTML = `
    <svg viewBox="0 0 150 96" aria-hidden="true" focusable="false" xmlns="${SVG_NS}">
      <defs>
        <pattern id="${patternId}" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#fff"></rect>
          <path d="M 0 1 H 6" stroke="${(state.colorBlind ? COLOR_PALETTES.colorblind : COLOR_PALETTES.standard)[card.color]}" stroke-width="1.5"></path>
        </pattern>
      </defs>
      ${xPositions.map((x) => symbolMarkup(card, x, patternId)).join("")}
    </svg>`;
  return wrapper;
}

function setFeedback(message = "", kind = "") {
  elements.feedback.textContent = message;
  elements.feedback.className = `feedback${kind ? ` is-${kind}` : ""}`;
}

function modeSummary() {
  return RUN_MODES[state.settings.runMode].label.toUpperCase();
}

function differenceLabel(value) {
  return value === null ? "Random" : String(value);
}

function updateSliderAppearance(slider) {
  const value = Number(slider.value);
  const min = Number(slider.min);
  const max = Number(slider.max);
  const progress = ((value - min) / (max - min)) * 100;
  slider.style.setProperty("--slider-progress", `${progress}%`);
}

function updateControls() {
  document.querySelectorAll("[data-layout-mode]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.layoutMode === state.settings.layoutMode),
    );
  });
  document.querySelectorAll("[data-run-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.runMode === state.settings.runMode));
  });
  elements.candidateSettingsButton.setAttribute(
    "aria-label",
    `Candidates: ${state.settings.difficulty}`,
  );
  elements.candidateSliderValue.textContent = state.settings.difficulty;
  elements.candidateSlider.value = state.settings.difficulty;
  const differences = differenceLabel(state.settings.complexity);
  elements.differenceSettingsButton.setAttribute("aria-label", `Differences: ${differences}`);
  elements.differenceSliderValue.textContent = differences;
  elements.differenceSlider.value = state.settings.complexity ?? 5;
  elements.colorBlindToggle.checked = state.colorBlind;
  updateSliderAppearance(elements.candidateSlider);
  updateSliderAppearance(elements.differenceSlider);
  elements.gameModeLabel.textContent = modeSummary();
}

function saveCurrentPreferences() {
  savePreferences({ ...state.settings, colorBlind: state.colorBlind });
}

function updateStats(now = performance.now()) {
  if (!state.run) return;
  elements.correctStat.textContent = state.run.correct;
  elements.wrongStat.textContent = state.run.wrong;

  const elapsed = activeElapsed(state.run, now);
  if (state.settings.runMode === "timed") {
    elements.timeLabel.textContent = "Left";
    elements.timeStat.textContent = formatDuration(Math.max(0, 30_000 - elapsed), 1);
  } else {
    elements.timeLabel.textContent = "Time";
    elements.timeStat.textContent = formatDuration(elapsed, 1);
  }
}

function makeBoardColumn(label, cards, { prompt = false, startIndex = 0 } = {}) {
  const column = document.createElement("section");
  column.className = `board-column${prompt ? " prompt-column" : " answers-column"}`;
  const heading = document.createElement("h3");
  heading.textContent = label;
  column.append(heading);

  const cardList = document.createElement("div");
  cardList.className = "column-cards";

  cards.forEach((card, index) => {
    if (prompt) {
      cardList.append(createCardElement(card));
      return;
    }

    cardList.append(createCandidateButton(card, startIndex + index + 1));
  });

  column.append(cardList);
  return column;
}

function createCandidateButton(card, optionNumber) {
  const button = document.createElement("button");
  button.className = "candidate-button";
  button.type = "button";
  button.dataset.cardKey = cardKey(card);
  button.setAttribute("aria-label", `Option ${optionNumber}: ${cardDescription(card)}`);
  button.disabled = state.run.status !== "playing";

  if (state.finalSelection?.key === cardKey(card)) {
    button.classList.add(`is-${state.finalSelection.outcome}`);
  }

  button.append(createCardElement(card));
  button.addEventListener("click", () => handlePhotoChoice(card, button));
  return button;
}

function makeEmbeddedColumn(label, entries) {
  const column = document.createElement("section");
  column.className = "board-column answers-column embedded-column";
  const heading = document.createElement("h3");
  heading.textContent = label;
  column.append(heading);

  const cardList = document.createElement("div");
  cardList.className = "column-cards";

  entries.forEach((entry) => {
    if (!entry.isGiven) {
      cardList.append(createCandidateButton(entry.card, entry.optionNumber));
      return;
    }

    const given = document.createElement("div");
    given.className = "embedded-given";
    const card = createCardElement(entry.card);
    card.setAttribute("aria-label", `Given card: ${cardDescription(entry.card)}`);
    given.append(card);
    cardList.append(given);
  });

  column.append(cardList);
  return column;
}

function renderInlineBoard(layout) {
  const mobileGivenHeading = document.createElement("h3");
  mobileGivenHeading.className = "mobile-board-heading";
  mobileGivenHeading.textContent = "Given";

  const mobileChoicesHeading = document.createElement("h3");
  mobileChoicesHeading.className = "mobile-board-heading";
  mobileChoicesHeading.textContent = "Choices";

  layout.append(
    mobileGivenHeading,
    makeBoardColumn("Given 1", [state.round.prompts[0]], { prompt: true }),
    makeBoardColumn("Given 2", [state.round.prompts[1]], { prompt: true }),
    mobileChoicesHeading,
  );

  for (let index = 0; index < state.round.candidates.length; index += 3) {
    const end = Math.min(index + 3, state.round.candidates.length);
    layout.append(
      makeBoardColumn(
        `Choices ${index + 1}–${end}`,
        state.round.candidates.slice(index, end),
        { startIndex: index },
      ),
    );
  }
}

function renderEmbeddedBoard(layout) {
  const mobileCardsHeading = document.createElement("h3");
  mobileCardsHeading.className = "mobile-board-heading";
  mobileCardsHeading.textContent = "Cards";
  layout.append(mobileCardsHeading);

  for (let index = 0; index < state.embeddedEntries.length; index += 3) {
    const end = Math.min(index + 3, state.embeddedEntries.length);
    layout.append(
      makeEmbeddedColumn(
        `Cards ${index + 1}–${end}`,
        state.embeddedEntries.slice(index, end),
      ),
    );
  }
}

function renderPhotoBoard() {
  elements.photoBoard.replaceChildren();
  const layout = document.createElement("div");
  layout.className = `photo-layout is-${state.settings.layoutMode}`;

  if (state.settings.layoutMode === "embedded") {
    renderEmbeddedBoard(layout);
  } else {
    renderInlineBoard(layout);
  }

  elements.photoBoard.append(layout);
}

function displayFeatureValue(feature, value) {
  if (feature === "number") return NUMBER_WORDS[value];
  if (feature === "color") {
    return COLOR_NAMES[state.colorBlind ? "colorblind" : "standard"][value];
  }
  return String(value);
}

function renderBoard() {
  renderPhotoBoard();
  elements.reviewControls.hidden = state.run.status !== "review";
}

function renderHistory() {
  const solved = state.run.solved;
  elements.historyPanel.hidden = solved.length === 0;
  elements.historyCount.textContent = `${solved.length} solved`;
  elements.historyList.replaceChildren();

  solved.forEach((solution, index) => {
    const item = document.createElement("article");
    item.className = "history-item";
    const meta = document.createElement("div");
    meta.className = "history-meta";
    const number = document.createElement("strong");
    number.textContent = `Set ${index + 1}`;
    const time = document.createElement("span");
    time.textContent = formatDuration(solution.elapsedMs);
    meta.append(number, time);

    const cards = document.createElement("div");
    cards.className = "history-cards";
    solution.cards.forEach((card) => cards.append(createCardElement(card, { compact: true })));
    item.append(meta, cards);
    elements.historyList.append(item);
  });
}

function createNextRound() {
  const candidateCount = state.settings.layoutMode === "embedded"
    ? state.settings.difficulty - 2
    : state.settings.difficulty;
  state.round = createPhotoRound(
    candidateCount,
    Math.random,
    state.settings.complexity,
  );
  state.embeddedEntries = shuffle([
    ...state.round.prompts.map((card) => ({ card, isGiven: true })),
    ...state.round.candidates.map((card, index) => ({
      card,
      isGiven: false,
      optionNumber: index + 1,
    })),
  ]);
  state.finalSelection = null;
}

function actionCanProceed() {
  if (state.run.status !== "playing") return false;
  const reason = completionReason(state.run, performance.now());
  if (reason) {
    endRun(reason);
    return false;
  }
  return true;
}

function handleCorrect(cards, now) {
  recordCorrect(state.run, cards, now);
  updateStats(now);
  renderHistory();
  const reason = completionReason(state.run, now);
  if (reason) {
    endRun(reason);
    return;
  }

  createNextRound();
  renderBoard();
  setFeedback("Correct", "correct");
}

function handlePhotoChoice(card, button) {
  if (!actionCanProceed()) return;
  const now = performance.now();
  const isCorrect = cardKey(card) === cardKey(state.round.answer);

  if (isCorrect) {
    state.finalSelection = { key: cardKey(card), outcome: "correct" };
    button.classList.add("is-correct");
    handleCorrect([...state.round.prompts, state.round.answer], now);
    return;
  }

  recordWrong(state.run);
  updateStats(now);
  button.classList.remove("is-wrong");
  void button.offsetWidth;
  button.classList.add("is-wrong");
  const flashSequence = String(wrongFlashSequence += 1);
  button.dataset.wrongFlash = flashSequence;
  window.setTimeout(() => {
    if (button.dataset.wrongFlash === flashSequence) button.classList.remove("is-wrong");
  }, 450);
  setFeedback("Not a set", "wrong");

  const reason = completionReason(state.run, now);
  if (reason) endRun(reason);
}

function resultTitle(reason) {
  if (reason === "time") return "Time’s up";
  if (reason === "score") return "Ten sets complete";
  return "Game over";
}

function addResultStat(label, value) {
  const stat = document.createElement("div");
  stat.className = "result-stat";
  const labelElement = document.createElement("span");
  labelElement.textContent = label;
  const valueElement = document.createElement("strong");
  valueElement.textContent = value;
  stat.append(labelElement, valueElement);
  elements.resultStats.append(stat);
}

function populateResultDialog() {
  const differences = state.settings.complexity === null
    ? "RANDOM DIFFERENCES"
    : `${state.settings.complexity} ${state.settings.complexity === 1 ? "DIFFERENCE" : "DIFFERENCES"}`;
  const difficulty = ` · ${differences} · ${state.settings.difficulty} CANDIDATES`;
  elements.resultEyebrow.textContent = `${modeSummary()}${difficulty}`;
  elements.resultTitle.textContent = resultTitle(state.run.finishReason);
  elements.resultStats.replaceChildren();
  addResultStat("Correct", state.run.correct);
  addResultStat("Wrong", state.run.wrong);
  addResultStat("Time", formatDuration(state.run.finishedElapsedMs));
  elements.sharePreview.textContent = buildShareText(state.run, SHARE_URL);
  elements.copyStatus.textContent = "";
  elements.shareButton.textContent = "Share";
}

function endRun(reason) {
  const now = performance.now();
  if (!finishRun(state.run, now, reason)) return;
  if (state.animationFrame !== null) cancelAnimationFrame(state.animationFrame);
  state.animationFrame = null;
  updateStats(now);
  renderBoard();
  renderHistory();
  populateResultDialog();
  elements.resultDialog.showModal();
}

function timerTick(now) {
  if (!state.run || state.run.status === "result" || state.run.status === "review") {
    state.animationFrame = null;
    return;
  }

  if (state.run.status === "playing") {
    const reason = completionReason(state.run, now);
    if (reason) {
      endRun(reason);
      return;
    }
    updateStats(now);
  }
  state.animationFrame = requestAnimationFrame(timerTick);
}

function startTimer() {
  if (state.animationFrame !== null) cancelAnimationFrame(state.animationFrame);
  state.animationFrame = requestAnimationFrame(timerTick);
}

function startNewRun() {
  if (elements.resultDialog.open) elements.resultDialog.close();
  state.run = createRun(state.settings, performance.now());
  state.helpPausedRun = false;
  createNextRound();
  setFeedback();
  updateControls();
  updateStats();
  renderBoard();
  renderHistory();
  startTimer();
}

function openHowTo() {
  closeColorSettings();
  closeCandidateSettings();
  closeDifferenceSettings();
  state.helpPausedRun = pauseRun(state.run, performance.now());
  updateStats();
  elements.howToDialog.showModal();
}

function closeHowTo() {
  elements.howToDialog.close();
}

function closeColorSettings({ restoreFocus = false } = {}) {
  if (elements.colorSettingsCard.hidden) return;
  elements.colorSettingsCard.hidden = true;
  elements.colorSettingsButton.setAttribute("aria-expanded", "false");
  if (restoreFocus) elements.colorSettingsButton.focus();
}

function toggleColorSettings() {
  const shouldOpen = elements.colorSettingsCard.hidden;
  if (shouldOpen) {
    closeCandidateSettings();
    closeDifferenceSettings();
  }
  elements.colorSettingsCard.hidden = !shouldOpen;
  elements.colorSettingsButton.setAttribute("aria-expanded", String(shouldOpen));
}

function closeCandidateSettings({ restoreFocus = false } = {}) {
  if (elements.candidateSettingsCard.hidden) return;
  elements.candidateSettingsCard.hidden = true;
  elements.candidateSettingsButton.setAttribute("aria-expanded", "false");
  if (restoreFocus) elements.candidateSettingsButton.focus();
}

function toggleCandidateSettings() {
  const shouldOpen = elements.candidateSettingsCard.hidden;
  if (shouldOpen) {
    closeColorSettings();
    closeDifferenceSettings();
  }
  elements.candidateSettingsCard.hidden = !shouldOpen;
  elements.candidateSettingsButton.setAttribute("aria-expanded", String(shouldOpen));
}

function closeDifferenceSettings({ restoreFocus = false } = {}) {
  if (elements.differenceSettingsCard.hidden) return;
  elements.differenceSettingsCard.hidden = true;
  elements.differenceSettingsButton.setAttribute("aria-expanded", "false");
  if (restoreFocus) elements.differenceSettingsButton.focus();
}

function toggleDifferenceSettings() {
  const shouldOpen = elements.differenceSettingsCard.hidden;
  if (shouldOpen) {
    closeColorSettings();
    closeCandidateSettings();
  }
  elements.differenceSettingsCard.hidden = !shouldOpen;
  elements.differenceSettingsButton.setAttribute("aria-expanded", String(shouldOpen));
}

function closeResults() {
  if (state.run.status === "result") enterReview(state.run);
  if (state.run.status !== "review") return;
  elements.resultDialog.close();
  renderBoard();
  updateStats();
}

function reopenResults() {
  if (state.run.status !== "review") return;
  elements.resultDialog.showModal();
}

async function copyResults() {
  const text = elements.sharePreview.textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard copy failed");
  }

  elements.shareButton.textContent = "Copied!";
  elements.copyStatus.textContent = "Copied";
  window.setTimeout(() => {
    elements.shareButton.textContent = "Share";
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
      sample.append(createCardElement(sampleBuilders[feature](value), { compact: true }));
      const label = document.createElement("span");
      label.textContent = displayFeatureValue(feature, value);
      sample.append(label);
      values.append(sample);
    }
    block.append(heading, values);
    elements.featureGuide.append(block);
  }

  const examples = [
    {
      cards: [
        { shape: "oval", color: "red", number: 2, shading: "solid" },
        { shape: "oval", color: "red", number: 2, shading: "striped" },
        { shape: "oval", color: "red", number: 2, shading: "empty" },
      ],
      description: "Same shape, color, and number — different shading",
    },
    {
      cards: [
        { shape: "oval", color: "red", number: 1, shading: "solid" },
        { shape: "squiggle", color: "purple", number: 2, shading: "solid" },
        { shape: "diamond", color: "green", number: 3, shading: "solid" },
      ],
      description: "Different shapes, colors, and numbers — same shading",
    },
    {
      cards: [
        { shape: "oval", color: "red", number: 1, shading: "empty" },
        { shape: "squiggle", color: "purple", number: 2, shading: "striped" },
        { shape: "diamond", color: "green", number: 3, shading: "solid" },
      ],
      description: "All four features are different",
    },
  ];

  for (const example of examples) {
    const row = document.createElement("div");
    row.className = "example-set";
    const cards = document.createElement("div");
    cards.className = "example-cards";
    example.cards.forEach((card) => cards.append(createCardElement(card, { compact: true })));
    const description = document.createElement("p");
    description.textContent = example.description;
    row.append(cards, description);
    elements.exampleList.append(row);
  }
}

elements.layoutModeControls.addEventListener("click", (event) => {
  const button = event.target.closest("[data-layout-mode]");
  if (!button || button.dataset.layoutMode === state.settings.layoutMode) return;
  state.settings.layoutMode = button.dataset.layoutMode;
  saveCurrentPreferences();
  startNewRun();
});

elements.runModeControls.addEventListener("click", (event) => {
  const button = event.target.closest("[data-run-mode]");
  if (!button || button.dataset.runMode === state.settings.runMode) return;
  state.settings.runMode = button.dataset.runMode;
  saveCurrentPreferences();
  startNewRun();
});

elements.candidateSettingsButton.addEventListener("click", toggleCandidateSettings);
elements.candidateSlider.addEventListener("input", () => {
  updateSliderAppearance(elements.candidateSlider);
  elements.candidateSliderValue.textContent = elements.candidateSlider.value;
});
elements.candidateSlider.addEventListener("change", () => {
  const difficulty = Number(elements.candidateSlider.value);
  if (difficulty === state.settings.difficulty) return;
  state.settings.difficulty = difficulty;
  saveCurrentPreferences();
  startNewRun();
});

elements.differenceSettingsButton.addEventListener("click", toggleDifferenceSettings);
elements.differenceSlider.addEventListener("input", () => {
  updateSliderAppearance(elements.differenceSlider);
  elements.differenceSliderValue.textContent = differenceLabel(
    Number(elements.differenceSlider.value) === 5
      ? null
      : Number(elements.differenceSlider.value),
  );
});
elements.differenceSlider.addEventListener("change", () => {
  const sliderValue = Number(elements.differenceSlider.value);
  const complexity = sliderValue === 5 ? null : sliderValue;
  if (complexity === state.settings.complexity) return;
  state.settings.complexity = complexity;
  saveCurrentPreferences();
  startNewRun();
});

elements.colorBlindToggle.addEventListener("change", () => {
  state.colorBlind = elements.colorBlindToggle.checked;
  saveCurrentPreferences();
  renderBoard();
  renderHistory();
  buildInstructions();
});

elements.colorSettingsButton.addEventListener("click", toggleColorSettings);
document.addEventListener("click", (event) => {
  if (!elements.colorSettings.contains(event.target)) closeColorSettings();
  if (!elements.candidateSettings.contains(event.target)) closeCandidateSettings();
  if (!elements.differenceSettings.contains(event.target)) closeDifferenceSettings();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.colorSettingsCard.hidden) {
    event.preventDefault();
    closeColorSettings({ restoreFocus: true });
  } else if (event.key === "Escape" && !elements.candidateSettingsCard.hidden) {
    event.preventDefault();
    closeCandidateSettings({ restoreFocus: true });
  } else if (event.key === "Escape" && !elements.differenceSettingsCard.hidden) {
    event.preventDefault();
    closeDifferenceSettings({ restoreFocus: true });
  }
});

elements.howToButton.addEventListener("click", openHowTo);
elements.closeHowToButton.addEventListener("click", closeHowTo);
elements.doneHowToButton.addEventListener("click", closeHowTo);
elements.howToDialog.addEventListener("close", () => {
  if (state.helpPausedRun) {
    resumeRun(state.run, performance.now());
    state.helpPausedRun = false;
    updateStats();
  }
});

elements.resultDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeResults();
});
elements.shareButton.addEventListener("click", () => {
  copyResults().catch(() => {
    elements.copyStatus.textContent = "Copy failed. Select the text above.";
  });
});
elements.closeResultButton.addEventListener("click", closeResults);
elements.reshareButton.addEventListener("click", reopenResults);
elements.newGameButton.addEventListener("click", startNewRun);

buildInstructions();
startNewRun();
