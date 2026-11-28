import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Plus,
  Trash2,
  Unlink,
  Check,
  X,
  Bookmark,
  ArrowDownToLine,
  Wand2,
  MapPin,
  Crosshair,
} from 'lucide-react';
import type { ChapterEntry, PlaybackMode } from '../types/video';
import { formatTimecodeHMS } from '../utils/timecode';
import { computeSearchRangeForRow } from '../utils/chapterSequence';
import { computePlayheadSlot, TimelinePlayheadGap } from './TimelinePlayheadSlot';
import { useI18n } from '../i18n';

interface ChapterTimelinePanelProps {
  entries: ChapterEntry[];
  currentFrameIndex: number;
  currentTimeSec: number;
  durationSec: number;
  playbackMode: PlaybackMode;
  lastSelectedMarkerId: string | null;
  focusedUntimedEntryId: string | null;
  onSelectMarker: (entryId: string, frameIndex: number) => void;
  onFocusUntimedEntry: (entryId: string | null) => void;
  onSeekToTime: (timeSec: number) => void;
  onAddMarkerAtCurrent: () => void;
  onAssignCurrentTimeToEntry: (entryId: string) => void;
  onDeleteMarker: (entryId: string) => void;
  onAddTitleForMarker: (entryId: string, text: string) => void;
  onInsertUntimedTitleAt: (text: string, insertIndex?: number) => void;
  onUpdateTitleText: (entryId: string, text: string) => void;
  onDeleteTitle: (entryId: string) => void;
  onUnassignTitle: (entryId: string) => void;
  onMoveOrSwapTitleBetweenEntries: (sourceId: string, targetId: string) => void;
  onStepEntryTitle: (entryId: string, direction: -1 | 1) => void;
  onShiftTitlesDownFromEntry: (startEntryId: string) => void;
  onAutoAssignUnassigned: () => void;
}

export const ChapterTimelinePanel: React.FC<ChapterTimelinePanelProps> = ({
  entries,
  currentFrameIndex,
  currentTimeSec,
  durationSec,
  playbackMode,
  lastSelectedMarkerId,
  focusedUntimedEntryId,
  onSelectMarker,
  onFocusUntimedEntry,
  onSeekToTime,
  onAddMarkerAtCurrent,
  onAssignCurrentTimeToEntry,
  onDeleteMarker,
  onAddTitleForMarker,
  onInsertUntimedTitleAt,
  onUpdateTitleText,
  onDeleteTitle,
  onUnassignTitle,
  onMoveOrSwapTitleBetweenEntries,
  onStepEntryTitle,
  onShiftTitlesDownFromEntry,
  onAutoAssignUnassigned,
}) => {
  const { t } = useI18n();
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [addingMarkerId, setAddingMarkerId] = useState<string | null>(null);
  const [addingMarkerDraft, setAddingMarkerDraft] = useState('');
  const [insertingAtIndex, setInsertingAtIndex] = useState<number | null>(null);
  const [insertingDraft, setInsertingDraft] = useState('');
  const [newUnassignedDraft, setNewUnassignedDraft] = useState('');

  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null);
  const [dropTargetEntryId, setDropTargetEntryId] = useState<string | null>(null);

  // Derived timed list for playhead slot positioning & counts
  const timedRows = useMemo(
    () =>
      entries
        .map((entry, listIdx) => ({ entry, listIdx }))
        .filter((item) => item.entry.timeSec !== null && item.entry.frameIndex !== null),
    [entries]
  );

  const timedPosById = useMemo(() => {
    const map = new Map<string, number>();
    timedRows.forEach((item, pos) => map.set(item.entry.id, pos));
    return map;
  }, [timedRows]);

  const searchRangeInputs = useMemo(
    () => entries.map((e) => ({ key: e.id, timeSec: e.timeSec, title: e.title })),
    [entries]
  );

  const markerCount = timedRows.length;
  const assignedCount = timedRows.filter((item) => item.entry.title.trim().length > 0).length;
  const emptyMarkerCount = markerCount - assignedCount;
  const untimedCount = entries.filter(
    (e) => e.timeSec === null && e.title.trim().length > 0
  ).length;

  const playheadSlot = computePlayheadSlot(
    timedRows.map((item) => ({
      timeSec: item.entry.timeSec!,
      frameIndex: item.entry.frameIndex!,
    })),
    currentFrameIndex,
    currentTimeSec,
    durationSec,
    1
  );

  const startEditing = (entry: ChapterEntry) => {
    setEditingEntryId(entry.id);
    setEditingDraft(entry.title);
  };

  const commitEditing = () => {
    if (editingEntryId) {
      const trimmed = editingDraft.trim();
      if (trimmed.length > 0) {
        onUpdateTitleText(editingEntryId, trimmed);
      }
    }
    setEditingEntryId(null);
    setEditingDraft('');
  };

  const commitMarkerNewTitle = (entryId: string) => {
    const trimmed = addingMarkerDraft.trim();
    if (trimmed.length > 0) {
      onAddTitleForMarker(entryId, trimmed);
    }
    setAddingMarkerId(null);
    setAddingMarkerDraft('');
  };

  const commitInlineInsert = (insertIndex: number) => {
    const trimmed = insertingDraft.trim();
    if (trimmed.length > 0) {
      onInsertUntimedTitleAt(trimmed, insertIndex);
    }
    setInsertingAtIndex(null);
    setInsertingDraft('');
  };

  const commitBottomNewTitle = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newUnassignedDraft.trim();
    if (!trimmed) return;
    onInsertUntimedTitleAt(trimmed);
    setNewUnassignedDraft('');
  };

  const handleDragStart = (e: React.DragEvent, entryId: string) => {
    setDraggedEntryId(entryId);
    e.dataTransfer.setData('text/plain', entryId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedEntryId(null);
    setDropTargetEntryId(null);
  };

  const handleDropOnEntry = (e: React.DragEvent, targetEntryId: string) => {
    e.preventDefault();
    const sourceId = draggedEntryId || e.dataTransfer.getData('text/plain');
    setDropTargetEntryId(null);
    setDraggedEntryId(null);
    if (sourceId && sourceId !== targetEntryId) {
      onMoveOrSwapTitleBetweenEntries(sourceId, targetEntryId);
    }
  };

  const renderInlineInsertForm = (insertIndex: number) => (
    <div className="my-1 px-2.5 py-2 rounded-md border border-dashed border-sky-400/60 bg-[#111722] flex items-center gap-1.5">
      <input
        type="text"
        dir="auto"
        value={insertingDraft}
        autoFocus
        placeholder={t('chapters.insertTitleInlinePlaceholder')}
        onChange={(e) => setInsertingDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            commitInlineInsert(insertIndex);
          } else if (e.key === 'Escape') {
            setInsertingAtIndex(null);
            setInsertingDraft('');
          }
        }}
        className="flex-1 min-w-0 px-2 py-1 text-xs bg-[#0D0F12] border border-sky-400/60 rounded text-[#F8FAFC] placeholder:text-[#5E687A] focus:outline-none"
      />
      <button
        type="button"
        onClick={() => commitInlineInsert(insertIndex)}
        title={t('common.add')}
        className="p-1 text-emerald-400 hover:bg-emerald-500/15 rounded cursor-pointer"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => {
          setInsertingAtIndex(null);
          setInsertingDraft('');
        }}
        title={t('common.cancel')}
        className="p-1 text-[#94A0B2] hover:bg-[#232934] rounded cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sub-header summary & quick actions */}
      <div className="px-4 py-3 border-b border-[#222731] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="text-xs text-[#94A0B2] flex items-center gap-2 font-mono-tabular">
          <span>{t('chapters.summaryMarkers', { count: markerCount })}</span>
          <span aria-hidden="true" className="text-[#454E5E]">·</span>
          <span>{t('chapters.summaryAssigned', { count: assignedCount })}</span>
          <span aria-hidden="true" className="text-[#454E5E]">·</span>
          <span>{t('chapters.summaryUnassigned', { count: untimedCount })}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {untimedCount > 0 && emptyMarkerCount > 0 && (
            <button
              type="button"
              onClick={onAutoAssignUnassigned}
              title={t('chapters.autoAssignTooltip')}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-sky-300 hover:text-sky-200 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded transition-colors whitespace-nowrap cursor-pointer"
            >
              <Wand2 className="w-3 h-3" />
              {t('chapters.autoAssignButton')}
            </button>
          )}
          <button
            type="button"
            onClick={onAddMarkerAtCurrent}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('chapters.markCurrentButton')}
          </button>
        </div>
      </div>

      {/* Unified Ordered Vertical Chapter Timeline (Timed + Untimed Rows Preserving Narrative Order) */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-1.5">
        {entries.length === 0 ? (
          <div className="my-1.5 py-10 px-4 text-center border border-dashed border-[#272D38] rounded-lg bg-[#111419]">
            <Bookmark className="w-6 h-6 text-[#647082] mx-auto mb-2.5" />
            <p className="text-sm font-medium text-[#E2E8F0]">{t('chapters.emptyTitle')}</p>
            <p className="mt-1.5 text-xs text-[#94A0B2] leading-relaxed">
              {t('chapters.emptyDescBeforeKey')}
              <kbd className="font-mono-tabular text-[#E2E8F0]">M</kbd>
              {t('chapters.emptyDescAfterKey')}
            </p>
            <button
              type="button"
              onClick={onAddMarkerAtCurrent}
              className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0D0F12] bg-amber-400 hover:bg-amber-300 rounded-md transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('chapters.addFirstMarker')}
            </button>
          </div>
        ) : (
          <>
            {timedRows.length > 0 && (
              <TimelinePlayheadGap
                active={playheadSlot.kind === 'before-first'}
                progress={playheadSlot.kind === 'before-first' ? playheadSlot.progress : 0}
                currentTimeSec={currentTimeSec}
                playbackMode={playbackMode}
                accent="amber"
              />
            )}

            {entries.map((entry, entryIdx) => {
              const isTimed = entry.timeSec !== null && entry.frameIndex !== null;
              const timedIdx = isTimed ? (timedPosById.get(entry.id) ?? -1) : -1;
              const isCurrent =
                isTimed && playheadSlot.kind === 'on-item' && playheadSlot.index === timedIdx;
              const isLastSelected = isTimed && lastSelectedMarkerId === entry.id;
              const isFocusedUntimed = !isTimed && focusedUntimedEntryId === entry.id;
              const isDropHover = dropTargetEntryId === entry.id;

              const isGapActiveAfter =
                isTimed &&
                ((playheadSlot.kind === 'between' && playheadSlot.afterIndex === timedIdx) ||
                  (playheadSlot.kind === 'after-last' && timedIdx === timedRows.length - 1));
              const gapProgressAfter =
                isTimed && playheadSlot.kind === 'between' && playheadSlot.afterIndex === timedIdx
                  ? playheadSlot.progress
                  : isTimed &&
                      playheadSlot.kind === 'after-last' &&
                      timedIdx === timedRows.length - 1
                    ? playheadSlot.progress
                    : 0;

              const searchRange = !isTimed
                ? computeSearchRangeForRow(searchRangeInputs, entryIdx, durationSec)
                : null;
              const hasNarrowedRange = Boolean(searchRange && searchRange.isNarrowed);

              return (
                <React.Fragment key={entry.id}>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dropTargetEntryId !== entry.id) {
                        setDropTargetEntryId(entry.id);
                      }
                    }}
                    onDragLeave={() => {
                      if (dropTargetEntryId === entry.id) {
                        setDropTargetEntryId(null);
                      }
                    }}
                    onDrop={(e) => handleDropOnEntry(e, entry.id)}
                    className={`group flex items-stretch gap-2 rounded-md border transition-colors mb-1.5 ${
                      isDropHover
                        ? 'border-amber-400 bg-amber-500/15'
                        : isTimed
                          ? isCurrent
                            ? 'border-amber-400/80 bg-[#1B202A]'
                            : isLastSelected
                              ? 'border-dashed border-amber-400/80 bg-amber-500/[0.08] hover:border-amber-400'
                              : 'border-[#232833] bg-[#14171D] hover:border-[#303745]'
                          : isFocusedUntimed
                            ? 'border-sky-400/80 bg-sky-500/[0.09]'
                            : 'border-dashed border-[#2F394A] bg-[#12161E] hover:border-sky-400/50'
                    }`}
                  >
                    {/* Left Column: Timed Marker OR Untimed Search Range Trigger */}
                    {isTimed ? (
                      <div
                        className={`w-[126px] shrink-0 flex flex-col justify-between p-2 border-e rounded-s-md transition-colors ${
                          isCurrent
                            ? 'border-amber-400/35 bg-amber-500/[0.12]'
                            : isLastSelected
                              ? 'border-amber-400/25 bg-amber-500/[0.09]'
                              : 'border-[#222731] bg-[#111419]/70'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectMarker(entry.id, entry.frameIndex!)}
                          title={t('chapters.seekMarkerTitle', {
                            timecode: formatTimecodeHMS(entry.timeSec!),
                            frame: entry.frameIndex!,
                          })}
                          className="text-start group/seek cursor-pointer"
                        >
                          <div
                            dir="ltr"
                            className={`font-mono-tabular text-sm font-bold leading-tight transition-colors w-fit ${
                              isCurrent
                                ? 'text-amber-400'
                                : isLastSelected
                                  ? 'text-amber-200 group-hover/seek:text-amber-100'
                                  : 'text-[#F3F5F8] group-hover/seek:text-amber-300'
                            }`}
                          >
                            {formatTimecodeHMS(entry.timeSec!)}
                          </div>
                          <div dir="ltr" className="font-mono-tabular text-[11px] text-[#647082] mt-0.5 w-fit">
                            #{entry.frameIndex}
                          </div>
                        </button>

                        <div className="mt-1.5 flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              dir="ltr"
                              className={`font-mono-tabular text-[10px] ${
                                isCurrent || isLastSelected
                                  ? 'text-amber-400/90 font-semibold'
                                  : 'text-[#566071]'
                              }`}
                            >
                              {t('chapters.markerIndexBadge', {
                                number: String(timedIdx + 1).padStart(2, '0'),
                              })}
                            </span>
                            {isLastSelected && !isCurrent && (
                              <span className="text-[10px] font-medium text-amber-300/90 whitespace-nowrap">
                                {t('chapters.selectedPosition')}
                              </span>
                            )}
                            {isCurrent && (
                              <span className="text-[10px] font-semibold text-amber-300 whitespace-nowrap">
                                {t('chapters.currentPosition')}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => onDeleteMarker(entry.id)}
                            title={t('chapters.deleteMarkerTitle')}
                            className="p-0.5 text-[#647082] hover:text-red-400 transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() =>
                          onFocusUntimedEntry(isFocusedUntimed ? null : entry.id)
                        }
                        className={`w-[126px] shrink-0 flex flex-col justify-between p-2 border-e rounded-s-md transition-colors cursor-pointer ${
                          isFocusedUntimed
                            ? 'border-sky-400/40 bg-sky-500/[0.14]'
                            : 'border-[#252D3A] bg-[#0F131A]/80 hover:bg-sky-500/[0.08]'
                        }`}
                      >
                        <div className="flex items-center gap-1 text-[11px] font-medium text-sky-300">
                          <Crosshair className="w-3 h-3 shrink-0" />
                          <span className="truncate">{t('chapters.untimedBadge')}</span>
                        </div>
                        {hasNarrowedRange && searchRange ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onFocusUntimedEntry(entry.id);
                              onSeekToTime((searchRange.startSec + searchRange.endSec) / 2);
                            }}
                            title={t('chapters.searchRangeJumpMidTitle')}
                            className="mt-1 text-start font-mono-tabular text-[10px] text-sky-200/85 hover:text-sky-100 leading-tight cursor-pointer"
                            dir="ltr"
                          >
                            {formatTimecodeHMS(searchRange.startSec)}–
                            {formatTimecodeHMS(searchRange.endSec)}
                          </button>
                        ) : (
                          <span className="mt-1 text-[10px] text-[#647082]">
                            {t('chapters.noNarrowedRangeHint')}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Right Column: Title, Inline Editing, & Action Controls */}
                    <div className="flex-1 min-w-0 p-2 flex items-center">
                      {entry.title.trim().length > 0 ? (
                        editingEntryId === entry.id ? (
                          <div className="w-full flex items-center gap-1.5">
                            <input
                              type="text"
                              dir="auto"
                              value={editingDraft}
                              autoFocus
                              onChange={(e) => setEditingDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                                if (e.key === 'Enter') commitEditing();
                                if (e.key === 'Escape') {
                                  setEditingEntryId(null);
                                  setEditingDraft('');
                                }
                              }}
                              className="flex-1 min-w-0 px-2 py-1 text-sm bg-[#0D0F12] border border-amber-400/70 rounded text-[#F8FAFC] focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={commitEditing}
                              title={t('common.save')}
                              className="p-1 text-emerald-400 hover:bg-emerald-500/15 rounded cursor-pointer"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEntryId(null);
                                setEditingDraft('');
                              }}
                              title={t('common.cancel')}
                              className="p-1 text-[#94A0B2] hover:bg-[#232934] rounded cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div
                            draggable
                            onDragStart={(e) => handleDragStart(e, entry.id)}
                            onDragEnd={handleDragEnd}
                            onClick={() => {
                              if (!isTimed) {
                                onFocusUntimedEntry(entry.id);
                              }
                            }}
                            className={`w-full flex items-center gap-1.5 cursor-grab active:cursor-grabbing ${
                              draggedEntryId === entry.id ? 'opacity-40' : ''
                            }`}
                          >
                            <GripVertical className="w-3.5 h-3.5 text-[#586274] shrink-0" />
                            <button
                              type="button"
                              dir="auto"
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditing(entry);
                              }}
                              title={t('chapters.editTitleTooltip')}
                              className={`flex-1 min-w-0 text-start text-sm font-medium truncate cursor-text ${
                                isTimed
                                  ? 'text-[#F3F5F8] hover:text-amber-200'
                                  : 'text-sky-100 hover:text-sky-200'
                              }`}
                            >
                              {entry.title}
                            </button>

                            {/* Row Controls */}
                            <div className="flex items-center gap-0.5 shrink-0 opacity-90 group-hover:opacity-100">
                              {!isTimed && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAssignCurrentTimeToEntry(entry.id);
                                  }}
                                  title={t('chapters.assignCurrentTimeTooltip')}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/35 rounded transition-colors whitespace-nowrap cursor-pointer me-0.5"
                                >
                                  <MapPin className="w-3 h-3" />
                                  {t('chapters.assignCurrentTimeButton')}
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={isTimed ? timedIdx === 0 : entryIdx === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onStepEntryTitle(entry.id, -1);
                                }}
                                title={
                                  isTimed
                                    ? t('chapters.moveTitleUpTooltip')
                                    : t('chapters.moveUpTooltip')
                                }
                                className="p-1 text-[#94A0B2] hover:text-[#F8FAFC] hover:bg-[#242A36] rounded disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={
                                  isTimed
                                    ? timedIdx === timedRows.length - 1
                                    : entryIdx === entries.length - 1
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onStepEntryTitle(entry.id, 1);
                                }}
                                title={
                                  isTimed
                                    ? t('chapters.moveTitleDownTooltip')
                                    : t('chapters.moveDownTooltip')
                                }
                                className="p-1 text-[#94A0B2] hover:text-[#F8FAFC] hover:bg-[#242A36] rounded disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>

                              {/* Existing cascade slide-down button (timed markers) */}
                              {isTimed && timedIdx < timedRows.length - 1 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onShiftTitlesDownFromEntry(entry.id);
                                  }}
                                  title={t('chapters.shiftTitlesDownTooltip')}
                                  className="p-1 text-[#94A0B2] hover:text-amber-300 hover:bg-[#242A36] rounded cursor-pointer"
                                >
                                  <ArrowDownToLine className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Inline insert untimed title right below this row (e.g. insert B2) */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInsertingAtIndex(entryIdx + 1);
                                  setInsertingDraft('');
                                }}
                                title={t('chapters.insertTitleBelowTooltip')}
                                className="p-1 text-[#94A0B2] hover:text-sky-300 hover:bg-[#242A36] rounded cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>

                              {/* Unlink timestamp while preserving title's position */}
                              {isTimed && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUnassignTitle(entry.id);
                                  }}
                                  title={t('chapters.unassignTitleTooltip')}
                                  className="p-1 text-[#94A0B2] hover:text-sky-300 hover:bg-[#242A36] rounded cursor-pointer"
                                >
                                  <Unlink className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteTitle(entry.id);
                                }}
                                title={t('chapters.deleteTitleTooltip')}
                                className="p-1 text-[#94A0B2] hover:text-red-400 hover:bg-[#242A36] rounded cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )
                      ) : addingMarkerId === entry.id ? (
                        <div className="w-full flex items-center gap-1.5">
                          <input
                            type="text"
                            dir="auto"
                            value={addingMarkerDraft}
                            placeholder={t('chapters.enterTitlePlaceholder')}
                            autoFocus
                            onChange={(e) => setAddingMarkerDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                              if (e.key === 'Enter') commitMarkerNewTitle(entry.id);
                              if (e.key === 'Escape') {
                                setAddingMarkerId(null);
                                setAddingMarkerDraft('');
                              }
                            }}
                            className="flex-1 min-w-0 px-2 py-1 text-sm bg-[#0D0F12] border border-amber-400/70 rounded text-[#F8FAFC] placeholder:text-[#566071] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => commitMarkerNewTitle(entry.id)}
                            className="p-1 text-emerald-400 hover:bg-emerald-500/15 rounded cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddingMarkerId(null);
                              setAddingMarkerDraft('');
                            }}
                            className="p-1 text-[#94A0B2] hover:bg-[#232934] rounded cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-full flex items-center justify-between gap-2">
                          <span className="text-xs text-[#5E687A] italic select-none">
                            {isDropHover ? t('chapters.dropToAssign') : t('chapters.noTitleHint')}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setInsertingAtIndex(entryIdx + 1);
                                setInsertingDraft('');
                              }}
                              title={t('chapters.insertTitleBelowTooltip')}
                              className="p-1 text-[#647082] hover:text-sky-300 hover:bg-[#222834] rounded transition-colors cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAddingMarkerId(entry.id);
                                setAddingMarkerDraft('');
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-[#94A0B2] hover:text-[#F8FAFC] hover:bg-[#222834] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              {t('chapters.enterTitleButton')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Inline insert title form triggered right below this row */}
                  {insertingAtIndex === entryIdx + 1 && renderInlineInsertForm(entryIdx + 1)}

                  {isTimed && (
                    <TimelinePlayheadGap
                      active={isGapActiveAfter}
                      progress={gapProgressAfter}
                      currentTimeSec={currentTimeSec}
                      playbackMode={playbackMode}
                      accent="amber"
                    />
                  )}
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>

      {/* Bottom Quick-Add Title Bar (works even with zero markers!) */}
      <div className="border-t border-[#262B34] bg-[#111419] px-3 py-3 shrink-0">
        <form onSubmit={commitBottomNewTitle} className="flex items-center gap-1.5">
          <input
            type="text"
            dir="auto"
            value={newUnassignedDraft}
            onChange={(e) => setNewUnassignedDraft(e.target.value)}
            placeholder={t('chapters.addNewTitlePlaceholder')}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-[#181C24] border border-[#2A313E] focus:border-sky-400/70 rounded text-[#F3F5F8] placeholder:text-[#5E687A] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!newUnassignedDraft.trim()}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[#242B37] hover:bg-[#2F3847] text-[#F3F5F8] rounded disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('common.add')}
          </button>
        </form>
      </div>
    </div>
  );
};
