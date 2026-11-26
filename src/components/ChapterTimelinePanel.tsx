import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Plus,
  Trash2,
  Unlink,
  CornerDownRight,
  Check,
  X,
  Bookmark,
  ArrowDownToLine,
  Wand2,
} from 'lucide-react';
import type { ChapterTitle, Marker, PlaybackMode } from '../types/video';
import { formatTimecodeHMS } from '../utils/timecode';
import { computePlayheadSlot, TimelinePlayheadGap } from './TimelinePlayheadSlot';

interface ChapterTimelinePanelProps {
  markers: Marker[];
  titles: ChapterTitle[];
  currentFrameIndex: number;
  currentTimeSec: number;
  durationSec: number;
  playbackMode: PlaybackMode;
  lastSelectedMarkerId: string | null;
  onSelectMarker: (markerId: string, frameIndex: number) => void;
  onAddMarkerAtCurrent: () => void;
  onDeleteMarker: (markerId: string) => void;
  onAddTitleForMarker: (markerId: string, text: string) => void;
  onAddUnassignedTitle: (text: string) => void;
  onUpdateTitleText: (titleId: string, text: string) => void;
  onDeleteTitle: (titleId: string) => void;
  onUnassignTitle: (titleId: string) => void;
  onMoveOrSwapTitleToMarker: (titleId: string, targetMarkerId: string) => void;
  onStepTitleOnTimeline: (titleId: string, direction: -1 | 1) => void;
  onShiftTitlesDownFromMarker: (startMarkerIndex: number) => void;
  onReorderUnassignedTitle: (titleId: string, direction: -1 | 1) => void;
  onAutoAssignUnassigned: () => void;
}

export const ChapterTimelinePanel: React.FC<ChapterTimelinePanelProps> = ({
  markers,
  titles,
  currentFrameIndex,
  currentTimeSec,
  durationSec,
  playbackMode,
  lastSelectedMarkerId,
  onSelectMarker,
  onAddMarkerAtCurrent,
  onDeleteMarker,
  onAddTitleForMarker,
  onAddUnassignedTitle,
  onUpdateTitleText,
  onDeleteTitle,
  onUnassignTitle,
  onMoveOrSwapTitleToMarker,
  onStepTitleOnTimeline,
  onShiftTitlesDownFromMarker,
  onReorderUnassignedTitle,
  onAutoAssignUnassigned,
}) => {
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [addingMarkerId, setAddingMarkerId] = useState<string | null>(null);
  const [addingMarkerDraft, setAddingMarkerDraft] = useState('');
  const [newUnassignedDraft, setNewUnassignedDraft] = useState('');

  const [draggedTitleId, setDraggedTitleId] = useState<string | null>(null);
  const [dropTargetMarkerId, setDropTargetMarkerId] = useState<string | null>(null);
  const [dropTargetPool, setDropTargetPool] = useState(false);

  const sortedMarkers = [...markers].sort(
    (a, b) => a.timeSec - b.timeSec || a.frameIndex - b.frameIndex
  );

  const titleByMarkerId = new Map<string, ChapterTitle>();
  const unassignedTitles: ChapterTitle[] = [];
  for (const t of titles) {
    if (t.assignedMarkerId) {
      titleByMarkerId.set(t.assignedMarkerId, t);
    } else {
      unassignedTitles.push(t);
    }
  }
  unassignedTitles.sort((a, b) => a.unassignedOrder - b.unassignedOrder);

  const assignedCount = sortedMarkers.filter((m) => titleByMarkerId.has(m.id)).length;
  const emptyMarkerCount = sortedMarkers.length - assignedCount;

  const playheadSlot = computePlayheadSlot(
    sortedMarkers,
    currentFrameIndex,
    currentTimeSec,
    durationSec,
    1
  );

  const startEditing = (title: ChapterTitle) => {
    setEditingTitleId(title.id);
    setEditingDraft(title.text);
  };

  const commitEditing = () => {
    if (editingTitleId) {
      const trimmed = editingDraft.trim();
      if (trimmed.length > 0) {
        onUpdateTitleText(editingTitleId, trimmed);
      }
    }
    setEditingTitleId(null);
    setEditingDraft('');
  };

  const commitMarkerNewTitle = (markerId: string) => {
    const trimmed = addingMarkerDraft.trim();
    if (trimmed.length > 0) {
      onAddTitleForMarker(markerId, trimmed);
    }
    setAddingMarkerId(null);
    setAddingMarkerDraft('');
  };

  const commitUnassignedNewTitle = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newUnassignedDraft.trim();
    if (!trimmed) return;
    onAddUnassignedTitle(trimmed);
    setNewUnassignedDraft('');
  };

  const handleDragStart = (e: React.DragEvent, titleId: string) => {
    setDraggedTitleId(titleId);
    e.dataTransfer.setData('text/plain', titleId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedTitleId(null);
    setDropTargetMarkerId(null);
    setDropTargetPool(false);
  };

  const handleDropOnMarker = (e: React.DragEvent, targetMarkerId: string) => {
    e.preventDefault();
    const titleId = draggedTitleId || e.dataTransfer.getData('text/plain');
    setDropTargetMarkerId(null);
    setDraggedTitleId(null);
    if (titleId) {
      onMoveOrSwapTitleToMarker(titleId, targetMarkerId);
    }
  };

  const handleDropOnPool = (e: React.DragEvent) => {
    e.preventDefault();
    const titleId = draggedTitleId || e.dataTransfer.getData('text/plain');
    setDropTargetPool(false);
    setDraggedTitleId(null);
    if (titleId) {
      onUnassignTitle(titleId);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sub-header summary */}
      <div className="px-4 py-3 border-b border-[#222731] flex items-center justify-between gap-2 shrink-0">
        <div className="text-xs text-[#94A0B2] flex items-center gap-2 font-mono-tabular">
          <span>マーク {sortedMarkers.length}</span>
          <span aria-hidden="true" className="text-[#454E5E]">·</span>
          <span>割当済 {assignedCount}</span>
          <span aria-hidden="true" className="text-[#454E5E]">·</span>
          <span>未割当 {unassignedTitles.length}</span>
        </div>
        <button
          type="button"
          onClick={onAddMarkerAtCurrent}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          現在位置をマーク
        </button>
      </div>

      {/* Scrollable Vertical Marker Timeline & Matching Lane */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-1.5">
        {sortedMarkers.length === 0 ? (
          <div className="my-1.5 py-10 px-4 text-center border border-dashed border-[#272D38] rounded-lg bg-[#111419]">
            <Bookmark className="w-6 h-6 text-[#647082] mx-auto mb-2.5" />
            <p className="text-sm font-medium text-[#E2E8F0]">マーカーがまだありません</p>
            <p className="mt-1.5 text-xs text-[#94A0B2] leading-relaxed">
              動画をシークして <kbd className="font-mono-tabular text-[#E2E8F0]">M</kbd> キーまたは「現在位置にマーク追加」を押すと、縦軸タイムラインに時間が追加されます。
            </p>
            <button
              type="button"
              onClick={onAddMarkerAtCurrent}
              className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0D0F12] bg-amber-400 hover:bg-amber-300 rounded-md transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              最初のマーカーを追加
            </button>
          </div>
        ) : (
          <>
            <TimelinePlayheadGap
              active={playheadSlot.kind === 'before-first'}
              progress={playheadSlot.kind === 'before-first' ? playheadSlot.progress : 0}
              currentTimeSec={currentTimeSec}
              playbackMode={playbackMode}
              accent="amber"
            />
            {sortedMarkers.map((marker, idx) => {
              const assignedTitle = titleByMarkerId.get(marker.id) ?? null;
              const isCurrent =
                playheadSlot.kind === 'on-item' && playheadSlot.index === idx;
              const isLastSelected = lastSelectedMarkerId === marker.id;
              const isDropHover = dropTargetMarkerId === marker.id;
              const isGapActiveAfter =
                (playheadSlot.kind === 'between' && playheadSlot.afterIndex === idx) ||
                (playheadSlot.kind === 'after-last' && idx === sortedMarkers.length - 1);
              const gapProgressAfter =
                playheadSlot.kind === 'between' && playheadSlot.afterIndex === idx
                  ? playheadSlot.progress
                  : playheadSlot.kind === 'after-last' && idx === sortedMarkers.length - 1
                    ? playheadSlot.progress
                    : 0;

              return (
                <React.Fragment key={marker.id}>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dropTargetMarkerId !== marker.id) {
                        setDropTargetMarkerId(marker.id);
                      }
                    }}
                    onDragLeave={() => {
                      if (dropTargetMarkerId === marker.id) {
                        setDropTargetMarkerId(null);
                      }
                    }}
                    onDrop={(e) => handleDropOnMarker(e, marker.id)}
                    className={`group flex items-stretch gap-2 rounded-md border transition-colors ${
                      isDropHover
                        ? 'border-amber-400 bg-amber-500/15'
                        : isCurrent
                          ? 'border-amber-400/80 bg-[#1B202A]'
                          : isLastSelected
                            ? 'border-dashed border-amber-400/80 bg-amber-500/[0.08] hover:border-amber-400'
                            : 'border-[#232833] bg-[#14171D] hover:border-[#303745]'
                    }`}
                  >
                    {/* Left Column: Chronological Marker Timestamp & Seek Trigger */}
                    <div
                      className={`w-[126px] shrink-0 flex flex-col justify-between p-2 border-r rounded-l-md transition-colors ${
                        isCurrent
                          ? 'border-amber-400/35 bg-amber-500/[0.12]'
                          : isLastSelected
                            ? 'border-amber-400/25 bg-amber-500/[0.09]'
                            : 'border-[#222731] bg-[#111419]/70'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectMarker(marker.id, marker.frameIndex)}
                        title={`クリックして ${formatTimecodeHMS(marker.timeSec)} (フレーム #${marker.frameIndex}) へシーク`}
                        className="text-left group/seek cursor-pointer"
                      >
                        <div
                          className={`font-mono-tabular text-sm font-bold leading-tight transition-colors ${
                            isCurrent
                              ? 'text-amber-400'
                              : isLastSelected
                                ? 'text-amber-200 group-hover/seek:text-amber-100'
                                : 'text-[#F3F5F8] group-hover/seek:text-amber-300'
                          }`}
                        >
                          {formatTimecodeHMS(marker.timeSec)}
                        </div>
                        <div className="font-mono-tabular text-[11px] text-[#647082] mt-0.5">
                          #{marker.frameIndex}
                        </div>
                      </button>

                      <div className="mt-1.5 flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`font-mono-tabular text-[10px] ${
                              isCurrent || isLastSelected ? 'text-amber-400/90 font-semibold' : 'text-[#566071]'
                            }`}
                          >
                            M{String(idx + 1).padStart(2, '0')}
                          </span>
                          {isLastSelected && !isCurrent && (
                            <span className="text-[10px] font-medium text-amber-300/90 whitespace-nowrap">
                              選択位置
                            </span>
                          )}
                          {isCurrent && (
                            <span className="text-[10px] font-semibold text-amber-300 whitespace-nowrap">
                              現在位置
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteMarker(marker.id)}
                          title="このマーカーを削除（割当中のタイトルは未割当リストへ移動します）"
                          className="p-0.5 text-[#647082] hover:text-red-400 transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                {/* Right Column: Assigned Chapter Title OR Empty Droppable Slot */}
                <div className="flex-1 min-w-0 p-2 flex items-center">
                  {assignedTitle ? (
                    editingTitleId === assignedTitle.id ? (
                      <div className="w-full flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editingDraft}
                          autoFocus
                          onChange={(e) => setEditingDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEditing();
                            if (e.key === 'Escape') {
                              setEditingTitleId(null);
                              setEditingDraft('');
                            }
                          }}
                          className="flex-1 min-w-0 px-2 py-1 text-sm bg-[#0D0F12] border border-amber-400/70 rounded text-[#F8FAFC] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={commitEditing}
                          title="保存"
                          className="p-1 text-emerald-400 hover:bg-emerald-500/15 rounded cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTitleId(null);
                            setEditingDraft('');
                          }}
                          title="キャンセル"
                          className="p-1 text-[#94A0B2] hover:bg-[#232934] rounded cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div
                        draggable
                        onDragStart={(e) => handleDragStart(e, assignedTitle.id)}
                        onDragEnd={handleDragEnd}
                        className={`w-full flex items-center gap-2 cursor-grab active:cursor-grabbing ${
                          draggedTitleId === assignedTitle.id ? 'opacity-40' : ''
                        }`}
                      >
                        <GripVertical className="w-3.5 h-3.5 text-[#586274] shrink-0" />
                        <button
                          type="button"
                          onClick={() => startEditing(assignedTitle)}
                          title="クリックしてタイトルを編集 / ドラッグして別の時間へ移動・入れ替え"
                          className="flex-1 min-w-0 text-left text-sm font-medium text-[#F3F5F8] hover:text-amber-200 truncate cursor-text"
                        >
                          {assignedTitle.text}
                        </button>

                        {/* Row-level title movement / shift / detach / delete controls */}
                        <div className="flex items-center gap-0.5 shrink-0 opacity-85 group-hover:opacity-100">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => onStepTitleOnTimeline(assignedTitle.id, -1)}
                            title="上のマーカーへ移動（タイトルがある場合は入れ替え）"
                            className="p-1 text-[#94A0B2] hover:text-[#F8FAFC] hover:bg-[#242A36] rounded disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === sortedMarkers.length - 1}
                            onClick={() => onStepTitleOnTimeline(assignedTitle.id, 1)}
                            title="下のマーカーへ移動（タイトルがある場合は入れ替え）"
                            className="p-1 text-[#94A0B2] hover:text-[#F8FAFC] hover:bg-[#242A36] rounded disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          {idx < sortedMarkers.length - 1 && (
                            <button
                              type="button"
                              onClick={() => onShiftTitlesDownFromMarker(idx)}
                              title="この行以降のタイトルをすべて1つ下のマーカーへシフト"
                              className="p-1 text-[#94A0B2] hover:text-amber-300 hover:bg-[#242A36] rounded cursor-pointer"
                            >
                              <ArrowDownToLine className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onUnassignTitle(assignedTitle.id)}
                            title="割当解除（未割当リストへ戻す）"
                            className="p-1 text-[#94A0B2] hover:text-sky-300 hover:bg-[#242A36] rounded cursor-pointer"
                          >
                            <Unlink className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteTitle(assignedTitle.id)}
                            title="タイトルを削除（マーカーは残ります）"
                            className="p-1 text-[#94A0B2] hover:text-red-400 hover:bg-[#242A36] rounded cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  ) : addingMarkerId === marker.id ? (
                    <div className="w-full flex items-center gap-1.5">
                      <input
                        type="text"
                        value={addingMarkerDraft}
                        placeholder="チャプタータイトルを入力..."
                        autoFocus
                        onChange={(e) => setAddingMarkerDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitMarkerNewTitle(marker.id);
                          if (e.key === 'Escape') {
                            setAddingMarkerId(null);
                            setAddingMarkerDraft('');
                          }
                        }}
                        className="flex-1 min-w-0 px-2 py-1 text-sm bg-[#0D0F12] border border-amber-400/70 rounded text-[#F8FAFC] placeholder:text-[#566071] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => commitMarkerNewTitle(marker.id)}
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
                        {isDropHover ? 'ここにドロップして割当' : 'タイトルなし（ドラッグで割当可）'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingMarkerId(marker.id);
                          setAddingMarkerDraft('');
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-[#94A0B2] hover:text-[#F8FAFC] hover:bg-[#222834] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        タイトル入力
                      </button>
                    </div>
                  )}
                </div>
              </div>
                  <TimelinePlayheadGap
                    active={isGapActiveAfter}
                    progress={gapProgressAfter}
                    currentTimeSec={currentTimeSec}
                    playbackMode={playbackMode}
                    accent="amber"
                  />
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>

      {/* Unassigned Chapter Titles Pool (Type A imports, detached titles, manual queue) */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!dropTargetPool) setDropTargetPool(true);
        }}
        onDragLeave={() => setDropTargetPool(false)}
        onDrop={handleDropOnPool}
        className={`border-t border-[#262B34] bg-[#111419] px-3 py-3 shrink-0 transition-colors ${
          dropTargetPool ? 'bg-sky-500/10 border-t-sky-400' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-xs font-medium text-[#CBD5E1]">
            未割当チャプタータイトル ({unassignedTitles.length})
          </div>
          {unassignedTitles.length > 0 && emptyMarkerCount > 0 && (
            <button
              type="button"
              onClick={onAutoAssignUnassigned}
              title="未割当タイトルを上から順に、タイトル未設定のマーカーへ割り当てます"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 rounded transition-colors whitespace-nowrap cursor-pointer"
            >
              <Wand2 className="w-3 h-3" />
              空きマーカーへ自動割当
            </button>
          )}
        </div>

        {unassignedTitles.length > 0 && (
          <div className="max-h-36 overflow-y-auto space-y-1 mb-2.5 pr-0.5">
            {unassignedTitles.map((title, uIdx) => (
              <div
                key={title.id}
                draggable
                onDragStart={(e) => handleDragStart(e, title.id)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded bg-[#181C24] border border-[#262C38] hover:border-[#3A4354] cursor-grab active:cursor-grabbing ${
                  draggedTitleId === title.id ? 'opacity-40' : ''
                }`}
              >
                <GripVertical className="w-3.5 h-3.5 text-[#586274] shrink-0" />
                {editingTitleId === title.id ? (
                  <div className="flex-1 flex items-center gap-1 min-w-0">
                    <input
                      type="text"
                      value={editingDraft}
                      autoFocus
                      onChange={(e) => setEditingDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEditing();
                        if (e.key === 'Escape') {
                          setEditingTitleId(null);
                          setEditingDraft('');
                        }
                      }}
                      className="flex-1 min-w-0 px-1.5 py-0.5 text-xs bg-[#0D0F12] border border-amber-400/70 rounded text-[#F8FAFC] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={commitEditing}
                      className="p-0.5 text-emerald-400 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEditing(title)}
                    className="flex-1 min-w-0 text-left text-xs text-[#E2E8F0] hover:text-amber-200 truncate cursor-text"
                  >
                    {title.text}
                  </button>
                )}

                <div className="flex items-center gap-0.5 shrink-0">
                  {emptyMarkerCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const firstEmpty = sortedMarkers.find((m) => !titleByMarkerId.has(m.id));
                        if (firstEmpty) {
                          onMoveOrSwapTitleToMarker(title.id, firstEmpty.id);
                        }
                      }}
                      title="先頭の空きマーカーに割り当て"
                      className="p-1 text-[#94A0B2] hover:text-amber-300 rounded cursor-pointer"
                    >
                      <CornerDownRight className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={uIdx === 0}
                    onClick={() => onReorderUnassignedTitle(title.id, -1)}
                    title="上へ移動"
                    className="p-1 text-[#94A0B2] hover:text-[#F8FAFC] disabled:opacity-30 rounded cursor-pointer"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={uIdx === unassignedTitles.length - 1}
                    onClick={() => onReorderUnassignedTitle(title.id, 1)}
                    title="下へ移動"
                    className="p-1 text-[#94A0B2] hover:text-[#F8FAFC] disabled:opacity-30 rounded cursor-pointer"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTitle(title.id)}
                    title="削除"
                    className="p-1 text-[#94A0B2] hover:text-red-400 rounded cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick add title row */}
        <form onSubmit={commitUnassignedNewTitle} className="flex items-center gap-1.5">
          <input
            type="text"
            value={newUnassignedDraft}
            onChange={(e) => setNewUnassignedDraft(e.target.value)}
            placeholder="新しいチャプタータイトルを追加..."
            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-[#181C24] border border-[#2A313E] focus:border-amber-400/70 rounded text-[#F3F5F8] placeholder:text-[#5E687A] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!newUnassignedDraft.trim()}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[#242B37] hover:bg-[#2F3847] text-[#F3F5F8] rounded disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            追加
          </button>
        </form>
      </div>
    </div>
  );
};
