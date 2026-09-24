import { DECK, cardKey, isSet, shuffle } from "./core.mjs";

export function createTable(rng = Math.random) {
  const deck = shuffle(DECK, rng);
  const board = deck.splice(deck.length - 12, 12);
  return { board, deck };
}

export function tableHasSet(board) {
  for (let first = 0; first < board.length - 2; first += 1) {
    for (let second = first + 1; second < board.length - 1; second += 1) {
      for (let third = second + 1; third < board.length; third += 1) {
        if (isSet([board[first], board[second], board[third]])) return true;
      }
    }
  }
  return false;
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
  table.board = table.board.filter((card) => !selected.has(cardKey(card)));
  if (boardSize === 12) dealCards(table, 3);
  return true;
}
