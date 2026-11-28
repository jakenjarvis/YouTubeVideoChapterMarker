/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ChapterEntry,
  ChapterTitle,
  FocusedSearchRange,
  FrameMapEntry,
  Marker,
} from '../types/video';
import {
  createId,
  findFrameIndexByTime,
  type ParsedChapterLine,
} from './timecode';

export interface DerivedMarkersAndTitles {
  markers: Marker[];
  titles: ChapterTitle[];
}

/**
 * Derives legacy Marker[] (sorted chronologically) and ChapterTitle[] views
 * from the unified ordered ChapterEntry[] list so existing components (TransportControls,
 * ChapterExportModal, YouTube validation) remain 100% compatible.
 */
export function deriveMarkersAndTitles(entries: ChapterEntry[]): DerivedMarkersAndTitles {
  const markers: Marker[] = [];
  const titles: ChapterTitle[] = [];
  let unassignedOrder = 1;

  for (const entry of entries) {
    if (entry.timeSec !== null && entry.frameIndex !== null) {
      markers.push({
        id: entry.id,
        frameIndex: entry.frameIndex,
        timeSec: entry.timeSec,
      });
      if (entry.title.trim().length > 0) {
        titles.push({
          id: entry.id,
          text: entry.title,
          assignedMarkerId: entry.id,
          unassignedOrder: 0,
        });
      }
    } else if (entry.title.trim().length > 0) {
      titles.push({
        id: entry.id,
        text: entry.title,
        assignedMarkerId: null,
        unassignedOrder: unassignedOrder++,
      });
    }
  }

  markers.sort((a, b) => a.timeSec - b.timeSec || a.frameIndex - b.frameIndex);
  return { markers, titles };
}

export interface SearchRangeRowInput {
  key: string;
  timeSec: number | null;
  title: string;
}

/**
 * Computes the narrowed search interval for an untimed row at `targetIndex`
 * by scanning backward for the nearest timed row and forward for the nearest timed row.
 *
 * Example: A(10:00) -> B(null) -> C(null) -> D(25:00)
 * For both B and C, returns startSec=600 (A), endSec=1500 (D), isNarrowed=true.
 *
 * Returns null if `targetIndex` is invalid, already timed, or durationSec <= 0.
 * `isNarrowed` is true ONLY when a valid strictly narrower forward window exists
 * (`0 <= startSec < endSec <= durationSec` and `(endSec - startSec) < durationSec - 0.05`).
 */
export function computeSearchRangeForRow(
  rows: SearchRangeRowInput[],
  targetIndex: number,
  durationSec: number
): FocusedSearchRange | null {
  if (targetIndex < 0 || targetIndex >= rows.length) return null;
  const target = rows[targetIndex];
  if (target.timeSec !== null) return null;

  const safeDuration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;

  let prevTimed: SearchRangeRowInput | null = null;
  for (let i = targetIndex - 1; i >= 0; i--) {
    if (rows[i].timeSec !== null) {
      prevTimed = rows[i];
      break;
    }
  }

  let nextTimed: SearchRangeRowInput | null = null;
  for (let i = targetIndex + 1; i < rows.length; i++) {
    if (rows[i].timeSec !== null) {
      nextTimed = rows[i];
      break;
    }
  }

  // If neither side has a confirmed timestamp, no narrowed range is known
  if (!prevTimed && !nextTimed) {
    return {
      targetKey: target.key,
      targetTitle: target.title,
      startSec: 0,
      endSec: safeDuration,
      startLabel: null,
      endLabel: null,
      isNarrowed: false,
    };
  }

  const rawStart = prevTimed ? Math.max(0, prevTimed.timeSec!) : 0;
  const rawEnd = nextTimed
    ? safeDuration > 0
      ? Math.min(safeDuration, Math.max(0, nextTimed.timeSec!))
      : Math.max(0, nextTimed.timeSec!)
    : safeDuration;

  const hasValidForwardSpan = rawEnd > rawStart + 0.05;
  const isStrictlyNarrower =
    safeDuration > 0
      ? rawEnd - rawStart < safeDuration - 0.05
      : Boolean(prevTimed && nextTimed);

  return {
    targetKey: target.key,
    targetTitle: target.title,
    startSec: rawStart,
    endSec: rawEnd,
    startLabel: prevTimed ? (prevTimed.title.trim() || null) : null,
    endLabel: nextTimed ? (nextTimed.title.trim() || null) : null,
    isNarrowed: hasValidForwardSpan && isStrictlyNarrower,
  };
}

/**
 * Convenience wrapper for ChapterEntry[].
 */
export function computeSearchRangeForEntry(
  entries: ChapterEntry[],
  entryId: string,
  durationSec: number
): FocusedSearchRange | null {
  const idx = entries.findIndex((e) => e.id === entryId);
  if (idx < 0) return null;
  return computeSearchRangeForRow(
    entries.map((e) => ({ key: e.id, timeSec: e.timeSec, title: e.title })),
    idx,
    durationSec
  );
}

/**
 * Inserts a new untitled marker at (frameIndex, timeSec) in chronological order relative
 * to existing timed entries, while preserving the relative order of surrounding untimed titles.
 * If a marker already exists at the exact same frameIndex, returns the existing list and ID.
 */
export function insertMarkerAtTime(
  entries: ChapterEntry[],
  frameIndex: number,
  timeSec: number
): { entries: ChapterEntry[]; markerId: string; alreadyExisted: boolean } {
  const existing = entries.find((e) => e.frameIndex === frameIndex && e.timeSec !== null);
  if (existing) {
    return { entries, markerId: existing.id, alreadyExisted: true };
  }

  const newEntry: ChapterEntry = {
    id: createId('mk'),
    timeSec,
    frameIndex,
    title: '',
  };

  // Find the first timed entry whose timestamp is strictly after the new marker
  let insertIdx = entries.length;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (
      e.timeSec !== null &&
      (e.timeSec > timeSec || (e.timeSec === timeSec && (e.frameIndex ?? 0) > frameIndex))
    ) {
      insertIdx = i;
      break;
    }
  }

  const next = [...entries];
  next.splice(insertIdx, 0, newEntry);
  return { entries: next, markerId: newEntry.id, alreadyExisted: false };
}

/**
 * Assigns a timestamp (frameIndex, timeSec) to an entry (typically an untimed title row).
 * - If the new timestamp fits cleanly between its previous and next timed neighbors, keeps it in place!
 * - If it falls outside neighboring timed rows (chronological inversion), moves it smoothly to the
 *   matching chronological slot while preserving all other entries.
 * - If another untitled marker already sits at the exact same frameIndex, merges the title into it
 *   so we don't create duplicate markers on the identical frame.
 */
export function assignTimeToEntry(
  entries: ChapterEntry[],
  entryId: string,
  frameIndex: number,
  timeSec: number
): { entries: ChapterEntry[]; targetId: string } {
  const idx = entries.findIndex((e) => e.id === entryId);
  if (idx < 0) return { entries, targetId: entryId };

  const source = entries[idx];

  // If another empty marker sits on the exact same frame, absorb it cleanly
  const sameFrameEmptyIdx = entries.findIndex(
    (e) =>
      e.id !== entryId &&
      e.frameIndex === frameIndex &&
      e.timeSec !== null &&
      e.title.trim().length === 0
  );

  const withoutDuplicate =
    sameFrameEmptyIdx >= 0 ? entries.filter((_, i) => i !== sameFrameEmptyIdx) : [...entries];
  const curIdx = withoutDuplicate.findIndex((e) => e.id === entryId);
  if (curIdx < 0) return { entries, targetId: entryId };

  const updated: ChapterEntry = {
    ...source,
    timeSec,
    frameIndex,
  };

  // Check if staying at curIdx maintains chronological order among timed entries
  let prevTime: number | null = null;
  for (let i = curIdx - 1; i >= 0; i--) {
    if (withoutDuplicate[i].timeSec !== null) {
      prevTime = withoutDuplicate[i].timeSec;
      break;
    }
  }
  let nextTime: number | null = null;
  for (let i = curIdx + 1; i < withoutDuplicate.length; i++) {
    if (withoutDuplicate[i].timeSec !== null) {
      nextTime = withoutDuplicate[i].timeSec;
      break;
    }
  }

  const fitsInPlace =
    (prevTime === null || timeSec >= prevTime) &&
    (nextTime === null || timeSec <= nextTime);

  if (fitsInPlace) {
    withoutDuplicate[curIdx] = updated;
    return { entries: withoutDuplicate, targetId: updated.id };
  }

  // Otherwise relocate to the chronological slot
  withoutDuplicate.splice(curIdx, 1);
  let insertIdx = withoutDuplicate.length;
  for (let i = 0; i < withoutDuplicate.length; i++) {
    const e = withoutDuplicate[i];
    if (
      e.timeSec !== null &&
      (e.timeSec > timeSec || (e.timeSec === timeSec && (e.frameIndex ?? 0) > frameIndex))
    ) {
      insertIdx = i;
      break;
    }
  }
  withoutDuplicate.splice(insertIdx, 0, updated);
  return { entries: withoutDuplicate, targetId: updated.id };
}

/**
 * Unlinks the timestamp from a timed entry while keeping its title at the EXACT same sequence position.
 * If the entry has no title, removes the row completely.
 */
export function unlinkTimeFromEntry(entries: ChapterEntry[], entryId: string): ChapterEntry[] {
  return entries.flatMap((entry) => {
    if (entry.id !== entryId) return [entry];
    if (entry.title.trim().length === 0) return [];
    return [{ ...entry, timeSec: null, frameIndex: null }];
  });
}

/**
 * Removes the title text from an entry.
 * - If timed: keeps the marker row with an empty title slot.
 * - If untimed: deletes the row completely.
 */
export function deleteTitleFromEntry(entries: ChapterEntry[], entryId: string): ChapterEntry[] {
  return entries.flatMap((entry) => {
    if (entry.id !== entryId) return [entry];
    if (entry.timeSec === null) return [];
    return [{ ...entry, title: '' }];
  });
}

/**
 * Deletes the marker timestamp while keeping any attached title right where it sits (no silent text loss).
 * If the marker has no title, deletes the row completely.
 */
export function deleteMarkerFromEntry(entries: ChapterEntry[], entryId: string): ChapterEntry[] {
  return unlinkTimeFromEntry(entries, entryId);
}

/**
 * Inserts a brand-new untimed title row at `insertIndex` (clamped to 0..entries.length).
 */
export function insertUntimedTitleAt(
  entries: ChapterEntry[],
  title: string,
  insertIndex?: number
): { entries: ChapterEntry[]; addedId: string } {
  const trimmed = title.trim();
  const addedId = createId('ch');
  if (!trimmed) return { entries, addedId };

  const idx =
    insertIndex === undefined
      ? entries.length
      : Math.max(0, Math.min(entries.length, insertIndex));
  const next = [...entries];
  next.splice(idx, 0, {
    id: addedId,
    timeSec: null,
    frameIndex: null,
    title: trimmed,
  });
  return { entries: next, addedId };
}

export function updateEntryTitle(
  entries: ChapterEntry[],
  entryId: string,
  title: string
): ChapterEntry[] {
  return entries.map((e) => (e.id === entryId ? { ...e, title } : e));
}

/**
 * Moves or swaps a title from `sourceId` to `targetId` (supporting drag & drop across
 * both timed markers and untimed title rows):
 * - Timed -> Timed: swaps titles between the two markers.
 * - Untimed -> Empty Timed Marker: assigns title to target marker and removes consumed untimed row.
 * - Untimed -> Occupied Timed Marker: swaps titles (target gets source title, source keeps displaced title untimed).
 * - Timed -> Untimed: swaps titles cleanly.
 * - Untimed -> Untimed: moves source row to target row's position.
 */
export function moveOrSwapTitleBetweenEntries(
  entries: ChapterEntry[],
  sourceId: string,
  targetId: string
): ChapterEntry[] {
  if (sourceId === targetId) return entries;
  const sourceIdx = entries.findIndex((e) => e.id === sourceId);
  const targetIdx = entries.findIndex((e) => e.id === targetId);
  if (sourceIdx < 0 || targetIdx < 0) return entries;

  const source = entries[sourceIdx];
  const target = entries[targetIdx];
  const sourceIsTimed = source.timeSec !== null;
  const targetIsTimed = target.timeSec !== null;

  const next = [...entries];

  if (sourceIsTimed && targetIsTimed) {
    // Classic marker-to-marker title swap/move
    next[sourceIdx] = { ...source, title: target.title };
    next[targetIdx] = { ...target, title: source.title };
    return next;
  }

  if (!sourceIsTimed && targetIsTimed) {
    if (target.title.trim().length === 0) {
      // Drop untimed title onto empty marker -> assign & remove consumed untimed row
      next[targetIdx] = { ...target, title: source.title };
      next.splice(sourceIdx, 1);
      return next;
    }
    // Drop untimed title onto occupied marker -> swap titles cleanly
    next[targetIdx] = { ...target, title: source.title };
    next[sourceIdx] = { ...source, title: target.title };
    return next;
  }

  if (sourceIsTimed && !targetIsTimed) {
    // Drop timed title onto untimed row -> swap titles
    next[sourceIdx] = { ...source, title: target.title };
    next[targetIdx] = { ...target, title: source.title };
    return next;
  }

  // Both untimed: reorder source row to target position
  const [moved] = next.splice(sourceIdx, 1);
  const adjustedTarget = sourceIdx < targetIdx ? targetIdx : targetIdx;
  next.splice(adjustedTarget, 0, moved);
  return next;
}

/**
 * Steps a title up (-1) or down (+1):
 * - On a timed marker: swaps its title with the previous/next timed marker (exact existing behavior!).
 * - On an untimed title row: moves the untimed row up or down by 1 slot in the unified list
 *   (allowing smooth movement past both untimed rows and timed markers!).
 */
export function stepEntryTitle(
  entries: ChapterEntry[],
  entryId: string,
  direction: -1 | 1
): ChapterEntry[] {
  const idx = entries.findIndex((e) => e.id === entryId);
  if (idx < 0) return entries;
  const entry = entries[idx];

  if (entry.timeSec === null) {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= entries.length) return entries;
    const next = [...entries];
    const [moved] = next.splice(idx, 1);
    next.splice(targetIdx, 0, moved);
    return next;
  }

  // Timed entry: find adjacent timed entry in the given direction
  const timedIndices: number[] = [];
  entries.forEach((e, i) => {
    if (e.timeSec !== null) timedIndices.push(i);
  });
  const posInTimed = timedIndices.indexOf(idx);
  const adjPos = posInTimed + direction;
  if (posInTimed < 0 || adjPos < 0 || adjPos >= timedIndices.length) return entries;
  const targetEntryIdx = timedIndices[adjPos];

  const next = [...entries];
  const target = next[targetEntryIdx];
  next[idx] = { ...entry, title: target.title };
  next[targetEntryIdx] = { ...target, title: entry.title };
  return next;
}

/**
 * Cascade-shifts titles downward by 1 timed marker slot starting from `startEntryId`
 * (preserves the exact existing "一括下スライド / shift titles down" feature).
 * Any title pushed past the last timed marker is preserved right after that marker
 * as an untimed title row so nothing is ever lost.
 */
export function shiftTitlesDownFromEntry(
  entries: ChapterEntry[],
  startEntryId: string
): ChapterEntry[] {
  const timedIndices: number[] = [];
  entries.forEach((e, i) => {
    if (e.timeSec !== null) timedIndices.push(i);
  });
  const startTimedPos = timedIndices.findIndex((i) => entries[i].id === startEntryId);
  if (startTimedPos < 0) return entries;

  const next = [...entries];
  const lastTimedEntryIdx = timedIndices[timedIndices.length - 1];
  const overflowTitle = next[lastTimedEntryIdx].title;

  for (let p = timedIndices.length - 1; p > startTimedPos; p--) {
    const dstIdx = timedIndices[p];
    const srcIdx = timedIndices[p - 1];
    next[dstIdx] = { ...next[dstIdx], title: next[srcIdx].title };
  }
  const firstIdx = timedIndices[startTimedPos];
  next[firstIdx] = { ...next[firstIdx], title: '' };

  if (overflowTitle.trim().length > 0) {
    next.splice(lastTimedEntryIdx + 1, 0, {
      id: createId('ch'),
      timeSec: null,
      frameIndex: null,
      title: overflowTitle,
    });
  }

  return next;
}

/**
 * Auto-assigns untimed title rows (in order) to empty timed markers (in order),
 * removing the consumed untimed rows (exact existing "空きマーカーへ自動割当" behavior).
 */
export function autoAssignUntimedToEmptyMarkers(entries: ChapterEntry[]): ChapterEntry[] {
  const emptyMarkerIndices: number[] = [];
  const untimedIndices: number[] = [];

  entries.forEach((e, idx) => {
    if (e.timeSec !== null && e.title.trim().length === 0) {
      emptyMarkerIndices.push(idx);
    } else if (e.timeSec === null && e.title.trim().length > 0) {
      untimedIndices.push(idx);
    }
  });

  const pairCount = Math.min(emptyMarkerIndices.length, untimedIndices.length);
  if (pairCount === 0) return entries;

  const next = [...entries];
  const consumedUntimed = new Set<number>();

  for (let i = 0; i < pairCount; i++) {
    const markerIdx = emptyMarkerIndices[i];
    const titleIdx = untimedIndices[i];
    next[markerIdx] = { ...next[markerIdx], title: next[titleIdx].title };
    consumedUntimed.add(titleIdx);
  }

  return next.filter((_, idx) => !consumedUntimed.has(idx));
}

export interface UnifiedSequenceImportOptions {
  replaceExisting: boolean;
  replaceMode: 'all' | 'titles-only';
  autoAssignTitles: boolean;
}

/**
 * Imports parsed chapter lines into the unified ChapterEntry[] sequence while
 * preserving the natural line order of mixed timed + untimed lines
 * (e.g. "00:00 A", "B", "10:00 C" -> [A(00:00), B(untimed), C(10:00)]).
 */
export function importParsedLinesIntoEntries(
  existing: ChapterEntry[],
  lines: ParsedChapterLine[],
  options: UnifiedSequenceImportOptions,
  frames: FrameMapEntry[],
  durationSec: number
): ChapterEntry[] {
  const replaceAll = options.replaceExisting && options.replaceMode === 'all';
  const replaceTitlesOnly = options.replaceExisting && options.replaceMode === 'titles-only';

  let next: ChapterEntry[] = replaceAll
    ? []
    : replaceTitlesOnly
      ? existing
          .filter((e) => e.timeSec !== null)
          .map((e) => ({ ...e, title: '' }))
      : [...existing];

  const snapTime = (rawSec: number) => {
    const clampedSec =
      durationSec > 0 ? Math.max(0, Math.min(durationSec, rawSec)) : Math.max(0, rawSec);
    const snappedIdx =
      frames.length > 0 ? findFrameIndexByTime(frames, clampedSec) : Math.round(clampedSec * 30);
    const frameEntry = frames[snappedIdx];
    return {
      frameIndex: frameEntry ? frameEntry.frameIndex : snappedIdx,
      timeSec: frameEntry ? frameEntry.timeSec : clampedSec,
    };
  };

  // If replacing everything cleanly (most common for importing ordered drafts like A -> B -> C),
  // preserve exact input order row-by-row!
  if (replaceAll) {
    const imported: ChapterEntry[] = [];
    for (const line of lines) {
      if (line.timeSec !== null) {
        const snapped = snapTime(line.timeSec);
        const dupIdx = imported.findIndex(
          (e) =>
            e.timeSec !== null &&
            (e.frameIndex === snapped.frameIndex || Math.abs(e.timeSec - snapped.timeSec) < 0.35)
        );
        if (dupIdx >= 0) {
          if (line.title.length > 0) {
            imported[dupIdx] = { ...imported[dupIdx], title: line.title };
          }
        } else {
          imported.push({
            id: createId('mk'),
            timeSec: snapped.timeSec,
            frameIndex: snapped.frameIndex,
            title: line.title,
          });
        }
      } else if (line.title.length > 0) {
        imported.push({
          id: createId('ch'),
          timeSec: null,
          frameIndex: null,
          title: line.title,
        });
      }
    }
    return options.autoAssignTitles ? autoAssignUntimedToEmptyMarkers(imported) : imported;
  }

  // Append / merge mode: insert timed rows chronologically and keep untimed rows positioned cleanly
  // relative to the timed row that preceded them in the pasted text.
  let lastInsertedOrMatchedId: string | null = null;
  for (const line of lines) {
    if (line.timeSec !== null) {
      const snapped = snapTime(line.timeSec);
      const existingIdx = next.findIndex(
        (e) =>
          e.timeSec !== null &&
          (e.frameIndex === snapped.frameIndex || Math.abs(e.timeSec - snapped.timeSec) < 0.35)
      );
      if (existingIdx >= 0) {
        if (line.title.length > 0) {
          next[existingIdx] = { ...next[existingIdx], title: line.title };
        }
        lastInsertedOrMatchedId = next[existingIdx].id;
      } else {
        const res = insertMarkerAtTime(next, snapped.frameIndex, snapped.timeSec);
        next = res.entries;
        if (line.title.length > 0) {
          next = updateEntryTitle(next, res.markerId, line.title);
        }
        lastInsertedOrMatchedId = res.markerId;
      }
    } else if (line.title.length > 0) {
      const anchorIdx = lastInsertedOrMatchedId
        ? next.findIndex((e) => e.id === lastInsertedOrMatchedId)
        : -1;
      const insertAt = anchorIdx >= 0 ? anchorIdx + 1 : next.length;
      const res = insertUntimedTitleAt(next, line.title, insertAt);
      next = res.entries;
      lastInsertedOrMatchedId = res.addedId;
    }
  }

  return options.autoAssignTitles ? autoAssignUntimedToEmptyMarkers(next) : next;
}
