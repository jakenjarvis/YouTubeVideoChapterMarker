import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Undo2,
  Redo2,
  ArrowUpDown,
  Sun,
  Moon,
  Repeat,
  MapPin,
  Check,
  X,
  Plus,
  Trash2,
  AlertTriangle,
  Crosshair,
  Table2,
  Columns,
  Rows,
  MoreHorizontal,
} from 'lucide-react';
import type {
  ChapterEntry,
  FocusedSearchRange,
  FrameMapEntry,
  ScratchpadCells,
  SheetFontSize,
  SheetTheme,
  SpreadsheetSyncMode,
} from '../types/video';
import {
  formatTimecodeByStyle,
  formatTimecodeHMS,
  parseTimestampCell,
} from '../utils/timecode';
import {
  clearRange,
  cloneGrid,
  colIndexToLabel,
  computeSheetRowSearchRange,
  convertSheetToEntries,
  deleteColsInRange,
  deleteRowsInRange,
  ensureGridSize,
  entriesToSheetData,
  formatCellAddress,
  insertColAt,
  insertRowAt,
  MAX_SHEET_COLS,
  MAX_SHEET_ROWS,
  MAX_UNDO_HISTORY,
  normalizeSelection,
  parseClipboardMatrix,
  pasteMatrixAt,
  serializeRangeToTsv,
  setCellValue,
  sortRowsByTimestamp,
  type CellSelection,
  type SheetConversionResult,
  type SheetOriginTimeMeta,
} from '../utils/spreadsheetEngine';
import { useI18n } from '../i18n';

interface ChapterSpreadsheetPanelProps {
  entries: ChapterEntry[];
  scratchpad: ScratchpadCells;
  frames: FrameMapEntry[];
  durationSec: number;
  getCurrentTimeSec: () => number;
  onSeekToTime: (timeSec: number) => void;
  onPreviewAtTime: (timeSec: number, previewDurationSec?: number) => void;
  onSearchRangeChange: (range: FocusedSearchRange | null) => void;
  onSave: (
    nextEntries: ChapterEntry[],
    nextScratchpad: ScratchpadCells,
    summary: SheetConversionResult['summary']
  ) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  cancelRequestToken?: number;
}

const STORAGE_THEME_KEY = 'vcm_sheet_theme';
const STORAGE_FONT_SIZE_KEY = 'vcm_sheet_font_size';
const STORAGE_SYNC_MODE_KEY = 'vcm_sheet_sync_mode';

function readStoredTheme(): SheetTheme {
  try {
    const v = window.localStorage.getItem(STORAGE_THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // ignore storage errors
  }
  return 'dark';
}

function readStoredFontSize(): SheetFontSize {
  try {
    const v = window.localStorage.getItem(STORAGE_FONT_SIZE_KEY);
    if (v === 'sm' || v === 'md' || v === 'lg' || v === 'xl') return v;
  } catch {
    // ignore storage errors
  }
  return 'md';
}

function readStoredSyncMode(): SpreadsheetSyncMode {
  try {
    const v = window.localStorage.getItem(STORAGE_SYNC_MODE_KEY);
    if (v === 'off' || v === 'seek' || v === 'preview10s') return v;
  } catch {
    // ignore storage errors
  }
  return 'seek';
}

const FONT_CONFIG: Record<
  SheetFontSize,
  { textClass: string; rowHeight: number; label: string }
> = {
  sm: { textClass: 'text-[13px]', rowHeight: 34, label: 'S' },
  md: { textClass: 'text-[15px]', rowHeight: 38, label: 'M' },
  lg: { textClass: 'text-[17px]', rowHeight: 44, label: 'L' },
  xl: { textClass: 'text-[20px]', rowHeight: 50, label: 'XL' },
};

const DEFAULT_COL_WIDTHS: Record<number, number> = {
  0: 128,
  1: 300,
};
const DEFAULT_EXTRA_COL_WIDTH = 156;
const ROW_NUM_WIDTH = 46;

const CURSOR_IDLE_SYNC_MS = 350;
const KEY_RELEASE_SYNC_MS = 300;
const DRAG_RELEASE_SYNC_MS = 220;
const NAV_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Tab',
  'Enter',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

interface SheetPalette {
  shellBg: string;
  headerBg: string;
  toolbarBg: string;
  formulaBg: string;
  btn: string;
  btnActive: string;
  mutedText: string;
  gridBg: string;
  colHeaderBg: string;
  colHeaderA: string;
  colHeaderB: string;
  colHeaderActive: string;
  rowNumBg: string;
  rowNumActive: string;
  cellBorder: string;
  cellBg: string;
  cellScratchBg: string;
  cellSelectedBg: string;
  focusRing: string;
  editorBg: string;
  footerBg: string;
}

const LIGHT_PALETTE: SheetPalette = {
  shellBg: 'bg-white text-slate-900',
  headerBg: 'bg-slate-50 border-slate-200',
  toolbarBg: 'bg-slate-50/90 border-slate-200',
  formulaBg: 'bg-white border-slate-200',
  btn: 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300',
  btnActive: 'bg-sky-100 text-sky-900 border-sky-400',
  mutedText: 'text-slate-500',
  gridBg: 'bg-white',
  colHeaderBg: 'bg-slate-100 text-slate-700 border-slate-300',
  colHeaderA: 'bg-amber-50 text-amber-900 border-slate-300',
  colHeaderB: 'bg-sky-50 text-sky-900 border-slate-300',
  colHeaderActive: 'bg-[#CDE7FB] text-sky-950 border-slate-300',
  rowNumBg: 'bg-slate-100 text-slate-500 border-slate-300',
  rowNumActive: 'bg-sky-100 text-sky-900 font-semibold border-slate-300',
  cellBorder: 'border-slate-200',
  cellBg: 'bg-white text-slate-900',
  cellScratchBg: 'bg-slate-50/60 text-slate-700',
  cellSelectedBg: 'bg-sky-500/15',
  focusRing: 'ring-2 ring-inset ring-sky-600',
  editorBg: 'bg-white text-slate-900 ring-2 ring-sky-600',
  footerBg: 'bg-slate-50 border-slate-200 text-slate-600',
};

const DARK_PALETTE: SheetPalette = {
  shellBg: 'bg-[#0F1217] text-[#F3F5F8]',
  headerBg: 'bg-[#12161D] border-[#222731]',
  toolbarBg: 'bg-[#141820] border-[#222731]',
  formulaBg: 'bg-[#0F1217] border-[#222731]',
  btn: 'bg-[#1A1F29] hover:bg-[#232A37] text-[#CBD5E1] border-[#2C3444]',
  btnActive: 'bg-sky-500/20 text-sky-200 border-sky-400/60',
  mutedText: 'text-[#8B97A9]',
  gridBg: 'bg-[#0D0F12]',
  colHeaderBg: 'bg-[#151921] text-[#94A0B2] border-[#252B37]',
  colHeaderA: 'bg-[#231F17] text-amber-200 border-[#252B37]',
  colHeaderB: 'bg-[#13202E] text-sky-200 border-[#252B37]',
  colHeaderActive: 'bg-[#123047] text-sky-100 border-[#252B37]',
  rowNumBg: 'bg-[#141820] text-[#7D899B] border-[#252B37]',
  rowNumActive: 'bg-[#13293D] text-sky-200 font-semibold border-[#252B37]',
  cellBorder: 'border-[#222731]',
  cellBg: 'bg-[#101319] text-[#F3F5F8]',
  cellScratchBg: 'bg-[#0D1015] text-[#B8C2D1]',
  cellSelectedBg: 'bg-sky-500/20',
  focusRing: 'ring-2 ring-inset ring-sky-400',
  editorBg: 'bg-[#0B0E13] text-[#F8FAFC] ring-2 ring-sky-400',
  footerBg: 'bg-[#12161D] border-[#222731] text-[#8B97A9]',
};

interface SpreadsheetRowProps {
  rowIndex: number;
  rowData: readonly string[];
  colWidthList: readonly number[];
  totalTableWidth: number;
  rowHeight: number;
  textClass: string;
  palette: SheetPalette;
  isLight: boolean;
  isRowSelected: boolean;
  activeColInRow: number;
  selMinCol: number;
  selMaxCol: number;
  cutMinCol: number;
  cutMaxCol: number;
  hasUnparsedTime: boolean;
  unparsedTooltip: string;
  rowMenuTooltip: string;
  onRowHeaderClick: (row: number, shiftKey: boolean, rect: DOMRect) => void;
  onRowHeaderContextMenu: (row: number, clientX: number, clientY: number) => void;
  onCellMouseDown: (row: number, col: number, shiftKey: boolean) => void;
  onCellMouseEnter: (row: number, col: number) => void;
  onCellDoubleClick: (row: number, col: number) => void;
}

const SpreadsheetRow = React.memo<SpreadsheetRowProps>(
  ({
    rowIndex,
    rowData,
    colWidthList,
    totalTableWidth,
    rowHeight,
    textClass,
    palette,
    isLight,
    isRowSelected,
    activeColInRow,
    selMinCol,
    selMaxCol,
    cutMinCol,
    cutMaxCol,
    hasUnparsedTime,
    unparsedTooltip,
    rowMenuTooltip,
    onRowHeaderClick,
    onRowHeaderContextMenu,
    onCellMouseDown,
    onCellMouseEnter,
    onCellDoubleClick,
  }) => {
    return (
      <div
        className="flex"
        style={{ height: `${rowHeight}px`, width: `${totalTableWidth}px`, contain: 'layout style' }}
      >
        <button
          type="button"
          style={{ width: `${ROW_NUM_WIDTH}px` }}
          title={rowMenuTooltip}
          onClick={(e) =>
            onRowHeaderClick(rowIndex, e.shiftKey, e.currentTarget.getBoundingClientRect())
          }
          onContextMenu={(e) => {
            e.preventDefault();
            onRowHeaderContextMenu(rowIndex, e.clientX, e.clientY);
          }}
          className={`sticky left-0 z-10 shrink-0 border-r border-b flex items-center justify-center font-mono-tabular text-xs cursor-pointer transition-colors ${
            isRowSelected
              ? palette.rowNumActive
              : `${palette.rowNumBg} ${isLight ? 'hover:bg-slate-200' : 'hover:bg-[#1E2532]'}`
          }`}
        >
          {rowIndex + 1}
        </button>

        {rowData.map((cellVal, c) => {
          const isActive = c === activeColInRow;
          const isInSel = selMinCol >= 0 && c >= selMinCol && c <= selMaxCol;
          const isInCut = cutMinCol >= 0 && c >= cutMinCol && c <= cutMaxCol;
          const showUnparsed = c === 0 && hasUnparsedTime;

          return (
            <div
              key={c}
              style={{ width: `${colWidthList[c] ?? DEFAULT_EXTRA_COL_WIDTH}px` }}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                onCellMouseDown(rowIndex, c, e.shiftKey);
              }}
              onMouseEnter={() => onCellMouseEnter(rowIndex, c)}
              onDoubleClick={() => onCellDoubleClick(rowIndex, c)}
              title={showUnparsed ? unparsedTooltip : undefined}
              className={`relative shrink-0 border-r border-b px-2.5 flex items-center overflow-hidden cursor-cell ${
                palette.cellBorder
              } ${textClass} ${c === 0 ? 'font-mono-tabular' : ''} ${
                isInSel
                  ? palette.cellSelectedBg
                  : c >= 2
                    ? palette.cellScratchBg
                    : palette.cellBg
              } ${isActive ? palette.focusRing : ''} ${
                isInCut ? 'outline-1 outline-dashed outline-amber-400 -outline-offset-2' : ''
              }`}
            >
              <span
                dir={c === 0 ? 'ltr' : 'auto'}
                className={`w-full truncate ${
                  showUnparsed ? (isLight ? 'text-amber-700' : 'text-amber-300') : ''
                }`}
              >
                {cellVal}
              </span>
              {showUnparsed && (
                <AlertTriangle
                  className="w-3.5 h-3.5 text-amber-400 shrink-0 ms-1"
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }
);

interface EditingCellState {
  row: number;
  col: number;
  value: string;
  originalValue: string;
}

interface RowMenuState {
  row: number;
  minRow: number;
  maxRow: number;
  x: number;
  y: number;
}

const ChapterSpreadsheetPanelInner: React.FC<ChapterSpreadsheetPanelProps> = ({
  entries,
  scratchpad,
  frames,
  durationSec,
  getCurrentTimeSec,
  onSeekToTime,
  onPreviewAtTime,
  onSearchRangeChange,
  onSave,
  onCancel,
  onDirtyChange,
  cancelRequestToken = 0,
}) => {
  const { t } = useI18n();

  const initialData = useMemo(
    () => entriesToSheetData(entries, scratchpad, durationSec),
    // Initialize once when panel mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const originMetaRef = useRef<SheetOriginTimeMeta[]>(initialData.originMeta);
  const [grid, setGrid] = useState<string[][]>(() => initialData.grid);
  const [selection, setSelection] = useState<CellSelection>({
    anchor: { row: 0, col: 0 },
    focus: { row: 0, col: 0 },
  });
  const [editing, setEditing] = useState<EditingCellState | null>(null);
  const [cutRange, setCutRange] = useState<CellSelection | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const [undoStack, setUndoStack] = useState<string[][][]>([]);
  const [redoStack, setRedoStack] = useState<string[][][]>([]);

  const [theme, setTheme] = useState<SheetTheme>(readStoredTheme);
  const [fontSize, setFontSize] = useState<SheetFontSize>(readStoredFontSize);
  const [syncMode, setSyncMode] = useState<SpreadsheetSyncMode>(readStoredSyncMode);

  const [colWidths, setColWidths] = useState<Record<number, number>>(() => ({
    ...DEFAULT_COL_WIDTHS,
  }));

  const [pendingReview, setPendingReview] = useState<SheetConversionResult | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [rowMenu, setRowMenu] = useState<RowMenuState | null>(null);

  const isSelectingDragRef = useRef(false);
  const heldNavKeysRef = useRef<Set<string>>(new Set());
  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const formulaInputRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const rowMenuElRef = useRef<HTMLDivElement | null>(null);
  const rowMenuRef = useRef<RowMenuState | null>(null);
  rowMenuRef.current = rowMenu;
  const composingRef = useRef(false);
  const lastCompositionEndMsRef = useRef(0);
  const lastSyncedRowRef = useRef<number>(0);
  const lastEmittedRangeKeyRef = useRef<string>('null');
  const syncTimerRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const resizingColRef = useRef<{ col: number; startX: number; startWidth: number } | null>(null);

  const isLight = theme === 'light';
  const fontCfg = FONT_CONFIG[fontSize];
  const rowCount = grid.length;
  const colCount = grid[0]?.length ?? 8;
  const activeRow = selection.focus.row;
  const activeCol = selection.focus.col;
  const activeValue =
    editing && editing.row === activeRow && editing.col === activeCol
      ? editing.value
      : (grid[activeRow]?.[activeCol] ?? '');

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const getColWidth = useCallback(
    (col: number) => colWidths[col] ?? DEFAULT_EXTRA_COL_WIDTH,
    [colWidths]
  );

  // Persist user preferences
  const handleSetTheme = (next: SheetTheme) => {
    setTheme(next);
    try {
      window.localStorage.setItem(STORAGE_THEME_KEY, next);
    } catch {
      // ignore
    }
  };

  const handleSetFontSize = (next: SheetFontSize) => {
    setFontSize(next);
    try {
      window.localStorage.setItem(STORAGE_FONT_SIZE_KEY, next);
    } catch {
      // ignore
    }
  };

  const handleSetSyncMode = (next: SpreadsheetSyncMode) => {
    setSyncMode(next);
    try {
      window.localStorage.setItem(STORAGE_SYNC_MODE_KEY, next);
    } catch {
      // ignore
    }
  };

  const pushHistoryAndSetGrid = useCallback(
    (nextGrid: string[][]) => {
      setGrid((prev) => {
        if (prev === nextGrid) return prev;
        setUndoStack((hist) => {
          const updated = [...hist, cloneGrid(prev)];
          return updated.length > MAX_UNDO_HISTORY
            ? updated.slice(updated.length - MAX_UNDO_HISTORY)
            : updated;
        });
        setRedoStack([]);
        setIsDirty(true);
        setPendingReview(null);
        return nextGrid;
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    setUndoStack((hist) => {
      if (hist.length === 0) return hist;
      const previous = hist[hist.length - 1];
      setGrid((current) => {
        setRedoStack((r) => [...r, cloneGrid(current)].slice(-MAX_UNDO_HISTORY));
        return previous;
      });
      setEditing(null);
      setIsDirty(true);
      setPendingReview(null);
      return hist.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((hist) => {
      if (hist.length === 0) return hist;
      const next = hist[hist.length - 1];
      setGrid((current) => {
        setUndoStack((u) => [...u, cloneGrid(current)].slice(-MAX_UNDO_HISTORY));
        return next;
      });
      setEditing(null);
      setIsDirty(true);
      setPendingReview(null);
      return hist.slice(0, -1);
    });
  }, []);

  const focusCaptureInput = useCallback(() => {
    if (document.activeElement === captureInputRef.current) return;
    window.requestAnimationFrame(() => {
      captureInputRef.current?.focus({ preventScroll: true });
    });
  }, []);

  // Commit any in-progress inline cell edit
  const commitInlineEdit = useCallback(
    (overrideValue?: string) => {
      if (!editing) return;
      const val = overrideValue !== undefined ? overrideValue : editing.value;
      const { row, col, originalValue } = editing;
      setEditing(null);
      if (val !== originalValue) {
        pushHistoryAndSetGrid(setCellValue(grid, row, col, val));
      }
    },
    [editing, grid, pushHistoryAndSetGrid]
  );

  const cancelInlineEdit = useCallback(() => {
    setEditing(null);
    focusCaptureInput();
  }, [focusCaptureInput]);

  // Coalesce scroll-into-view into a single rAF so continuous key repeat causes ZERO layout thrashing
  const scrollCellIntoView = useCallback(
    (row: number, col: number) => {
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        const container = scrollContainerRef.current;
        if (!container) return;
        const headerHeight = 36;
        const cellTop = headerHeight + row * fontCfg.rowHeight;
        const cellBottom = cellTop + fontCfg.rowHeight;
        if (cellTop < container.scrollTop + headerHeight) {
          container.scrollTop = Math.max(0, cellTop - headerHeight);
        } else if (cellBottom > container.scrollTop + container.clientHeight) {
          container.scrollTop = cellBottom - container.clientHeight + 8;
        }

        let cellLeft = ROW_NUM_WIDTH;
        for (let c = 0; c < col; c++) cellLeft += getColWidth(c);
        const cellRight = cellLeft + getColWidth(col);
        if (cellLeft < container.scrollLeft + ROW_NUM_WIDTH) {
          container.scrollLeft = Math.max(0, cellLeft - ROW_NUM_WIDTH);
        } else if (cellRight > container.scrollLeft + container.clientWidth) {
          container.scrollLeft = cellRight - container.clientWidth + 12;
        }
      });
    },
    [fontCfg.rowHeight, getColWidth]
  );

  // Move focus cursor (with optional Shift range extension & automatic grid expansion!)
  const moveCursor = useCallback(
    (nextRowRaw: number, nextColRaw: number, extendSelection = false) => {
      const nextRow = Math.max(0, Math.min(MAX_SHEET_ROWS - 1, nextRowRaw));
      const nextCol = Math.max(0, Math.min(MAX_SHEET_COLS - 1, nextColRaw));

      if (nextRow >= grid.length || nextCol >= (grid[0]?.length ?? 8)) {
        setGrid((prev) => ensureGridSize(prev, nextRow + 5, nextCol + 2));
      }

      setSelection((prev) => ({
        anchor: extendSelection ? prev.anchor : { row: nextRow, col: nextCol },
        focus: { row: nextRow, col: nextCol },
      }));
      scrollCellIntoView(nextRow, nextCol);
      focusCaptureInput();
    },
    [focusCaptureInput, grid, scrollCellIntoView]
  );

  // Single O(R) pre-parse pass ONLY when grid content changes (never on cursor movement!)
  const { parsedTimesByRow, unparsedTimeRows } = useMemo(() => {
    const times: (number | null)[] = new Array(grid.length);
    const unparsed = new Set<number>();
    for (let r = 0; r < grid.length; r++) {
      const val = (grid[r]?.[0] ?? '').trim();
      if (val.length === 0) {
        times[r] = null;
      } else {
        const parsed = parseTimestampCell(val);
        times[r] = parsed;
        if (parsed === null) {
          unparsed.add(r);
        }
      }
    }
    return { parsedTimesByRow: times, unparsedTimeRows: unparsed };
  }, [grid]);

  // O(k) fast search range lookup using pre-parsed row timestamps (zero regex on cursor movement!)
  const activeSearchRange = useMemo<FocusedSearchRange | null>(() => {
    const row = grid[activeRow];
    if (!row) return null;
    const rawA = (row[0] ?? '').trim();
    const rawB = (row[1] ?? '').trim();
    if (rawA.length > 0 || rawB.length === 0) return null;

    const safeDuration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
    let prevIdx = -1;
    for (let i = activeRow - 1; i >= 0; i--) {
      if (parsedTimesByRow[i] !== null) {
        prevIdx = i;
        break;
      }
    }
    let nextIdx = -1;
    for (let i = activeRow + 1; i < parsedTimesByRow.length; i++) {
      if (parsedTimesByRow[i] !== null) {
        nextIdx = i;
        break;
      }
    }
    if (prevIdx < 0 && nextIdx < 0) {
      return {
        targetKey: `sheet-row-${activeRow}`,
        targetTitle: rawB,
        startSec: 0,
        endSec: safeDuration,
        startLabel: null,
        endLabel: null,
        isNarrowed: false,
      };
    }
    const rawStart = prevIdx >= 0 ? Math.max(0, parsedTimesByRow[prevIdx]!) : 0;
    const rawEnd =
      nextIdx >= 0
        ? safeDuration > 0
          ? Math.min(safeDuration, Math.max(0, parsedTimesByRow[nextIdx]!))
          : Math.max(0, parsedTimesByRow[nextIdx]!)
        : safeDuration;
    const hasValidForwardSpan = rawEnd > rawStart + 0.05;
    const isStrictlyNarrower =
      safeDuration > 0
        ? rawEnd - rawStart < safeDuration - 0.05
        : prevIdx >= 0 && nextIdx >= 0;
    return {
      targetKey: `sheet-row-${activeRow}`,
      targetTitle: rawB,
      startSec: rawStart,
      endSec: rawEnd,
      startLabel: prevIdx >= 0 ? ((grid[prevIdx]?.[1] ?? '').trim() || null) : null,
      endLabel: nextIdx >= 0 ? ((grid[nextIdx]?.[1] ?? '').trim() || null) : null,
      isNarrowed: hasValidForwardSpan && isStrictlyNarrower,
    };
  }, [activeRow, durationSec, grid, parsedTimesByRow]);

  // Keep latest values in a ref so post-stop idle timers always read fresh state without cascading re-runs
  const latestSyncStateRef = useRef({
    activeRow,
    grid,
    durationSec,
    syncMode,
    onSeekToTime,
    onPreviewAtTime,
    onSearchRangeChange,
  });
  latestSyncStateRef.current = {
    activeRow,
    grid,
    durationSec,
    syncMode,
    onSeekToTime,
    onPreviewAtTime,
    onSearchRangeChange,
  };

  const clearPendingSyncTimer = useCallback(() => {
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
  }, []);

  // Schedules both video seek/preview AND zoomed range seekbar update AFTER cursor movement stops
  const schedulePostStopSync = useCallback(
    (delayMs: number = CURSOR_IDLE_SYNC_MS) => {
      clearPendingSyncTimer();
      // Never fire heavy video seeks or parent layout updates while arrow/nav keys are held or mouse-dragging!
      if (heldNavKeysRef.current.size > 0 || isSelectingDragRef.current) return;

      syncTimerRef.current = window.setTimeout(() => {
        syncTimerRef.current = null;
        if (heldNavKeysRef.current.size > 0 || isSelectingDragRef.current) return;

        const {
          activeRow: row,
          grid: currentGrid,
          durationSec: dur,
          syncMode: mode,
          onSeekToTime: seekFn,
          onPreviewAtTime: previewFn,
          onSearchRangeChange: rangeFn,
        } = latestSyncStateRef.current;

        // 1. Sync Zoomed Range Seekbar ONLY when its actual value changed (prevents parent re-render storms)
        const nextRange = computeSheetRowSearchRange(currentGrid, row, dur);
        const nextKey = nextRange
          ? `${nextRange.targetKey}|${nextRange.startSec}|${nextRange.endSec}|${nextRange.isNarrowed}`
          : 'null';
        if (nextKey !== lastEmittedRangeKeyRef.current) {
          lastEmittedRangeKeyRef.current = nextKey;
          rangeFn(nextRange);
        }

        // 2. Sync video playback ONLY when cursor settled on a different row (ignores horizontal col moves!)
        if (row !== lastSyncedRowRef.current) {
          lastSyncedRowRef.current = row;
          if (mode !== 'off') {
            const rawA = currentGrid[row]?.[0] ?? '';
            const parsedSec = parseTimestampCell(rawA);
            if (parsedSec !== null) {
              const targetSec =
                dur > 0 ? Math.max(0, Math.min(dur, parsedSec)) : Math.max(0, parsedSec);
              if (mode === 'preview10s') {
                previewFn(targetSec, 10);
              } else {
                seekFn(targetSec);
              }
            }
          }
        }
      }, delayMs);
    },
    [clearPendingSyncTimer]
  );

  // Reset idle sync timer whenever cursor moves or sync settings/grid change
  useEffect(() => {
    schedulePostStopSync(CURSOR_IDLE_SYNC_MS);
    return clearPendingSyncTimer;
  }, [activeRow, activeCol, durationSec, grid, syncMode, schedulePostStopSync, clearPendingSyncTimer]);

  // Clear search range, scroll rAF & timers cleanly when unmounting spreadsheet panel
  useEffect(() => {
    return () => {
      clearPendingSyncTimer();
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
      lastEmittedRangeKeyRef.current = 'null';
      onSearchRangeChange(null);
    };
  }, [clearPendingSyncTimer, onSearchRangeChange]);

  // Manual 10-second loop preview of a row's timestamp (or midpoint of narrowed range if untimed)
  const previewRow10s = useCallback(
    (targetRow: number) => {
      const rawA = grid[targetRow]?.[0] ?? '';
      const parsedSec = parseTimestampCell(rawA);
      if (parsedSec !== null) {
        const targetSec =
          durationSec > 0 ? Math.max(0, Math.min(durationSec, parsedSec)) : Math.max(0, parsedSec);
        onPreviewAtTime(targetSec, 10);
        return;
      }
      const range =
        targetRow === activeRow
          ? activeSearchRange
          : computeSheetRowSearchRange(grid, targetRow, durationSec);
      if (range && range.isNarrowed) {
        onPreviewAtTime((range.startSec + range.endSec) / 2, 10);
        return;
      }
      onPreviewAtTime(getCurrentTimeSec(), 10);
    },
    [activeRow, activeSearchRange, durationSec, getCurrentTimeSec, grid, onPreviewAtTime]
  );

  const handleManualPreview10s = useCallback(() => {
    previewRow10s(activeRow);
    focusCaptureInput();
  }, [activeRow, focusCaptureInput, previewRow10s]);

  // Stamp current video timecode into Column A of a target row
  const stampCurrentTimeToRow = useCallback(
    (targetRow: number) => {
      if (editing) commitInlineEdit();
      const nowSec = getCurrentTimeSec();
      const useHours = durationSec >= 3600 || nowSec >= 3600;
      const formatted = formatTimecodeByStyle(nowSec, 'auto', useHours);
      pushHistoryAndSetGrid(setCellValue(grid, targetRow, 0, formatted));
      focusCaptureInput();
    },
    [commitInlineEdit, durationSec, editing, focusCaptureInput, getCurrentTimeSec, grid, pushHistoryAndSetGrid]
  );

  const handleSetCurrentTimeToRow = useCallback(() => {
    stampCurrentTimeToRow(activeRow);
  }, [activeRow, stampCurrentTimeToRow]);

  // Live conversion summary for footer
  const liveSummary = useMemo(
    () => convertSheetToEntries(grid, originMetaRef.current, frames, durationSec).summary,
    [durationSec, frames, grid]
  );

  // Trigger loose save validation
  const handleTriggerSave = useCallback(() => {
    let workingGrid = grid;
    if (editing) {
      workingGrid = setCellValue(grid, editing.row, editing.col, editing.value);
      setGrid(workingGrid);
      setEditing(null);
    }
    const result = convertSheetToEntries(
      workingGrid,
      originMetaRef.current,
      frames,
      durationSec
    );
    if (result.notices.length === 0) {
      onSave(result.entries, result.scratchpad, result.summary);
    } else {
      setPendingReview(result);
    }
  }, [durationSec, editing, frames, grid, onSave]);

  const handleConfirmSaveWithNotices = useCallback(() => {
    if (!pendingReview) return;
    onSave(pendingReview.entries, pendingReview.scratchpad, pendingReview.summary);
  }, [onSave, pendingReview]);

  const handleTriggerCancel = useCallback(() => {
    if (isDirty) {
      setShowCancelConfirm(true);
    } else {
      onCancel();
    }
  }, [isDirty, onCancel]);

  const lastCancelTokenRef = useRef<number>(cancelRequestToken);
  useEffect(() => {
    if (cancelRequestToken !== lastCancelTokenRef.current) {
      lastCancelTokenRef.current = cancelRequestToken;
      handleTriggerCancel();
    }
  }, [cancelRequestToken, handleTriggerCancel]);

  // Global mouseup/keyup/blur listeners for drag selection, column resize, and releasing held nav keys
  useEffect(() => {
    const handleMouseUp = () => {
      const wasDragging = isSelectingDragRef.current;
      isSelectingDragRef.current = false;
      resizingColRef.current = null;
      if (wasDragging) {
        schedulePostStopSync(DRAG_RELEASE_SYNC_MS);
      }
    };
    const handleMouseMove = (e: MouseEvent) => {
      const resize = resizingColRef.current;
      if (!resize) return;
      const delta = e.clientX - resize.startX;
      const nextWidth = Math.max(76, Math.min(560, resize.startWidth + delta));
      setColWidths((prev) => ({ ...prev, [resize.col]: nextWidth }));
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (heldNavKeysRef.current.delete(e.key) && heldNavKeysRef.current.size === 0) {
        schedulePostStopSync(KEY_RELEASE_SYNC_MS);
      }
    };
    const handleWindowBlur = () => {
      const hadActive = heldNavKeysRef.current.size > 0 || isSelectingDragRef.current;
      heldNavKeysRef.current.clear();
      isSelectingDragRef.current = false;
      if (hadActive) {
        schedulePostStopSync(KEY_RELEASE_SYNC_MS);
      }
    };
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [schedulePostStopSync]);

  // Clipboard Copy / Cut / Paste handlers bound to the always-mounted capture input
  const handleCopy = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (editing) return; // Let native text copy inside active edit work normally
    e.preventDefault();
    const tsv = serializeRangeToTsv(grid, selection);
    e.clipboardData.setData('text/plain', tsv);
    setCutRange(null);
  };

  const handleCut = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (editing) return;
    e.preventDefault();
    const tsv = serializeRangeToTsv(grid, selection);
    e.clipboardData.setData('text/plain', tsv);
    setCutRange(selection);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (editing) return; // Let native paste into cell input work normally
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const matrix = parseClipboardMatrix(text);
    if (matrix.length === 0) return;

    let baseGrid = grid;
    if (cutRange) {
      baseGrid = clearRange(baseGrid, cutRange);
      setCutRange(null);
    }
    const { grid: nextGrid, selection: nextSel } = pasteMatrixAt(baseGrid, selection, matrix);
    pushHistoryAndSetGrid(nextGrid);
    setSelection(nextSel);
  };

  // Master keyboard handler on the unified capture/edit input (handles both navigation & editing + bulletproof IME!)
  const handleCaptureKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const isIme =
      composingRef.current ||
      e.nativeEvent.isComposing ||
      e.nativeEvent.keyCode === 229 ||
      e.key === 'Process' ||
      Date.now() - lastCompositionEndMsRef.current < 35;

    // NEVER intercept keys while Japanese/CJK IME is active or just confirmed on Safari!
    if (isIme) return;

    const mod = e.ctrlKey || e.metaKey;

    // Ctrl+Enter (Cmd+Enter on macOS): 10-second loop playback from anywhere in the sheet (never stolen by OS/browser/IME)
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      previewRow10s(activeRow);
      return;
    }

    if (editing) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitInlineEdit();
        moveCursor(activeRow + (e.shiftKey ? -1 : 1), activeCol, false);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commitInlineEdit();
        moveCursor(activeRow, activeCol + (e.shiftKey ? -1 : 1), false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelInlineEdit();
      }
      return;
    }

    // Navigation Mode (not actively editing cell text)
    if (NAV_KEYS.has(e.key)) {
      heldNavKeysRef.current.add(e.key);
      clearPendingSyncTimer();
    }

    if (mod) {
      const lower = e.key.toLowerCase();
      if (lower === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (lower === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (lower === 'a') {
        e.preventDefault();
        setSelection({
          anchor: { row: 0, col: 0 },
          focus: { row: rowCount - 1, col: colCount - 1 },
        });
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        moveCursor(0, 0, e.shiftKey);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        let lastRow = 0;
        let lastCol = 0;
        for (let r = 0; r < grid.length; r++) {
          for (let c = 0; c < grid[r].length; c++) {
            if (grid[r][c].trim().length > 0) {
              if (r > lastRow) lastRow = r;
              if (c > lastCol) lastCol = c;
            }
          }
        }
        moveCursor(lastRow, lastCol, e.shiftKey);
        return;
      }
      // Let Ctrl+C / Ctrl+X / Ctrl+V flow to native onCopy / onCut / onPaste!
      return;
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        moveCursor(activeRow - 1, activeCol, e.shiftKey);
        return;
      case 'ArrowDown':
        e.preventDefault();
        moveCursor(activeRow + 1, activeCol, e.shiftKey);
        return;
      case 'ArrowLeft':
        e.preventDefault();
        moveCursor(activeRow, activeCol - 1, e.shiftKey);
        return;
      case 'ArrowRight':
        e.preventDefault();
        moveCursor(activeRow, activeCol + 1, e.shiftKey);
        return;
      case 'Tab':
        e.preventDefault();
        moveCursor(activeRow, activeCol + (e.shiftKey ? -1 : 1), false);
        return;
      case 'Enter':
        e.preventDefault();
        moveCursor(activeRow + (e.shiftKey ? -1 : 1), activeCol, false);
        return;
      case 'Home':
        e.preventDefault();
        moveCursor(activeRow, 0, e.shiftKey);
        return;
      case 'End':
        e.preventDefault();
        moveCursor(activeRow, colCount - 1, e.shiftKey);
        return;
      case 'PageUp':
        e.preventDefault();
        moveCursor(activeRow - 10, activeCol, e.shiftKey);
        return;
      case 'PageDown':
        e.preventDefault();
        moveCursor(activeRow + 10, activeCol, e.shiftKey);
        return;
      case 'F2': {
        e.preventDefault();
        const cur = grid[activeRow]?.[activeCol] ?? '';
        setEditing({ row: activeRow, col: activeCol, value: cur, originalValue: cur });
        window.requestAnimationFrame(() => {
          const inp = captureInputRef.current;
          if (inp) {
            inp.focus();
            inp.setSelectionRange(cur.length, cur.length);
          }
        });
        return;
      }
      case 'Delete':
      case 'Backspace': {
        e.preventDefault();
        setCutRange(null);
        pushHistoryAndSetGrid(clearRange(grid, selection));
        return;
      }
      case 'Escape':
        if (cutRange) {
          e.preventDefault();
          setCutRange(null);
        }
        return;
      default:
        // Printable keys & IME start naturally type into the already-focused capture <input>
        // and trigger onCompositionStart / onChange to enter visible edit mode seamlessly!
        break;
    }
  };

  // Row / Column Toolbar Operations
  const normSel = useMemo(() => normalizeSelection(selection), [selection]);
  const normCut = useMemo(() => (cutRange ? normalizeSelection(cutRange) : null), [cutRange]);

  const handleInsertRowAboveAt = useCallback(
    (targetMinRow: number) => {
      if (editing) commitInlineEdit();
      pushHistoryAndSetGrid(insertRowAt(grid, targetMinRow));
      setRowMenu(null);
      focusCaptureInput();
    },
    [commitInlineEdit, editing, focusCaptureInput, grid, pushHistoryAndSetGrid]
  );

  const handleInsertRowBelowAt = useCallback(
    (targetMaxRow: number) => {
      if (editing) commitInlineEdit();
      pushHistoryAndSetGrid(insertRowAt(grid, targetMaxRow + 1));
      setRowMenu(null);
      moveCursor(targetMaxRow + 1, activeCol, false);
    },
    [activeCol, commitInlineEdit, editing, grid, moveCursor, pushHistoryAndSetGrid]
  );

  const handleDeleteRowsInRange = useCallback(
    (targetMinRow: number, targetMaxRow: number) => {
      if (editing) commitInlineEdit();
      const next = deleteRowsInRange(grid, targetMinRow, targetMaxRow);
      pushHistoryAndSetGrid(next);
      const clampedRow = Math.min(targetMinRow, next.length - 1);
      setSelection({
        anchor: { row: clampedRow, col: activeCol },
        focus: { row: clampedRow, col: activeCol },
      });
      setRowMenu(null);
      focusCaptureInput();
    },
    [activeCol, commitInlineEdit, editing, focusCaptureInput, grid, pushHistoryAndSetGrid]
  );

  const handleInsertColRight = () => {
    if (editing) commitInlineEdit();
    pushHistoryAndSetGrid(insertColAt(grid, normSel.maxCol + 1));
    focusCaptureInput();
  };

  const handleDeleteSelectedCols = () => {
    if (editing) commitInlineEdit();
    // Prevent deleting A or B completely without keeping at least 2 columns; standard Excel shifts cols left
    const next = deleteColsInRange(grid, normSel.minCol, normSel.maxCol);
    pushHistoryAndSetGrid(next);
    const clampedCol = Math.min(normSel.minCol, (next[0]?.length ?? 8) - 1);
    setSelection({
      anchor: { row: activeRow, col: clampedCol },
      focus: { row: activeRow, col: clampedCol },
    });
    focusCaptureInput();
  };

  const handleSortByTime = () => {
    if (editing) commitInlineEdit();
    pushHistoryAndSetGrid(sortRowsByTimestamp(grid));
    focusCaptureInput();
  };

  // Position of active cell overlay input (in LTR grid pixel coordinates)
  const activeCellBox = useMemo(() => {
    let left = ROW_NUM_WIDTH;
    for (let c = 0; c < activeCol; c++) left += getColWidth(c);
    const width = getColWidth(activeCol);
    const top = 36 + activeRow * fontCfg.rowHeight;
    return { left, top, width, height: fontCfg.rowHeight };
  }, [activeCol, activeRow, fontCfg.rowHeight, getColWidth]);

  // Dual Theme Token Map (stable static reference so SpreadsheetRow React.memo never invalidates)
  const palette = isLight ? LIGHT_PALETTE : DARK_PALETTE;

  const colWidthList = useMemo(
    () => Array.from({ length: colCount }, (_, c) => colWidths[c] ?? DEFAULT_EXTRA_COL_WIDTH),
    [colCount, colWidths]
  );

  const totalTableWidth = useMemo(() => {
    let sum = ROW_NUM_WIDTH;
    for (let c = 0; c < colWidthList.length; c++) sum += colWidthList[c];
    return sum;
  }, [colWidthList]);

  // Stable cell/row interaction callbacks so SpreadsheetRow React.memo skips untouched rows!
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const colCountRef = useRef(colCount);
  colCountRef.current = colCount;
  const commitInlineEditRef = useRef(commitInlineEdit);
  commitInlineEditRef.current = commitInlineEdit;

  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  // Close row action menu on outside click or Escape
  useEffect(() => {
    if (!rowMenu) return;
    const handleOutsideMouseDown = (e: MouseEvent) => {
      if (rowMenuElRef.current && rowMenuElRef.current.contains(e.target as Node)) return;
      setRowMenu(null);
    };
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setRowMenu(null);
        focusCaptureInput();
      }
    };
    window.addEventListener('mousedown', handleOutsideMouseDown);
    window.addEventListener('keydown', handleEscapeKey, true);
    return () => {
      window.removeEventListener('mousedown', handleOutsideMouseDown);
      window.removeEventListener('keydown', handleEscapeKey, true);
    };
  }, [focusCaptureInput, rowMenu]);

  const openClampedRowMenu = useCallback(
    (row: number, minRow: number, maxRow: number, rawX: number, rawY: number) => {
      const menuWidth = 224;
      const menuHeight = 250;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const x = Math.max(8, Math.min(rawX, vw - menuWidth - 8));
      const y = Math.max(8, Math.min(rawY, vh - menuHeight - 8));
      setRowMenu({ row, minRow, maxRow, x, y });
    },
    []
  );

  const handleRowHeaderClick = useCallback(
    (r: number, shiftKey: boolean, rect: DOMRect) => {
      if (editingRef.current) commitInlineEditRef.current();
      const lastCol = colCountRef.current - 1;
      const existing = rowMenuRef.current;

      // Clicking the same single row header again toggles the menu closed cleanly
      if (!shiftKey && existing && existing.minRow === r && existing.maxRow === r) {
        setRowMenu(null);
        focusCaptureInput();
        return;
      }

      let minRow = r;
      let maxRow = r;
      if (shiftKey) {
        const anchorRow = selectionRef.current.anchor.row;
        minRow = Math.min(anchorRow, r);
        maxRow = Math.max(anchorRow, r);
        setSelection({
          anchor: { row: anchorRow, col: 0 },
          focus: { row: r, col: lastCol },
        });
      } else {
        setSelection({
          anchor: { row: r, col: 0 },
          focus: { row: r, col: lastCol },
        });
      }
      openClampedRowMenu(r, minRow, maxRow, rect.right + 4, rect.top);
      focusCaptureInput();
    },
    [focusCaptureInput, openClampedRowMenu]
  );

  const handleRowHeaderContextMenu = useCallback(
    (r: number, clientX: number, clientY: number) => {
      if (editingRef.current) commitInlineEditRef.current();
      const lastCol = colCountRef.current - 1;
      const curNorm = normalizeSelection(selectionRef.current);
      const isWithinSelectedRows =
        curNorm.minCol === 0 &&
        curNorm.maxCol === lastCol &&
        r >= curNorm.minRow &&
        r <= curNorm.maxRow;

      let minRow = r;
      let maxRow = r;
      if (isWithinSelectedRows) {
        minRow = curNorm.minRow;
        maxRow = curNorm.maxRow;
      } else {
        setSelection({
          anchor: { row: r, col: 0 },
          focus: { row: r, col: lastCol },
        });
      }
      openClampedRowMenu(r, minRow, maxRow, clientX + 4, clientY + 4);
      focusCaptureInput();
    },
    [focusCaptureInput, openClampedRowMenu]
  );

  const handleCellMouseDown = useCallback(
    (r: number, c: number, shiftKey: boolean) => {
      const curEdit = editingRef.current;
      if (curEdit && (curEdit.row !== r || curEdit.col !== c)) {
        commitInlineEditRef.current();
      }
      if (shiftKey) {
        setSelection((prev) => ({
          anchor: prev.anchor,
          focus: { row: r, col: c },
        }));
      } else {
        isSelectingDragRef.current = true;
        clearPendingSyncTimer();
        setSelection({
          anchor: { row: r, col: c },
          focus: { row: r, col: c },
        });
      }
      focusCaptureInput();
    },
    [clearPendingSyncTimer, focusCaptureInput]
  );

  const handleCellMouseEnter = useCallback((r: number, c: number) => {
    if (!isSelectingDragRef.current) return;
    setSelection((prev) => ({
      anchor: prev.anchor,
      focus: { row: r, col: c },
    }));
  }, []);

  const handleCellDoubleClick = useCallback((r: number, c: number) => {
    const cur = gridRef.current[r]?.[c] ?? '';
    setSelection({ anchor: { row: r, col: c }, focus: { row: r, col: c } });
    setEditing({ row: r, col: c, value: cur, originalValue: cur });
    window.requestAnimationFrame(() => {
      const inp = captureInputRef.current;
      if (inp) {
        inp.focus();
        inp.setSelectionRange(cur.length, cur.length);
      }
    });
  }, []);

  const unparsedTooltipText = t('spreadsheet.unparsedTimeCellTooltip');
  const rowMenuTooltipText = t('spreadsheet.rowMenuTooltip');

  return (
    <div
      data-spreadsheet-panel="true"
      className={`flex flex-col h-full min-h-0 ${palette.shellBg}`}
    >
      {/* Top Action Header: Title + Video Sync Mode + Preview + Save / Cancel */}
      <div
        className={`px-3.5 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 shrink-0 ${palette.headerBg}`}
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="inline-flex items-center gap-1.5 font-semibold text-sm whitespace-nowrap">
            <Table2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{t('spreadsheet.panelTitle')}</span>
          </div>

          {/* Video Sync Mode Segmented Control */}
          <div
            className={`inline-flex items-center p-0.5 rounded-md border text-[11px] ${
              isLight ? 'bg-slate-200/70 border-slate-300' : 'bg-[#0B0D11] border-[#252C38]'
            }`}
            role="group"
            aria-label={t('spreadsheet.syncModeAriaLabel')}
          >
            {(
              [
                { value: 'off', label: t('spreadsheet.syncOff') },
                { value: 'seek', label: t('spreadsheet.syncSeek') },
                { value: 'preview10s', label: t('spreadsheet.syncPreview10s') },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSetSyncMode(opt.value)}
                className={`px-2 py-1 rounded font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  syncMode === opt.value
                    ? isLight
                      ? 'bg-white text-sky-800 shadow-xs'
                      : 'bg-[#222937] text-sky-300'
                    : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-[#8B97A9] hover:text-[#F3F5F8]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Save & Cancel Primary Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleTriggerCancel}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${palette.btn}`}
          >
            <X className="w-3.5 h-3.5" />
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleTriggerSave}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#0D0F12] bg-emerald-400 hover:bg-emerald-300 rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            {t('spreadsheet.saveAndApply')}
          </button>
        </div>
      </div>

      {/* Inline Cancel Confirmation Banner */}
      {showCancelConfirm && (
        <div
          className={`px-3.5 py-2 border-b flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 ${
            isLight
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {t('spreadsheet.cancelConfirmMessage')}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowCancelConfirm(false)}
              className={`px-2.5 py-1 rounded border font-medium cursor-pointer ${palette.btn}`}
            >
              {t('spreadsheet.continueEditing')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-2.5 py-1 rounded bg-red-500 hover:bg-red-400 text-white font-semibold cursor-pointer"
            >
              {t('spreadsheet.discardAndBack')}
            </button>
          </div>
        </div>
      )}

      {/* Compact Spreadsheet Toolbar: Undo/Redo, Row/Col ops, Sort, Font Size, Dark/Light Theme */}
      <div
        className={`px-3.5 py-1.5 border-b flex flex-wrap items-center justify-between gap-2 shrink-0 ${palette.toolbarBg}`}
      >
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            title={t('spreadsheet.undoTooltip')}
            className={`p-1.5 rounded border disabled:opacity-35 transition-colors cursor-pointer disabled:cursor-not-allowed ${palette.btn}`}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={redoStack.length === 0}
            onClick={handleRedo}
            title={t('spreadsheet.redoTooltip')}
            className={`p-1.5 rounded border disabled:opacity-35 transition-colors cursor-pointer disabled:cursor-not-allowed ${palette.btn}`}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <div className={`h-4 w-px mx-1 ${isLight ? 'bg-slate-300' : 'bg-[#28303E]'}`} />

          <button
            type="button"
            onClick={handleInsertColRight}
            title={t('spreadsheet.insertCol')}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap cursor-pointer ${palette.btn}`}
          >
            <Columns className="w-3 h-3" />
            {t('spreadsheet.insertColShort')}
          </button>
          <button
            type="button"
            onClick={handleDeleteSelectedCols}
            title={t('spreadsheet.deleteCols')}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap cursor-pointer ${palette.btn}`}
          >
            <Trash2 className="w-3 h-3" />
            {t('spreadsheet.deleteColsShort')}
          </button>

          <div className={`h-4 w-px mx-1 ${isLight ? 'bg-slate-300' : 'bg-[#28303E]'}`} />

          <button
            type="button"
            onClick={handleSortByTime}
            title={t('spreadsheet.sortByTimeTooltip')}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap cursor-pointer ${palette.btn}`}
          >
            <ArrowUpDown className="w-3 h-3" />
            {t('spreadsheet.sortByTime')}
          </button>
        </div>

        {/* Font Size Selector & Dark / Light Theme Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex items-center gap-0.5" role="group" aria-label={t('spreadsheet.fontSizeAriaLabel')}>
            {(['sm', 'md', 'lg', 'xl'] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => handleSetFontSize(sz)}
                className={`px-2 py-1 text-[11px] font-mono-tabular font-semibold rounded border transition-colors cursor-pointer ${
                  fontSize === sz ? palette.btnActive : palette.btn
                }`}
              >
                {FONT_CONFIG[sz].label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => handleSetTheme(isLight ? 'dark' : 'light')}
            title={isLight ? t('spreadsheet.switchToDark') : t('spreadsheet.switchToLight')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap cursor-pointer ${palette.btn}`}
          >
            {isLight ? (
              <>
                <Moon className="w-3.5 h-3.5" />
                {t('spreadsheet.themeDark')}
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-300" />
                {t('spreadsheet.themeLight')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Formula / Active Cell Input Bar + Inline Search Range Guide */}
      <div
        className={`px-3.5 py-1.5 border-b flex items-center gap-2 shrink-0 ${palette.formulaBg}`}
      >
        <span
          dir="ltr"
          className={`w-12 text-center font-mono-tabular text-xs font-bold py-1 rounded border shrink-0 select-none ${
            isLight
              ? 'bg-slate-100 border-slate-300 text-slate-700'
              : 'bg-[#161B24] border-[#2A3242] text-sky-300'
          }`}
        >
          {formatCellAddress(activeRow, activeCol)}
        </span>
        <input
          ref={formulaInputRef}
          type="text"
          dir={activeCol === 0 ? 'ltr' : 'auto'}
          value={activeValue}
          placeholder={
            activeCol === 0
              ? t('spreadsheet.colAPlaceholder')
              : activeCol === 1
                ? t('spreadsheet.colBPlaceholder')
                : t('spreadsheet.colExtraPlaceholder')
          }
          onChange={(e) => {
            const val = e.target.value;
            if (editing && editing.row === activeRow && editing.col === activeCol) {
              setEditing({ ...editing, value: val });
            } else {
              pushHistoryAndSetGrid(setCellValue(grid, activeRow, activeCol, val));
            }
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              previewRow10s(activeRow);
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (editing) commitInlineEdit();
              moveCursor(activeRow + 1, activeCol, false);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              if (editing) cancelInlineEdit();
              focusCaptureInput();
            }
          }}
          className={`flex-1 min-w-0 px-2.5 py-1 text-sm rounded border focus:outline-none ${
            activeCol === 0 ? 'font-mono-tabular' : ''
          } ${
            isLight
              ? 'bg-white border-slate-300 focus:border-sky-600 text-slate-900 placeholder:text-slate-400'
              : 'bg-[#12161D] border-[#293140] focus:border-sky-400 text-[#F8FAFC] placeholder:text-[#5B6678]'
          }`}
        />

        {activeSearchRange && activeSearchRange.isNarrowed && (
          <div className="hidden xl:flex items-center gap-1.5 text-[11px] shrink-0">
            <Crosshair className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span dir="ltr" className="font-mono-tabular text-sky-400 whitespace-nowrap">
              {formatTimecodeHMS(activeSearchRange.startSec)}–
              {formatTimecodeHMS(activeSearchRange.endSec)}
            </span>
          </div>
        )}
      </div>

      {/* Workspace Body: Left Vertical Quick-Action Rail (beside video & row numbers) + 2D Scrollable Grid */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Slim Vertical Action Rail pinned immediately left of the row-number column */}
        <div
          aria-label={t('spreadsheet.railAriaLabel')}
          className={`w-[74px] shrink-0 border-e flex flex-col items-stretch gap-2 p-1.5 select-none ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#12161D] border-[#222731]'
          }`}
        >
          {/* Prominent Stamp Current Time -> Column A of Active Row */}
          <button
            type="button"
            onClick={handleSetCurrentTimeToRow}
            title={t('spreadsheet.stampCurrentTimeTooltip')}
            className={`flex flex-col items-center justify-center gap-1 px-1 py-2.5 rounded-lg border text-center transition-colors cursor-pointer ${
              isLight
                ? 'bg-amber-50 hover:bg-amber-100 border-amber-400 text-amber-950'
                : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-400/50 text-amber-200'
            }`}
          >
            <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-[10px] font-semibold leading-tight break-keep">
              {t('spreadsheet.stampShortButton')}
            </span>
            <span
              dir="ltr"
              className={`font-mono-tabular text-[10px] font-bold px-1.5 py-0.5 rounded ${
                isLight ? 'bg-amber-200/80 text-amber-950' : 'bg-amber-400/20 text-amber-300'
              }`}
            >
              → A{activeRow + 1}
            </span>
          </button>

          {/* Instant 10-Second Loop Playback from Active Row */}
          <button
            type="button"
            onClick={handleManualPreview10s}
            title={t('spreadsheet.preview10sTooltip')}
            className={`flex flex-col items-center justify-center gap-1 px-1 py-2.5 rounded-lg border text-center transition-colors cursor-pointer ${
              isLight
                ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-400 text-emerald-950'
                : 'bg-emerald-500/12 hover:bg-emerald-500/22 border-emerald-400/40 text-emerald-200'
            }`}
          >
            <Repeat className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-[10px] font-semibold leading-tight break-keep">
              {t('spreadsheet.preview10sButton')}
            </span>
            <span
              dir="ltr"
              className={`font-mono-tabular text-[9px] leading-none opacity-75 ${
                isLight ? 'text-emerald-800' : 'text-emerald-300'
              }`}
            >
              Ctrl+Enter
            </span>
          </button>

          <div className={`w-full h-px my-0.5 ${isLight ? 'bg-slate-200' : 'bg-[#222731]'}`} />

          {/* Quick Row Menu Trigger for Active / Selected Rows */}
          <button
            type="button"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              openClampedRowMenu(
                activeRow,
                normSel.minRow,
                normSel.maxRow,
                rect.right + 6,
                rect.top
              );
            }}
            title={t('spreadsheet.rowMenuTooltip')}
            className={`flex flex-col items-center justify-center gap-0.5 px-1 py-2 rounded-lg border text-center transition-colors cursor-pointer ${palette.btn}`}
          >
            <MoreHorizontal className="w-3.5 h-3.5 shrink-0 opacity-80" />
            <span className="text-[10px] font-medium leading-tight">
              {t('spreadsheet.rowMenuRailButton')}
            </span>
            <span dir="ltr" className="font-mono-tabular text-[9px] opacity-70">
              {normSel.minRow === normSel.maxRow
                ? `#${normSel.minRow + 1}`
                : `#${normSel.minRow + 1}–${normSel.maxRow + 1}`}
            </span>
          </button>
        </div>

        {/* Main 2D Scrollable Spreadsheet Grid Canvas (strictly LTR coordinates A, B, C...) */}
        <div
          ref={scrollContainerRef}
          dir="ltr"
          className={`flex-1 min-w-0 min-h-0 overflow-auto relative select-none ${palette.gridBg}`}
          onScroll={() => {
            if (rowMenuRef.current) setRowMenu(null);
          }}
          onClick={() => {
            if (!editing) focusCaptureInput();
          }}
        >
        <div
          className="relative"
          style={{
            width: `${totalTableWidth}px`,
            height: `${36 + rowCount * fontCfg.rowHeight}px`,
          }}
        >
          {/* Sticky Column Header Row (100% opaque base so scrolled cells never bleed through) */}
          <div
            className={`sticky top-0 z-20 flex ${isLight ? 'bg-slate-100' : 'bg-[#151921]'}`}
            style={{ height: '36px', width: `${totalTableWidth}px` }}
          >
            {/* Corner Select-All Cell */}
            <button
              type="button"
              onClick={() => {
                if (editing) commitInlineEdit();
                setSelection({
                  anchor: { row: 0, col: 0 },
                  focus: { row: rowCount - 1, col: colCount - 1 },
                });
                focusCaptureInput();
              }}
              title={t('spreadsheet.selectAllTooltip')}
              style={{ width: `${ROW_NUM_WIDTH}px` }}
              className={`sticky left-0 z-30 shrink-0 border-r border-b flex items-center justify-center text-[10px] font-mono-tabular cursor-pointer ${palette.colHeaderBg}`}
            >
              #
            </button>

            {Array.from({ length: colCount }, (_, col) => {
              const isColSelected = col >= normSel.minCol && col <= normSel.maxCol;
              const colLabel = colIndexToLabel(col);
              const colSubtitle =
                col === 0
                  ? t('spreadsheet.colHeaderTime')
                  : col === 1
                    ? t('spreadsheet.colHeaderTitle')
                    : col === 2
                      ? t('spreadsheet.colHeaderMemo')
                      : '';
              const baseHeader =
                col === 0
                  ? palette.colHeaderA
                  : col === 1
                    ? palette.colHeaderB
                    : palette.colHeaderBg;

              return (
                <div
                  key={col}
                  style={{ width: `${getColWidth(col)}px` }}
                  className={`relative shrink-0 border-r border-b flex items-center justify-center gap-1.5 px-2 text-xs font-semibold cursor-pointer ${
                    isColSelected ? palette.colHeaderActive : baseHeader
                  }`}
                  onClick={(e) => {
                    if (editing) commitInlineEdit();
                    if (e.shiftKey) {
                      setSelection((prev) => ({
                        anchor: { row: 0, col: prev.anchor.col },
                        focus: { row: rowCount - 1, col },
                      }));
                    } else {
                      setSelection({
                        anchor: { row: 0, col },
                        focus: { row: rowCount - 1, col },
                      });
                    }
                    focusCaptureInput();
                  }}
                >
                  <span className="font-mono-tabular">{colLabel}</span>
                  {colSubtitle && (
                    <span className="text-[10px] font-normal opacity-80 truncate">
                      ({colSubtitle})
                    </span>
                  )}
                  {/* Column Width Drag Handle */}
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      resizingColRef.current = {
                        col,
                        startX: e.clientX,
                        startWidth: getColWidth(col),
                      };
                    }}
                    className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-sky-400/70"
                  />
                </div>
              );
            })}
          </div>

          {/* Data Rows (React.memo per row: moving cursor only re-renders 1–2 rows instead of the entire sheet!) */}
          {grid.map((rowData, r) => {
            const isRowSelected = r >= normSel.minRow && r <= normSel.maxRow;
            const isRowInCut = normCut !== null && r >= normCut.minRow && r <= normCut.maxRow;
            return (
              <SpreadsheetRow
                key={r}
                rowIndex={r}
                rowData={rowData}
                colWidthList={colWidthList}
                totalTableWidth={totalTableWidth}
                rowHeight={fontCfg.rowHeight}
                textClass={fontCfg.textClass}
                palette={palette}
                isLight={isLight}
                isRowSelected={isRowSelected}
                activeColInRow={r === activeRow ? activeCol : -1}
                selMinCol={isRowSelected ? normSel.minCol : -1}
                selMaxCol={isRowSelected ? normSel.maxCol : -1}
                cutMinCol={isRowInCut && normCut ? normCut.minCol : -1}
                cutMaxCol={isRowInCut && normCut ? normCut.maxCol : -1}
                hasUnparsedTime={unparsedTimeRows.has(r)}
                unparsedTooltip={unparsedTooltipText}
                rowMenuTooltip={rowMenuTooltipText}
                onRowHeaderClick={handleRowHeaderClick}
                onRowHeaderContextMenu={handleRowHeaderContextMenu}
                onCellMouseDown={handleCellMouseDown}
                onCellMouseEnter={handleCellMouseEnter}
                onCellDoubleClick={handleCellDoubleClick}
              />
            );
          })}

          {/* Always-Mounted Unified Capture & Inline Edit Input (Bulletproof Japanese/CJK IME!) */}
          <input
            ref={captureInputRef}
            type="text"
            dir={activeCol === 0 ? 'ltr' : 'auto'}
            aria-label={t('spreadsheet.activeCellInputAriaLabel', {
              cell: formatCellAddress(activeRow, activeCol),
            })}
            value={editing ? editing.value : ''}
            onCompositionStart={() => {
              composingRef.current = true;
              if (!editing) {
                const orig = grid[activeRow]?.[activeCol] ?? '';
                setEditing({
                  row: activeRow,
                  col: activeCol,
                  value: '',
                  originalValue: orig,
                });
              }
            }}
            onCompositionEnd={(e) => {
              composingRef.current = false;
              lastCompositionEndMsRef.current = Date.now();
              const val = e.currentTarget.value;
              setEditing((prev) => (prev ? { ...prev, value: val } : prev));
            }}
            onChange={(e) => {
              const val = e.target.value;
              if (editing) {
                setEditing({ ...editing, value: val });
              } else {
                const orig = grid[activeRow]?.[activeCol] ?? '';
                setEditing({
                  row: activeRow,
                  col: activeCol,
                  value: val,
                  originalValue: orig,
                });
              }
            }}
            onBlur={() => {
              if (editing && !composingRef.current) {
                commitInlineEdit();
              }
            }}
            onKeyDown={handleCaptureKeyDown}
            onCopy={handleCopy}
            onCut={handleCut}
            onPaste={handlePaste}
            style={
              editing
                ? {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    transform: `translate3d(${activeCellBox.left}px, ${activeCellBox.top}px, 0)`,
                    width: `${activeCellBox.width}px`,
                    height: `${activeCellBox.height}px`,
                    zIndex: 35,
                  }
                : {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    transform: `translate3d(${activeCellBox.left}px, ${activeCellBox.top}px, 0)`,
                    width: '1px',
                    height: '1px',
                    opacity: 0,
                    pointerEvents: 'none',
                    zIndex: 1,
                  }
            }
            className={
              editing
                ? `px-2.5 focus:outline-none ${fontCfg.textClass} ${
                    activeCol === 0 ? 'font-mono-tabular' : ''
                  } ${palette.editorBg}`
                : ''
            }
          />
        </div>
        </div>
      </div>

      {/* Floating Row Action Menu (triggered by clicking or right-clicking any row number) */}
      {rowMenu && (
        <div
          ref={rowMenuElRef}
          role="menu"
          style={{ left: `${rowMenu.x}px`, top: `${rowMenu.y}px` }}
          className={`fixed z-50 w-56 rounded-lg border shadow-xl py-1 text-xs select-none ${
            isLight
              ? 'bg-white border-slate-300 text-slate-800 shadow-slate-900/15'
              : 'bg-[#171C26] border-[#2D3648] text-[#E2E8F0] shadow-black/60'
          }`}
        >
          <div
            className={`px-3 py-1.5 text-[11px] font-semibold border-b ${
              isLight
                ? 'border-slate-200 text-slate-500 bg-slate-50/80'
                : 'border-[#252D3D] text-[#8B97A9] bg-[#12161E]'
            }`}
          >
            {rowMenu.minRow === rowMenu.maxRow
              ? t('spreadsheet.rowMenuHeader', { row: rowMenu.row + 1 })
              : t('spreadsheet.rowMenuRangeHeader', {
                  start: rowMenu.minRow + 1,
                  end: rowMenu.maxRow + 1,
                  count: rowMenu.maxRow - rowMenu.minRow + 1,
                })}
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              stampCurrentTimeToRow(rowMenu.row);
              setRowMenu(null);
            }}
            className={`w-full px-3 py-2 flex items-center gap-2 text-start transition-colors cursor-pointer ${
              isLight ? 'hover:bg-amber-50 text-amber-900' : 'hover:bg-amber-500/15 text-amber-200'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">
              {t('spreadsheet.rowMenuStampTime', { row: rowMenu.row + 1 })}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              previewRow10s(rowMenu.row);
              setRowMenu(null);
              focusCaptureInput();
            }}
            className={`w-full px-3 py-2 flex items-center gap-2 text-start transition-colors cursor-pointer ${
              isLight
                ? 'hover:bg-emerald-50 text-emerald-900'
                : 'hover:bg-emerald-500/15 text-emerald-200'
            }`}
          >
            <Repeat className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">{t('spreadsheet.rowMenuLoop10s')}</span>
          </button>

          <div className={`my-1 h-px ${isLight ? 'bg-slate-200' : 'bg-[#252D3D]'}`} />

          <button
            type="button"
            role="menuitem"
            onClick={() => handleInsertRowAboveAt(rowMenu.minRow)}
            className={`w-full px-3 py-2 flex items-center gap-2 text-start transition-colors cursor-pointer ${
              isLight ? 'hover:bg-slate-100' : 'hover:bg-[#222A39]'
            }`}
          >
            <Rows className="w-3.5 h-3.5 opacity-80 shrink-0" />
            <span className="truncate">{t('spreadsheet.insertRowAbove')}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => handleInsertRowBelowAt(rowMenu.maxRow)}
            className={`w-full px-3 py-2 flex items-center gap-2 text-start transition-colors cursor-pointer ${
              isLight ? 'hover:bg-slate-100' : 'hover:bg-[#222A39]'
            }`}
          >
            <Plus className="w-3.5 h-3.5 opacity-80 shrink-0" />
            <span className="truncate">{t('spreadsheet.insertRowBelow')}</span>
          </button>

          <div className={`my-1 h-px ${isLight ? 'bg-slate-200' : 'bg-[#252D3D]'}`} />

          <button
            type="button"
            role="menuitem"
            onClick={() => handleDeleteRowsInRange(rowMenu.minRow, rowMenu.maxRow)}
            className={`w-full px-3 py-2 flex items-center gap-2 text-start transition-colors cursor-pointer ${
              isLight ? 'hover:bg-red-50 text-red-700' : 'hover:bg-red-500/15 text-red-300'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span className="truncate">
              {rowMenu.minRow === rowMenu.maxRow
                ? t('spreadsheet.deleteRows')
                : `${t('spreadsheet.deleteRows')} (${rowMenu.maxRow - rowMenu.minRow + 1})`}
            </span>
          </button>
        </div>
      )}

      {/* Gentle Save Review Drawer (non-blocking loose notices + jump-to-cell + save anyway) */}
      {pendingReview && (
        <div
          className={`px-3.5 py-3 border-t shrink-0 space-y-2.5 ${
            isLight
              ? 'bg-amber-50/90 border-amber-200 text-slate-800'
              : 'bg-[#171A21] border-amber-500/40 text-[#E2E8F0]'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t('spreadsheet.reviewHeading')}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPendingReview(null)}
                className={`px-3 py-1 text-xs font-medium rounded border cursor-pointer ${palette.btn}`}
              >
                {t('spreadsheet.reviewBackToEdit')}
              </button>
              <button
                type="button"
                onClick={handleConfirmSaveWithNotices}
                className="px-3.5 py-1 text-xs font-semibold text-[#0D0F12] bg-emerald-400 hover:bg-emerald-300 rounded cursor-pointer"
              >
                {t('spreadsheet.reviewSaveAnyway')}
              </button>
            </div>
          </div>

          <ul className="max-h-28 overflow-y-auto space-y-1 text-xs">
            {pendingReview.notices.slice(0, 12).map((notice, idx) => (
              <li key={idx} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {notice.kind === 'unparsed-time' &&
                    t('spreadsheet.noticeUnparsedTime', {
                      cell: notice.cellAddress ?? '',
                      value: notice.rawValue ?? '',
                    })}
                  {notice.kind === 'clamped-time' &&
                    t('spreadsheet.noticeClampedTime', {
                      cell: notice.cellAddress ?? '',
                      value: notice.rawValue ?? '',
                    })}
                  {notice.kind === 'duplicate-time' &&
                    t('spreadsheet.noticeDuplicateTime', {
                      cell: notice.cellAddress ?? '',
                      value: notice.rawValue ?? '',
                    })}
                  {notice.kind === 'scratchpad-retained' &&
                    t('spreadsheet.noticeScratchpadRetained', {
                      count: notice.count ?? 0,
                    })}
                </span>
                {notice.row !== undefined && notice.col !== undefined && (
                  <button
                    type="button"
                    onClick={() => {
                      const r = notice.row!;
                      const c = notice.col!;
                      setPendingReview(null);
                      moveCursor(r, c, false);
                    }}
                    className="px-2 py-0.5 text-[11px] font-medium text-sky-400 hover:text-sky-300 underline whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {t('spreadsheet.jumpToCell', { cell: notice.cellAddress ?? '' })}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer Live Summary & Shortcut Hints */}
      <div
        className={`px-3.5 py-1.5 border-t flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0 ${palette.footerBg}`}
      >
        <div className="flex flex-wrap items-center gap-2 font-mono-tabular">
          <span>{t('spreadsheet.summaryTimed', { count: liveSummary.timedCount })}</span>
          <span aria-hidden="true">·</span>
          <span>{t('spreadsheet.summaryMarkerOnly', { count: liveSummary.markerOnlyCount })}</span>
          <span aria-hidden="true">·</span>
          <span>{t('spreadsheet.summaryUntimed', { count: liveSummary.untimedCount })}</span>
          {liveSummary.scratchpadCellCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {t('spreadsheet.summaryScratchpad', { count: liveSummary.scratchpadCellCount })}
              </span>
            </>
          )}
        </div>
        <span className="hidden md:inline truncate">
          {t('spreadsheet.footerShortcutsHint')}
        </span>
      </div>
    </div>
  );
};

export const ChapterSpreadsheetPanel = React.memo(ChapterSpreadsheetPanelInner);
