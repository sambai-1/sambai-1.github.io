# Sets board and history update plan

1. Keep the board at three rows and give it space for six equal card columns. Fill cards down each column so a new 12-card game occupies the first four columns, leaving two columns of empty space. A successful Add 3 fills the next column.
2. Derive the board's column count from its visible card count. Reserve six columns for up to 18 cards; if a seventh column is needed, fit all columns in the same available width by making the cards narrower. Continue to handle later Add 3 actions without horizontal clipping, while preserving three rows and card order.
3. Keep the existing set detection, deck, scoring, Add 3 penalties, and timer behavior. Make the responsive layout follow the same three-row, column-first board rule where practical, with cards remaining legible and clickable.
4. In Solved Sets, show the elapsed time between consecutive solved sets. The first solved set uses the time from New Game; each later set uses its solve time minus the previous solve time. Keep the main Time stat as total elapsed time.
5. Verify the initial 12-card arrangement, 15/18/21-card widths, responsive overflow, and per-set time differences. Run existing gameplay tests and focused checks for any new pure time-calculation logic.

## Card replacement and motion refinement

6. On a 12-card board, deal replacements into the three selected slots. Every unselected card stays in its current row and column.
7. When a board has more than four populated columns, remove a solved set by keeping every surviving card in the columns that remain at its current position. Move only surviving cards from the final column into selected slots in those columns. For example, on a 3-by-5 board with two selected cards in the first four columns and one in the fifth, move the other two fifth-column cards into those two empty slots.
8. After a valid set is clicked, hold the three selected cards with a green highlight for 500 ms before they disappear. During this pause, ignore additional card actions; New Game cancels the pending claim.
9. After the selected cards fade out, move surviving cards from the departing final column directly to the open slots along straight, linear paths over about 500 ms. Cards already in retained slots stay still. Keep Add 3 and replacement entrances, preserve keyboard focus, and honor reduced-motion preferences.
