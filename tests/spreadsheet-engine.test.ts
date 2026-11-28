/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ChapterEntry, FrameMapEntry, ScratchpadCells } from '../src/types/video';
import {
  clearRange,
  colIndexToLabel,
  computeSheetRowSearchRange,
  convertSheetToEntries,
  createEmptyGrid,
  deleteColsInRange,
  deleteRowsInRange,
  entriesToSheetData,
  insertColAt,
  insertRowAt,
  MAX_SHEET_COLS,
  MAX_SHEET_ROWS,
  parseClipboardMatrix,
  pasteMatrixAt,
  serializeRangeToTsv,
  setCellValue,
  sortRowsByTimestamp,
} from '../src/utils/spreadsheetEngine';

function makeVfrFrames(): FrameMapEntry[] {
  // Simulate irregular VFR timestamps
  return [
    { frameIndex: 0, timeSec: 0, durationSec: 0.035 },
    { frameIndex: 1, timeSec: 0.035, durationSec: 0.036 },
    { frameIndex: 2, timeSec: 0.071, durationSec: 0.033 },
    { frameIndex: 300, timeSec: 10.42, durationSec: 0.033 },
    { frameIndex: 900, timeSec: 30.18, durationSec: 0.033 },
    { frameIndex: 3600, timeSec: 120.0, durationSec: 0.033 },
  ];
}

describe('Spreadsheet coordinates, resizing, and DoS limits', () => {
  it('converts column indices to Excel A..AZ labels', () => {
    assert.equal(colIndexToLabel(0), 'A');
    assert.equal(colIndexToLabel(2), 'C');
    assert.equal(colIndexToLabel(25), 'Z');
    assert.equal(colIndexToLabel(26), 'AA');
    assert.equal(colIndexToLabel(51), 'AZ');
  });

  it('clamps massive clipboard pastes to safe MAX_SHEET_ROWS x MAX_SHEET_COLS bounds', () => {
    const grid = createEmptyGrid(10, 4);
    const hugeMatrix = Array.from({ length: MAX_SHEET_ROWS + 250 }, (_, r) =>
      Array.from({ length: MAX_SHEET_COLS + 20 }, (_, c) => `R${r}C${c}`)
    );

    const res = pasteMatrixAt(
      grid,
      { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } },
      hugeMatrix
    );
    assert.equal(res.grid.length, MAX_SHEET_ROWS);
    assert.equal(res.grid[0].length, MAX_SHEET_COLS);
    assert.equal(res.grid[MAX_SHEET_ROWS - 1][MAX_SHEET_COLS - 1], `R${MAX_SHEET_ROWS - 1}C${MAX_SHEET_COLS - 1}`);
  });
});

describe('Clipboard TSV / CSV matrix parsing & serialization', () => {
  it('round-trips TSV with tabs, quotes, and multi-line cells', () => {
    let grid = createEmptyGrid(5, 4);
    grid = setCellValue(grid, 0, 0, '00:00');
    grid = setCellValue(grid, 0, 1, 'Intro "Alpha"');
    grid = setCellValue(grid, 1, 0, '01:30');
    grid = setCellValue(grid, 1, 1, 'Line 1\nLine 2');

    const tsv = serializeRangeToTsv(grid, {
      anchor: { row: 0, col: 0 },
      focus: { row: 1, col: 1 },
    });
    const parsed = parseClipboardMatrix(tsv);
    assert.deepEqual(parsed, [
      ['00:00', 'Intro "Alpha"'],
      ['01:30', 'Line 1\nLine 2'],
    ]);
  });

  it('parses structured CSV paste and fills multi-cell selection on single-cell paste', () => {
    const csv = '00:00,"Opening, Part 1"\n02:15,"Main Topic"\n';
    const parsed = parseClipboardMatrix(csv);
    assert.deepEqual(parsed, [
      ['00:00', 'Opening, Part 1'],
      ['02:15', 'Main Topic'],
    ]);

    const grid = createEmptyGrid(4, 4);
    const filled = pasteMatrixAt(
      grid,
      { anchor: { row: 0, col: 1 }, focus: { row: 2, col: 2 } },
      [['TBD']]
    );
    assert.equal(filled.grid[0][1], 'TBD');
    assert.equal(filled.grid[2][2], 'TBD');
    assert.equal(filled.grid[0][0], '');
  });
});

describe('Row/column operations, sorting, and spreadsheet range zoom', () => {
  it('inserts/deletes rows and columns and sorts by timestamp keeping untimed rows below', () => {
    let grid = createEmptyGrid(5, 4);
    grid = setCellValue(grid, 0, 0, '05:00');
    grid = setCellValue(grid, 0, 1, 'Late');
    grid = setCellValue(grid, 0, 2, 'Memo Late');
    grid = setCellValue(grid, 1, 1, 'Untimed Draft');
    grid = setCellValue(grid, 2, 0, '01:00');
    grid = setCellValue(grid, 2, 1, 'Early');

    const sorted = sortRowsByTimestamp(grid);
    assert.equal(sorted[0][0], '01:00');
    assert.equal(sorted[0][1], 'Early');
    assert.equal(sorted[1][0], '05:00');
    assert.equal(sorted[1][2], 'Memo Late');
    assert.equal(sorted[2][0], '');
    assert.equal(sorted[2][1], 'Untimed Draft');

    const withRow = insertRowAt(sorted, 1);
    assert.equal(withRow[1][0], '');
    assert.equal(withRow[2][0], '05:00');

    const deletedRow = deleteRowsInRange(withRow, 1, 1);
    assert.equal(deletedRow[1][0], '05:00');

    const withCol = insertColAt(deletedRow, 2);
    assert.equal(withCol[1][2], '');
    assert.equal(withCol[1][3], 'Memo Late');

    const deletedCol = deleteColsInRange(withCol, 2, 2);
    assert.equal(deletedCol[1][2], 'Memo Late');

    const cleared = clearRange(deletedCol, {
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 1 },
    });
    assert.equal(cleared[0][0], '');
    assert.equal(cleared[0][1], '');
  });

  it('computes narrowed search range directly from spreadsheet rows', () => {
    let grid = createEmptyGrid(6, 4);
    grid = setCellValue(grid, 0, 0, '01:00');
    grid = setCellValue(grid, 0, 1, 'A');
    grid = setCellValue(grid, 1, 1, 'B');
    grid = setCellValue(grid, 2, 1, 'C');
    grid = setCellValue(grid, 3, 0, '04:00');
    grid = setCellValue(grid, 3, 1, 'D');

    const range = computeSheetRowSearchRange(grid, 1, 600);
    assert.ok(range);
    assert.equal(range.startSec, 60);
    assert.equal(range.endSec, 240);
    assert.equal(range.isNarrowed, true);
  });
});

describe('Loose save conversion, VFR precision preservation, and C+ scratchpad retention', () => {
  it('preserves exact VFR frame precision on untouched timestamps and keeps C+ memos', () => {
    const frames = makeVfrFrames();
    const initialEntries: ChapterEntry[] = [
      { id: 'mk_a', timeSec: 10.42, frameIndex: 300, title: 'Part A' },
      { id: 'ch_b', timeSec: null, frameIndex: null, title: 'Part B (untimed)' },
      { id: 'mk_c', timeSec: 30.18, frameIndex: 900, title: 'Part C' },
    ];
    const initialScratch: ScratchpadCells = {
      0: { 2: 'Check audio level' },
    };

    const { grid, originMeta } = entriesToSheetData(initialEntries, initialScratch, 120);
    assert.equal(grid[0][0], '00:10');
    assert.equal(grid[0][2], 'Check audio level');
    assert.equal(grid[1][0], '');
    assert.equal(grid[1][1], 'Part B (untimed)');

    // Edit only Part B's title and add an unparsed time row + out-of-range row + marker-only row
    let edited = setCellValue(grid, 1, 1, 'Part B Revised');
    edited = setCellValue(edited, 3, 0, '02:00'); // marker-only
    edited = setCellValue(edited, 4, 0, 'not-a-time');
    edited = setCellValue(edited, 4, 1, 'Draft Note');
    edited = setCellValue(edited, 5, 0, '99:00'); // clamped to 120s
    edited = setCellValue(edited, 5, 1, 'Beyond End');

    const result = convertSheetToEntries(edited, originMeta, frames, 120);

    // Row 0 kept exact VFR timeSec=10.42 & frameIndex=300 without losing sub-second precision!
    assert.equal(result.entries[0].timeSec, 10.42);
    assert.equal(result.entries[0].frameIndex, 300);
    assert.equal(result.entries[0].id, 'mk_a');

    // Row 1 stayed untimed in exact position 1
    assert.equal(result.entries[1].timeSec, null);
    assert.equal(result.entries[1].title, 'Part B Revised');

    // Row 3 is marker-only
    assert.equal(result.entries[3].timeSec, 120);
    assert.equal(result.entries[3].title, '');

    // Row 4 (unparsed time) was preserved loosely as untimed title with a gentle notice
    assert.equal(result.entries[4].timeSec, null);
    assert.equal(result.entries[4].title, 'Draft Note');

    // Row 5 was clamped to duration 120s (and flagged as clamped + duplicate of row 3's 120s)
    assert.equal(result.entries[5].timeSec, 120);

    // Scratchpad cell C1 retained
    assert.equal(result.scratchpad[0][2], 'Check audio level');

    // Verify gentle notices generated for all 4 conditions
    const kinds = new Set(result.notices.map((n) => n.kind));
    assert.ok(kinds.has('unparsed-time'));
    assert.ok(kinds.has('clamped-time'));
    assert.ok(kinds.has('duplicate-time'));
    assert.ok(kinds.has('scratchpad-retained'));

    assert.equal(result.summary.timedCount, 3);
    assert.equal(result.summary.markerOnlyCount, 1);
    assert.equal(result.summary.untimedCount, 2);
    assert.equal(result.summary.scratchpadCellCount, 1);
  });
});
