import { createFeatureSelector, createSelector } from '@ngrx/store';
import { TimetableState } from '../types/timetable';
import { applyDraft, computeConflicts, filterTrains } from '../utils/timetable-utils';

export const selectTimetableState = createFeatureSelector<TimetableState>('timetable');

/** 已发布版本（现行调度）——分析页、导出、打印都读它 */
export const selectPublishedNetwork = createSelector(
  selectTimetableState,
  (state) => state.publishedNetwork,
);
export const selectDraft = createSelector(selectTimetableState, (state) => state.draft);
export const selectHasDraft = createSelector(selectDraft, (draft) => draft.length > 0);
export const selectPublishError = createSelector(selectTimetableState, (state) => state.publishError);
export const selectLastPublishedAt = createSelector(
  selectTimetableState,
  (state) => state.lastPublishedAt,
);

/** 预演网络 = 已发布网络应用预演批次后的结果（只在画布预演里生效） */
export const selectPreviewNetwork = createSelector(
  selectPublishedNetwork,
  selectDraft,
  (publishedNetwork, draft) => applyDraft(publishedNetwork, draft),
);

/** selectNetwork 始终指向已发布版本，供分析/导出/打印读取 */
export const selectNetwork = selectPublishedNetwork;

export const selectFilter = createSelector(selectTimetableState, (state) => state.filter);
export const selectViewport = createSelector(selectTimetableState, (state) => state.viewport);
export const selectSelectedTrainId = createSelector(selectTimetableState, (state) => state.selectedTrainId);
export const selectBatchSelection = createSelector(selectTimetableState, (state) => state.batchSelection);
export const selectPrintSectionId = createSelector(selectTimetableState, (state) => state.printSectionId);
export const selectNotices = createSelector(selectTimetableState, (state) => state.notices);

/** 预演中按筛选可见的列车（画布与冲突建议按筛选结果） */
export const selectVisibleTrains = createSelector(
  selectPreviewNetwork,
  selectFilter,
  (network, filter) => filterTrains(network, filter.query, filter.categories, filter.direction),
);

export const selectSelectedTrain = createSelector(
  selectPreviewNetwork,
  selectSelectedTrainId,
  (network, trainId) => network.trains.find((train) => train.id === trainId) ?? null,
);

/** 预演冲突：按筛选可见列车（编辑器画布与建议） */
export const selectPreviewConflicts = createSelector(
  selectPreviewNetwork,
  selectVisibleTrains,
  (network, visible) => computeConflicts(network, new Set(visible.map((train) => train.id))),
);

/** 已发布冲突：全图重算，隐藏的车也参与（分析页、打印、现行调度监控） */
export const selectPublishedConflicts = createSelector(selectPublishedNetwork, (network) =>
  computeConflicts(network),
);

/** 预演全图冲突：发布前校验用，隐藏的车也参与 */
export const selectFullPreviewConflicts = createSelector(selectPreviewNetwork, (network) =>
  computeConflicts(network),
);

/** selectConflicts 别名指向预演冲突，供编辑器使用 */
export const selectConflicts = selectPreviewConflicts;

function summarize(conflicts: ReturnType<typeof computeConflicts>) {
  return {
    total: conflicts.length,
    danger: conflicts.filter((conflict) => conflict.severity === 'danger').length,
    warning: conflicts.filter((conflict) => conflict.severity === 'warning').length,
    headway: conflicts.filter((conflict) => conflict.type === 'headway').length,
    track: conflicts.filter((conflict) => conflict.type === 'track').length,
    overtake: conflicts.filter((conflict) => conflict.type === 'overtake').length,
  };
}

export const selectPreviewConflictSummary = createSelector(selectPreviewConflicts, summarize);
export const selectPublishedConflictSummary = createSelector(selectPublishedConflicts, summarize);

/** selectConflictSummary 别名指向预演摘要，供编辑器工具栏使用 */
export const selectConflictSummary = selectPreviewConflictSummary;

export const selectSelectedConflicts = createSelector(
  selectPreviewConflicts,
  selectSelectedTrainId,
  (conflicts, trainId) => trainId
    ? conflicts.filter((conflict) => conflict.trainIds.includes(trainId)).slice(0, 60)
    : conflicts.slice(0, 60),
);
