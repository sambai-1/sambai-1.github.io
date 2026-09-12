export const FEATURES = Object.freeze({
  shape: Object.freeze(["oval", "squiggle", "diamond"]),
  color: Object.freeze(["red", "purple", "green"]),
  number: Object.freeze([1, 2, 3]),
  shading: Object.freeze(["solid", "striped", "empty"]),
});

export const FEATURE_NAMES = Object.freeze(Object.keys(FEATURES));

export function cardKey(card) {
  return FEATURE_NAMES.map((feature) => card[feature]).join("|");
}

export function createDeck() {
  const deck = [];

  for (const shape of FEATURES.shape) {
    for (const color of FEATURES.color) {
      for (const number of FEATURES.number) {
        for (const shading of FEATURES.shading) {
          deck.push(Object.freeze({ shape, color, number, shading }));
        }
      }
    }
  }

  return deck;
}

export const DECK = Object.freeze(createDeck());

function remainingValue(feature, first, second) {
  if (first === second) return first;
  return FEATURES[feature].find((value) => value !== first && value !== second);
}

export function completeSet(first, second) {
  if (cardKey(first) === cardKey(second)) {
    throw new Error("A round requires two distinct prompt cards.");
  }

  return Object.freeze(
    Object.fromEntries(
      FEATURE_NAMES.map((feature) => [
        feature,
        remainingValue(feature, first[feature], second[feature]),
      ]),
    ),
  );
}

export function isSet(cards) {
  if (!Array.isArray(cards) || cards.length !== 3) return false;

  return FEATURE_NAMES.every((feature) => {
    const uniqueValues = new Set(cards.map((card) => card[feature])).size;
    return uniqueValues === 1 || uniqueValues === 3;
  });
}

function randomIndex(length, rng) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("The random-number source must return a value in [0, 1).");
  }
  return Math.floor(value * length);
}

export function shuffle(items, rng = Math.random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, rng);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function countDifferentFeatures(first, second) {
  return FEATURE_NAMES.filter((feature) => first[feature] !== second[feature]).length;
}

export function createPrompt(rng = Math.random, differentFeatureCount = null) {
  if (
    differentFeatureCount !== null
    && (![1, 2, 3, 4].includes(differentFeatureCount))
  ) {
    throw new Error("Different-feature count must be 1, 2, 3, 4, or null.");
  }

  const firstIndex = randomIndex(DECK.length, rng);
  const first = DECK[firstIndex];
  const resolvedFeatureCount =
    differentFeatureCount === null ? randomIndex(4, rng) + 1 : differentFeatureCount;
  const possibleSeconds = DECK.filter((card) => {
    const differences = countDifferentFeatures(first, card);
    return differences === resolvedFeatureCount;
  });
  const second = possibleSeconds[randomIndex(possibleSeconds.length, rng)];
  const answerKey = cardKey(completeSet(first, second));
  const answer = DECK.find((card) => cardKey(card) === answerKey);

  return Object.freeze({ prompts: Object.freeze([first, second]), answer });
}

export function createPhotoRound(
  candidateCount,
  rng = Math.random,
  differentFeatureCount = null,
) {
  if (![4, 6, 7, 9, 10, 12, 13, 15].includes(candidateCount)) {
    throw new Error("Unsupported candidate count.");
  }

  const prompt = createPrompt(rng, differentFeatureCount);
  const excluded = new Set([
    ...prompt.prompts.map(cardKey),
    cardKey(prompt.answer),
  ]);
  const distractors = shuffle(
    DECK.filter((card) => !excluded.has(cardKey(card))),
    rng,
  ).slice(0, candidateCount - 1);

  return Object.freeze({
    ...prompt,
    candidates: Object.freeze(shuffle([...distractors, prompt.answer], rng)),
  });
}
