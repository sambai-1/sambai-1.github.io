import { DECK, cardKey, isSet, shuffle } from "./core.mjs";

export function boardColumnCount(cardCount) {
  return Math.max(6, Math.ceil(Math.max(0, cardCount) / 3));
}

export function createTable(rng = Math.random) {
  const deck = shuffle(DECK, rng);
  const board = deck.splice(deck.length - 12, 12);
  return { board, deck };
}

export function findVisibleSet(board) {
  for (let first = 0; first < board.length - 2; first += 1) {
    for (let second = first + 1; second < board.length - 1; second += 1) {
      for (let third = second + 1; third < board.length; third += 1) {
        const cards = [board[first], board[second], board[third]];
        if (isSet(cards)) return cards;
      }
    }
  }
  return null;
}

export function tableHasSet(board) {
  return findVisibleSet(board) !== null;
}

export function dealCards(table, count = 3) {
  let dealt = 0;
  while (dealt < count && table.deck.length > 0) {
    table.board.push(table.deck.pop());
    dealt += 1;
  }
  return dealt;
}

export function claimSet(table, cards) {
  if (!isSet(cards)) return false;
  const selected = new Set(cards.map(cardKey));
  if (selected.size !== 3 || !cards.every((card) => table.board.some((visible) => cardKey(visible) === cardKey(card)))) {
    return false;
  }
  const boardSize = table.board.length;
  if (boardSize === 12 && table.deck.length > 0) {
    // Replace selected cards in place so the cards that remain visible keep
    // their positions on the standard 3-by-4 board.
    table.board = table.board
      .map((card) => {
        if (!selected.has(cardKey(card))) return card;
        return table.deck.pop() ?? null;
      })
      .filter((card) => card !== null);
  } else if (boardSize > 12) {
    const retainedLength = boardSize - 3;
    const retained = table.board.slice(0, retainedLength);
    const holes = [];
    for (let index = 0; index < retained.length; index += 1) {
      if (selected.has(cardKey(retained[index]))) {
        holes.push(index);
        retained[index] = null;
      }
    }

    const departingColumnSurvivors = table.board
      .slice(retainedLength)
      .filter((card) => !selected.has(cardKey(card)));
    holes.forEach((index, survivorIndex) => {
      retained[index] = departingColumnSurvivors[survivorIndex];
    });
    table.board = retained.filter((card) => card !== null);
  } else {
    table.board = table.board.filter((card) => !selected.has(cardKey(card)));
  }
  return true;
}
