/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ChapterEntry,
  FocusedSearchRange,
  FrameMapEntry,
  ScratchpadCells,
} from '../types/video';
import {
  createId,
  findFrameIndexByTime,
  formatTimecodeByStyle,
  parseDelimitedRow,
  parseTimestampCell,
} from './timecode';
import { computeSearchRangeForRow } from './chapterSequence';

export const MIN_SHEET_ROWS = 30;
export const MIN_SHEET_COLS = 8;
export const MAX_SHEET_ROWS = 2000;
export const MAX_SHEET_COLS = 52; // A..AZ
export const MAX_UNDO_HISTORY = 100;

export interface CellCoord {
  row: number;
  col: number;
}

export interface CellSelection {
  anchor: CellCoord;
  focus: CellCoord;
}

export interface NormalizedRange {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

/**
 * Remembers original VFR frame precision for rows loaded from ChapterEntry[]
 * so unchanged timestamp strings never drift due to whole-second display formatting.
 */
export interface SheetOriginTimeMeta {
  formattedTime: string;
  timeSec: number;
  frameIndex: number;
  entryId: string;
}

export type SheetSaveNoticeKind =
  | 'unparsed-time'
  | 'clamped-time'
  | 'duplicate-time'
  | 'scratchpad-retained';

export interface SheetSaveNotice {
  kind: SheetSaveNoticeKind;
  row?: number;
  col?: number;
  cellAddress?: string;
  rawValue?: string;
  count?: number;
}

export interface SheetSaveSummary {
  timedCount: number;
  markerOnlyCount: number;
  untimedCount: number;
  scratchpadCellCount: number;
}

export interface SheetConversionResult {
  entries: ChapterEntry[];
  scratchpad: ScratchpadCells;
  notices: SheetSaveNotice[];
  summary: SheetSaveSummary;
}

/**
 * Converts a 0-based column index to Excel column lettering (0 -> A, 25 -> Z, 26 -> AA, 51 -> AZ).
 */
export function colIndexToLabel(col: number): string {
  let n = Math.max(0, Math.floor(col));
  let label = '';
  while (true) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
    if (n < 0) break;
  }
  return label;
}

export function formatCellAddress(row: number, col: number): string {
  return `${colIndexToLabel(col)}${row + 1}`;
}

export function normalizeSelection(sel: CellSelection): NormalizedRange {
  return {
    minRow: Math.min(sel.anchor.row, sel.focus.row),
    maxRow: Math.max(sel.anchor.row, sel.focus.row),
    minCol: Math.min(sel.anchor.col, sel.focus.col),
    maxCol: Math.max(sel.anchor.col, sel.focus.col),
  };
}

export function createEmptyGrid(rows: number, cols: number): string[][] {
  const safeRows = Math.max(1, Math.min(MAX_SHEET_ROWS, rows));
  const safeCols = Math.max(2, Math.min(MAX_SHEET_COLS, cols));
  return Array.from({ length: safeRows }, () => Array<string>(safeCols).fill(''));
}

export function cloneGrid(grid: string[][]): string[][] {
  return grid.map((row) => [...row]);
}

export function ensureGridSize(
  grid: string[][],
  minRows: number,
  minCols: number
): string[][] {
  const targetRows = Math.min(MAX_SHEET_ROWS, Math.max(grid.length, minRows));
  const currentCols = grid[0]?.length ?? MIN_SHEET_COLS;
  const targetCols = Math.min(MAX_SHEET_COLS, Math.max(currentCols, minCols));

  if (targetRows === grid.length && targetCols === currentCols) {
    return grid;
  }

  const next: string[][] = [];
  for (let r = 0; r < targetRows; r++) {
    const existingRow = grid[r];
    if (existingRow) {
      if (existingRow.length === targetCols) {
        next.push([...existingRow]);
      } else {
        const padded = existingRow.slice(0, targetCols);
        while (padded.length < targetCols) padded.push('');
        next.push(padded);
      }
    } else {
      next.push(Array<string>(targetCols).fill(''));
    }
  }
  return next;
}

/**
 * Converts the unified ChapterEntry[] list plus session scratchpad cells (columns C+)
 * into a 2D editable spreadsheet matrix and precision lookup table.
 */
export function entriesToSheetData(
  entries: ChapterEntry[],
  scratchpad: ScratchpadCells,
  durationSec: number
): { grid: string[][]; originMeta: SheetOriginTimeMeta[] } {
  const maxTimedSec = entries.reduce(
    (acc, e) => (e.timeSec !== null ? Math.max(acc, e.timeSec) : acc),
    0
  );
  const useHours = durationSec >= 3600 || maxTimedSec >= 3600;

  let maxScratchRow = -1;
  let maxScratchCol = 1;
  for (const [rKey, colMap] of Object.entries(scratchpad)) {
    const r = Number(rKey);
    if (!Number.isInteger(r) || r < 0) continue;
    for (const [cKey, val] of Object.entries(colMap)) {
      const c = Number(cKey);
      if (Number.isInteger(c) && c >= 2 && val.length > 0) {
        if (r > maxScratchRow) maxScratchRow = r;
        if (c > maxScratchCol) maxScratchCol = c;
      }
    }
  }

  const contentRows = Math.max(entries.length, maxScratchRow + 1);
  const rowCount = Math.min(MAX_SHEET_ROWS, Math.max(MIN_SHEET_ROWS, contentRows + 15));
  const colCount = Math.min(MAX_SHEET_COLS, Math.max(MIN_SHEET_COLS, maxScratchCol + 4));

  const grid = createEmptyGrid(rowCount, colCount);
  const originMeta: SheetOriginTimeMeta[] = [];

  for (let i = 0; i < entries.length && i < rowCount; i++) {
    const entry = entries[i];
    if (entry.timeSec !== null && entry.frameIndex !== null) {
      const formatted = formatTimecodeByStyle(entry.timeSec, 'auto', useHours);
      grid[i][0] = formatted;
      originMeta.push({
        formattedTime: formatted,
        timeSec: entry.timeSec,
        frameIndex: entry.frameIndex,
        entryId: entry.id,
      });
    } else {
      grid[i][0] = '';
    }
    grid[i][1] = entry.title;
  }

  for (const [rKey, colMap] of Object.entries(scratchpad)) {
    const r = Number(rKey);
    if (!Number.isInteger(r) || r < 0 || r >= rowCount) continue;
    for (const [cKey, val] of Object.entries(colMap)) {
      const c = Number(cKey);
      if (Number.isInteger(c) && c >= 2 && c < colCount) {
        grid[r][c] = val;
      }
    }
  }

  return { grid, originMeta };
}

export function setCellValue(
  grid: string[][],
  row: number,
  col: number,
  value: string
): string[][] {
  if (row < 0 || col < 0 || row >= MAX_SHEET_ROWS || col >= MAX_SHEET_COLS) {
    return grid;
  }
  const sized = ensureGridSize(grid, row + 1, col + 1);
  if (sized[row][col] === value) return grid;
  const next = sized === grid ? cloneGrid(grid) : sized;
  next[row][col] = value;
  return next;
}

export function clearRange(grid: string[][], selection: CellSelection): string[][] {
  const { minRow, maxRow, minCol, maxCol } = normalizeSelection(selection);
  let changed = false;
  for (let r = minRow; r <= maxRow && r < grid.length; r++) {
    for (let c = minCol; c <= maxCol && c < grid[r].length; c++) {
      if (grid[r][c] !== '') {
        changed = true;
        break;
      }
    }
    if (changed) break;
  }
  if (!changed) return grid;

  const next = cloneGrid(grid);
  for (let r = minRow; r <= maxRow && r < next.length; r++) {
    for (let c = minCol; c <= maxCol && c < next[r].length; c++) {
      next[r][c] = '';
    }
  }
  return next;
}

/**
 * Serializes the selected range to Excel/Google Sheets compatible TSV.
 */
export function serializeRangeToTsv(grid: string[][], selection: CellSelection): string {
  const { minRow, maxRow, minCol, maxCol } = normalizeSelection(selection);
  const lines: string[] = [];
  for (let r = minRow; r <= maxRow && r < grid.length; r++) {
    const cells: string[] = [];
    for (let c = minCol; c <= maxCol; c++) {
      const raw = grid[r]?.[c] ?? '';
      if (raw.includes('\t') || raw.includes('\n') || raw.includes('\r') || raw.includes('"')) {
        cells.push(`"${raw.replace(/"/g, '""')}"`);
      } else {
        cells.push(raw);
      }
    }
    lines.push(cells.join('\t'));
  }
  return lines.join('\n');
}

/**
 * Linear-time O(N) clipboard text parser supporting:
 * - Multi-cell TSV (Excel / Google Sheets copy-paste, including RFC 4180 quoted cells)
 * - Multi-cell CSV when no tabs are present and every non-empty row parses cleanly as multi-column CSV
 * - Plain multi-line single-column text
 */
export function parseClipboardMatrix(rawText: string): string[][] {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Strip single trailing newline produced by Excel/Sheets copy without dropping intentional blank lines
  const trimmedEnd = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  if (trimmedEnd.length === 0) return [];

  // 1. If text contains tabs, parse as RFC 4180 TSV supporting quoted multiline cells
  if (trimmedEnd.includes('\t')) {
    return parseDelimitedMatrix(trimmedEnd, '\t');
  }

  // 2. Split into lines and test whether it looks like structured CSV
  const rawLines = trimmedEnd.split('\n');
  const nonEmptyLines = rawLines.filter((l) => l.trim().length > 0);
  if (nonEmptyLines.length > 0 && nonEmptyLines.every((l) => l.includes(','))) {
    const csvRows: string[][] = [];
    let allValid = true;
    for (const line of rawLines) {
      if (line.trim().length === 0) {
        csvRows.push(['']);
        continue;
      }
      const parsed = parseDelimitedRow(line, ',');
      if (!parsed || parsed.length < 2) {
        allValid = false;
        break;
      }
      csvRows.push(parsed);
    }
    if (allValid && csvRows.length > 0) {
      return csvRows;
    }
  }

  // 3. Fallback: single-column lines
  return rawLines.map((line) => [line]);
}

function parseDelimitedMatrix(text: string, delimiter: '\t' | ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          cell += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        cell += ch;
        i++;
      }
    } else {
      if (ch === '"' && cell.length === 0) {
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        row.push(cell);
        cell = '';
        i++;
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i++;
      } else {
        cell += ch;
        i++;
      }
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

/**
 * Pastes a 2D matrix into the grid starting at the top-left of `selection`.
 * - If a 1x1 matrix is pasted onto a multi-cell selection, fills the entire selection (Excel behavior).
 * - Otherwise pastes starting at (minRow, minCol) and auto-expands the grid up to MAX_SHEET_ROWS x MAX_SHEET_COLS.
 */
export function pasteMatrixAt(
  grid: string[][],
  selection: CellSelection,
  matrix: string[][]
): { grid: string[][]; selection: CellSelection } {
  if (matrix.length === 0) return { grid, selection };

  const norm = normalizeSelection(selection);
  const isSingleValue = matrix.length === 1 && matrix[0].length === 1;
  const isMultiCellTarget = norm.maxRow > norm.minRow || norm.maxCol > norm.minCol;

  if (isSingleValue && isMultiCellTarget) {
    const val = matrix[0][0];
    const next = cloneGrid(grid);
    for (let r = norm.minRow; r <= norm.maxRow && r < next.length; r++) {
      for (let c = norm.minCol; c <= norm.maxCol && c < next[r].length; c++) {
        next[r][c] = val;
      }
    }
    return { grid: next, selection };
  }

  const maxMatrixCols = matrix.reduce((acc, r) => Math.max(acc, r.length), 1);
  const neededRows = Math.min(MAX_SHEET_ROWS, norm.minRow + matrix.length);
  const neededCols = Math.min(MAX_SHEET_COLS, norm.minCol + maxMatrixCols);
  const expanded = ensureGridSize(grid, neededRows, neededCols);
  const next = expanded === grid ? cloneGrid(grid) : expanded;

  let endRow = norm.minRow;
  let endCol = norm.minCol;

  for (let dr = 0; dr < matrix.length; dr++) {
    const targetR = norm.minRow + dr;
    if (targetR >= MAX_SHEET_ROWS) break;
    endRow = targetR;
    const srcRow = matrix[dr];
    for (let dc = 0; dc < srcRow.length; dc++) {
      const targetC = norm.minCol + dc;
      if (targetC >= MAX_SHEET_COLS) break;
      if (targetC > endCol) endCol = targetC;
      next[targetR][targetC] = srcRow[dc];
    }
  }

  return {
    grid: next,
    selection: {
      anchor: { row: norm.minRow, col: norm.minCol },
      focus: { row: endRow, col: endCol },
    },
  };
}

export function insertRowAt(grid: string[][], rowIndex: number): string[][] {
  if (grid.length >= MAX_SHEET_ROWS) return grid;
  const cols = grid[0]?.length ?? MIN_SHEET_COLS;
  const idx = Math.max(0, Math.min(grid.length, rowIndex));
  const next = cloneGrid(grid);
  next.splice(idx, 0, Array<string>(cols).fill(''));
  return next;
}

export function deleteRowsInRange(
  grid: string[][],
  startRow: number,
  endRow: number
): string[][] {
  const minR = Math.max(0, Math.min(startRow, endRow));
  const maxR = Math.min(grid.length - 1, Math.max(startRow, endRow));
  if (minR > maxR) return grid;

  const cols = grid[0]?.length ?? MIN_SHEET_COLS;
  const remaining = grid.filter((_, r) => r < minR || r > maxR).map((r) => [...r]);
  while (remaining.length < MIN_SHEET_ROWS) {
    remaining.push(Array<string>(cols).fill(''));
  }
  return remaining;
}

export function insertColAt(grid: string[][], colIndex: number): string[][] {
  const cols = grid[0]?.length ?? MIN_SHEET_COLS;
  if (cols >= MAX_SHEET_COLS) return grid;
  const idx = Math.max(0, Math.min(cols, colIndex));
  return grid.map((row) => {
    const copy = [...row];
    copy.splice(idx, 0, '');
    return copy;
  });
}

export function deleteColsInRange(
  grid: string[][],
  startCol: number,
  endCol: number
): string[][] {
  const cols = grid[0]?.length ?? MIN_SHEET_COLS;
  const minC = Math.max(0, Math.min(startCol, endCol));
  const maxC = Math.min(cols - 1, Math.max(startCol, endCol));
  if (minC > maxC) return grid;

  return grid.map((row) => {
    const filtered = row.filter((_, c) => c < minC || c > maxC);
    while (filtered.length < MIN_SHEET_COLS) {
      filtered.push('');
    }
    return filtered;
  });
}

/**
 * Sorts rows chronologically by Column A timestamp while keeping each row's full data (B, C, D...) intact.
 * Untimed rows (empty or non-timestamp A) with content stay below timed rows in their original relative order;
 * completely blank rows stay at the bottom.
 */
export function sortRowsByTimestamp(grid: string[][]): string[][] {
  const indexed = grid.map((row, idx) => {
    const hasAnyContent = row.some((cell) => cell.trim().length > 0);
    const parsedTime = parseTimestampCell(row[0] ?? '');
    return { row: [...row], idx, hasAnyContent, parsedTime };
  });

  indexed.sort((a, b) => {
    if (!a.hasAnyContent && !b.hasAnyContent) return a.idx - b.idx;
    if (!a.hasAnyContent) return 1;
    if (!b.hasAnyContent) return -1;

    if (a.parsedTime !== null && b.parsedTime !== null) {
      return a.parsedTime - b.parsedTime || a.idx - b.idx;
    }
    if (a.parsedTime !== null) return -1;
    if (b.parsedTime !== null) return 1;
    return a.idx - b.idx;
  });

  return indexed.map((item) => item.row);
}

/**
 * Computes the narrowed search range for the currently focused spreadsheet row
 * when Column A is empty (untimed) and Column B has a title (or user is locating that row).
 */
export function computeSheetRowSearchRange(
  grid: string[][],
  rowIndex: number,
  durationSec: number
): FocusedSearchRange | null {
  if (rowIndex < 0 || rowIndex >= grid.length) return null;
  const row = grid[rowIndex];
  const rawA = (row[0] ?? '').trim();
  const rawB = (row[1] ?? '').trim();
  if (rawA.length > 0 || rawB.length === 0) return null;

  const mapped = grid.map((r, idx) => ({
    key: `sheet-row-${idx}`,
    timeSec: parseTimestampCell(r[0] ?? ''),
    title: (r[1] ?? '').trim(),
  }));

  return computeSearchRangeForRow(mapped, rowIndex, durationSec);
}

/**
 * Loose / forgiving converter from the 2D spreadsheet grid back to ChapterEntry[] + ScratchpadCells.
 * Mirrors the flexible philosophy of Text Import:
 * - Preserves exact row order of timed chapters, marker-only rows, and untimed title rows.
 * - Preserves original VFR frame accuracy when a row's formatted timestamp string was not changed.
 * - Retains all non-empty C+ column cells in `scratchpad` for restoration within the session.
 * - Produces gentle, non-blocking notices for unparseable A-column values, clamped times,
 *   duplicate timestamps, and retained scratchpad cells.
 */
export function convertSheetToEntries(
  grid: string[][],
  originMeta: SheetOriginTimeMeta[],
  frames: FrameMapEntry[],
  durationSec: number
): SheetConversionResult {
  const entries: ChapterEntry[] = [];
  const scratchpad: ScratchpadCells = {};
  const notices: SheetSaveNotice[] = [];

  // Pool of unused origin metadata keyed by formatted timestamp string (FIFO for exact precision)
  const originPool = new Map<string, SheetOriginTimeMeta[]>();
  for (const meta of originMeta) {
    const bucket = originPool.get(meta.formattedTime) ?? [];
    bucket.push(meta);
    originPool.set(meta.formattedTime, bucket);
  }

  let timedCount = 0;
  let markerOnlyCount = 0;
  let untimedCount = 0;
  let scratchpadCellCount = 0;

  const seenSnappedFrames = new Set<number>();

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    const rawA = (row[0] ?? '').trim();
    const rawB = (row[1] ?? '').trim();

    // Collect columns C+ (colIndex >= 2)
    let rowHasScratch = false;
    const rowScratch: Record<number, string> = {};
    for (let c = 2; c < row.length; c++) {
      const val = row[c] ?? '';
      if (val.trim().length > 0) {
        rowScratch[c] = val;
        rowHasScratch = true;
        scratchpadCellCount++;
      }
    }
    if (rowHasScratch) {
      scratchpad[r] = rowScratch;
    }

    if (rawA.length === 0 && rawB.length === 0) {
      continue;
    }

    if (rawA.length === 0 && rawB.length > 0) {
      // Untimed title row — preserved in exact order!
      entries.push({
        id: createId('ch'),
        timeSec: null,
        frameIndex: null,
        title: rawB,
      });
      untimedCount++;
      continue;
    }

    // Column A is non-empty -> try parsing as timestamp cell
    const parsedSec = parseTimestampCell(rawA);
    if (parsedSec === null) {
      // Loose handling: never silently drop user's text!
      notices.push({
        kind: 'unparsed-time',
        row: r,
        col: 0,
        cellAddress: formatCellAddress(r, 0),
        rawValue: rawA,
      });
      const fallbackTitle = rawB.length > 0 ? rawB : rawA;
      entries.push({
        id: createId('ch'),
        timeSec: null,
        frameIndex: null,
        title: fallbackTitle,
      });
      untimedCount++;
      continue;
    }

    // Check if this exact formatted timestamp matches an untouched original row
    let finalTimeSec = parsedSec;
    let finalFrameIdx = 0;
    let finalId = createId('mk');
    let usedOrigin = false;

    const originBucket = originPool.get(rawA);
    if (originBucket && originBucket.length > 0) {
      const matched = originBucket.shift()!;
      finalTimeSec = matched.timeSec;
      finalFrameIdx = matched.frameIndex;
      finalId = matched.entryId;
      usedOrigin = true;
    }

    if (!usedOrigin) {
      let clampedSec = Math.max(0, parsedSec);
      if (durationSec > 0 && clampedSec > durationSec + 0.5) {
        notices.push({
          kind: 'clamped-time',
          row: r,
          col: 0,
          cellAddress: formatCellAddress(r, 0),
          rawValue: rawA,
        });
        clampedSec = durationSec;
      } else if (durationSec > 0 && clampedSec > durationSec) {
        clampedSec = durationSec;
      }

      const snappedIdx =
        frames.length > 0
          ? findFrameIndexByTime(frames, clampedSec)
          : Math.round(clampedSec * 30);
      const frameEntry = frames[snappedIdx];
      finalFrameIdx = frameEntry ? frameEntry.frameIndex : snappedIdx;
      finalTimeSec = frameEntry ? frameEntry.timeSec : clampedSec;
    }

    if (seenSnappedFrames.has(finalFrameIdx)) {
      notices.push({
        kind: 'duplicate-time',
        row: r,
        col: 0,
        cellAddress: formatCellAddress(r, 0),
        rawValue: rawA,
      });
    } else {
      seenSnappedFrames.add(finalFrameIdx);
    }

    entries.push({
      id: finalId,
      timeSec: finalTimeSec,
      frameIndex: finalFrameIdx,
      title: rawB,
    });
    if (rawB.length > 0) {
      timedCount++;
    } else {
      markerOnlyCount++;
    }
  }

  if (scratchpadCellCount > 0) {
    notices.push({
      kind: 'scratchpad-retained',
      count: scratchpadCellCount,
    });
  }

  return {
    entries,
    scratchpad,
    notices,
    summary: {
      timedCount,
      markerOnlyCount,
      untimedCount,
      scratchpadCellCount,
    },
  };
}
