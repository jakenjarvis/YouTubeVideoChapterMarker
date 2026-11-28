/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ChapterEntry, FrameMapEntry } from '../src/types/video';
import {
  assignTimeToEntry,
  autoAssignUntimedToEmptyMarkers,
  computeSearchRangeForEntry,
  computeSearchRangeForRow,
  deleteMarkerFromEntry,
  deleteTitleFromEntry,
  deriveMarkersAndTitles,
  importParsedLinesIntoEntries,
  insertMarkerAtTime,
  insertUntimedTitleAt,
  moveOrSwapTitleBetweenEntries,
  shiftTitlesDownFromEntry,
  stepEntryTitle,
  unlinkTimeFromEntry,
} from '../src/utils/chapterSequence';
import { parseChapterTextLines } from '../src/utils/timecode';

function makeCfrFrames(durationSec: number, fps = 30): FrameMapEntry[] {
  const count = Math.floor(durationSec * fps) + 1;
  return Array.from({ length: count }, (_, i) => ({
    frameIndex: i,
    timeSec: i / fps,
    durationSec: 1 / fps,
  }));
}

describe('computeSearchRangeForRow & Zoomed Range Seekbar eligibility', () => {
  it('computes A–D search window when B and C are untimed between A and D', () => {
    const entries: ChapterEntry[] = [
      { id: 'a', timeSec: 60, frameIndex: 1800, title: 'A Intro' },
      { id: 'b', timeSec: null, frameIndex: null, title: 'B Topic' },
      { id: 'c', timeSec: null, frameIndex: null, title: 'C Demo' },
      { id: 'd', timeSec: 300, frameIndex: 9000, title: 'D Summary' },
    ];

    const rangeB = computeSearchRangeForEntry(entries, 'b', 600);
    assert.ok(rangeB);
    assert.equal(rangeB.startSec, 60);
    assert.equal(rangeB.endSec, 300);
    assert.equal(rangeB.startLabel, 'A Intro');
    assert.equal(rangeB.endLabel, 'D Summary');
    assert.equal(rangeB.isNarrowed, true);

    const rangeC = computeSearchRangeForEntry(entries, 'c', 600);
    assert.ok(rangeC);
    assert.equal(rangeC.startSec, 60);
    assert.equal(rangeC.endSec, 300);
    assert.equal(rangeC.isNarrowed, true);
  });

  it('marks isNarrowed=false when no neighboring timestamps narrow below full video duration', () => {
    // Only untimed titles -> full video range, not narrowed
    const onlyUntimed = [
      { key: '1', timeSec: null, title: 'A' },
      { key: '2', timeSec: null, title: 'B' },
    ];
    const r1 = computeSearchRangeForRow(onlyUntimed, 0, 600);
    assert.ok(r1);
    assert.equal(r1.isNarrowed, false);

    // 0:00 before and nothing after -> [0, 600] equals full duration, so isNarrowed=false
    const zeroToEnd = [
      { key: '1', timeSec: 0, title: 'Start' },
      { key: '2', timeSec: null, title: 'Rest' },
    ];
    const r2 = computeSearchRangeForRow(zeroToEnd, 1, 600);
    assert.ok(r2);
    assert.equal(r2.startSec, 0);
    assert.equal(r2.endSec, 600);
    assert.equal(r2.isNarrowed, false);

    // Non-zero start with nothing after -> [120, 600] IS strictly narrower than 600s!
    const midToEnd = [
      { key: '1', timeSec: 120, title: 'Part 1' },
      { key: '2', timeSec: null, title: 'Part 2' },
    ];
    const r3 = computeSearchRangeForRow(midToEnd, 1, 600);
    assert.ok(r3);
    assert.equal(r3.startSec, 120);
    assert.equal(r3.endSec, 600);
    assert.equal(r3.isNarrowed, true);

    // Reversed timestamps (prev > next) -> invalid forward span, isNarrowed=false
    const inverted = [
      { key: '1', timeSec: 400, title: 'Later' },
      { key: '2', timeSec: null, title: 'Middle' },
      { key: '3', timeSec: 100, title: 'Earlier' },
    ];
    const r4 = computeSearchRangeForRow(inverted, 1, 600);
    assert.ok(r4);
    assert.equal(r4.isNarrowed, false);
  });

  it('returns null for already-timed entries', () => {
    const entries: ChapterEntry[] = [
      { id: 'a', timeSec: 0, frameIndex: 0, title: 'A' },
    ];
    assert.equal(computeSearchRangeForEntry(entries, 'a', 600), null);
  });
});

describe('Unified ordered ChapterEntry operations', () => {
  it('assigns current time to an untimed title in-place when chronological, or relocates when inverted', () => {
    const base: ChapterEntry[] = [
      { id: 'a', timeSec: 0, frameIndex: 0, title: 'A' },
      { id: 'b', timeSec: null, frameIndex: null, title: 'B' },
      { id: 'c', timeSec: 120, frameIndex: 3600, title: 'C' },
    ];

    const inPlace = assignTimeToEntry(base, 'b', 1800, 60);
    assert.deepEqual(
      inPlace.entries.map((e) => [e.id, e.timeSec, e.title]),
      [
        ['a', 0, 'A'],
        ['b', 60, 'B'],
        ['c', 120, 'C'],
      ]
    );

    const relocated = assignTimeToEntry(base, 'b', 6000, 200);
    assert.deepEqual(
      relocated.entries.map((e) => [e.id, e.timeSec, e.title]),
      [
        ['a', 0, 'A'],
        ['c', 120, 'C'],
        ['b', 200, 'B'],
      ]
    );
  });

  it('preserves title position on unlink and marker delete', () => {
    const base: ChapterEntry[] = [
      { id: 'a', timeSec: 0, frameIndex: 0, title: 'A' },
      { id: 'b', timeSec: 60, frameIndex: 1800, title: 'B' },
      { id: 'c', timeSec: 120, frameIndex: 3600, title: 'C' },
    ];

    const unlinked = unlinkTimeFromEntry(base, 'b');
    assert.deepEqual(
      unlinked.map((e) => [e.id, e.timeSec, e.title]),
      [
        ['a', 0, 'A'],
        ['b', null, 'B'],
        ['c', 120, 'C'],
      ]
    );

    const deletedMarker = deleteMarkerFromEntry(base, 'b');
    assert.equal(deletedMarker[1].timeSec, null);
    assert.equal(deletedMarker[1].title, 'B');

    // Deleting an untitled marker removes the row cleanly
    const withEmpty: ChapterEntry[] = [
      { id: 'a', timeSec: 0, frameIndex: 0, title: '' },
    ];
    assert.equal(deleteMarkerFromEntry(withEmpty, 'a').length, 0);
  });

  it('preserves cascade shift-down, step up/down swap, drag/drop, and auto-assign', () => {
    const base: ChapterEntry[] = [
      { id: 'm1', timeSec: 0, frameIndex: 0, title: 'Intro' },
      { id: 'm2', timeSec: 60, frameIndex: 1800, title: 'Main' },
      { id: 'm3', timeSec: 120, frameIndex: 3600, title: 'Outro' },
    ];

    // Cascade shift down from m1 pushes Outro into an untimed row right after m3 (zero data loss)
    const shifted = shiftTitlesDownFromEntry(base, 'm1');
    assert.equal(shifted.length, 4);
    assert.equal(shifted[0].title, '');
    assert.equal(shifted[1].title, 'Intro');
    assert.equal(shifted[2].title, 'Main');
    assert.equal(shifted[3].timeSec, null);
    assert.equal(shifted[3].title, 'Outro');

    // Auto-assign fills empty m1 with untimed Outro
    const autoAssigned = autoAssignUntimedToEmptyMarkers(shifted);
    assert.equal(autoAssigned.length, 3);
    assert.equal(autoAssigned[0].title, 'Outro');

    // Step up/down swaps titles between adjacent timed markers
    const swapped = stepEntryTitle(base, 'm1', 1);
    assert.equal(swapped[0].title, 'Main');
    assert.equal(swapped[1].title, 'Intro');

    // Drag/drop untimed title onto empty marker assigns & consumes untimed row
    const withEmptyAndUntimed: ChapterEntry[] = [
      { id: 'm1', timeSec: 0, frameIndex: 0, title: '' },
      { id: 'u1', timeSec: null, frameIndex: null, title: 'Draft B' },
    ];
    const dropped = moveOrSwapTitleBetweenEntries(withEmptyAndUntimed, 'u1', 'm1');
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].id, 'm1');
    assert.equal(dropped[0].title, 'Draft B');
  });

  it('supports inline untimed title insertion, title deletion, and mixed ordered text import', () => {
    const frames = makeCfrFrames(600, 30);
    const parsed = parseChapterTextLines('00:00 Intro\nMid Draft\n05:00 Finale');
    const imported = importParsedLinesIntoEntries(
      [],
      parsed.lines,
      { replaceExisting: true, replaceMode: 'all', autoAssignTitles: false },
      frames,
      600
    );

    assert.equal(imported.length, 3);
    assert.equal(imported[0].timeSec, 0);
    assert.equal(imported[0].title, 'Intro');
    assert.equal(imported[1].timeSec, null);
    assert.equal(imported[1].title, 'Mid Draft');
    assert.equal(imported[2].timeSec, 300);
    assert.equal(imported[2].title, 'Finale');

    // Insert B2 right after Mid Draft
    const inserted = insertUntimedTitleAt(imported, 'B2 Bonus', 2);
    assert.equal(inserted.entries.length, 4);
    assert.equal(inserted.entries[2].title, 'B2 Bonus');

    // Delete title on timed entry keeps marker; delete title on untimed removes row
    const afterDelTimed = deleteTitleFromEntry(inserted.entries, inserted.entries[0].id);
    assert.equal(afterDelTimed[0].timeSec, 0);
    assert.equal(afterDelTimed[0].title, '');
    const afterDelUntimed = deleteTitleFromEntry(afterDelTimed, inserted.addedId);
    assert.equal(afterDelUntimed.length, 3);

    // Derive legacy markers + titles cleanly
    const derived = deriveMarkersAndTitles(imported);
    assert.equal(derived.markers.length, 2);
    assert.equal(derived.titles.length, 3);
    assert.equal(derived.titles.filter((t) => t.assignedMarkerId === null).length, 1);

    // Insert marker in chronological slot
    const mkRes = insertMarkerAtTime(imported, 4500, 150);
    assert.equal(mkRes.alreadyExisted, false);
    assert.equal(mkRes.entries.length, 4);
  });
});
