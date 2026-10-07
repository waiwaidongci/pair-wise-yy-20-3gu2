import { createFeatureSelector, createSelector } from '@ngrx/store';
import { DraftTrain, TimetableState, TrainNetwork } from '../types/timetable';
import { computeConflicts, filterTrains, mergeDrafts } from '../utils/timetable-utils';

export const selectTimetableState = createFeatureSelector<TimetableState>('timetable');

/** 现行（已发布）运行图：分析页、导出、打印只读取这一版 */
export const selectPublishedNetwork = createSelector(
  selectTimetableState,
  (state) => state.publishedNetwork,
);
/** 向后兼容：网络类选择器默认指向现行版本 */
export const selectNetwork = selectPublishedNetwork;

export const selectDraftTrains = createSelector(
  selectTimetableState,
  (state) => state.draftTrains,
);
export const selectBaselineRevision = createSelector(
  selectTimetableState,
  (state) => state.baselineRevision,
);
export const selectPublishedAt = createSelector(selectTimetableState, (state) => state.publishedAt);
export const selectBaseTimeOffsetMin = createSelector(
  selectTimetableState,
  (state) => state.baseTimeOffsetMin,
);
export const selectPublishStatus = createSelector(
  selectTimetableState,
  (state) => state.publishStatus,
);
export const selectPublishError = createSelector(
  selectTimetableState,
  (state) => state.publishError,
);
export const selectPublishedValidation = createSelector(
  selectTimetableState,
  (state) => state.publishedValidation,
);

/** 预演图：现行图叠加待发布批次，仅编辑器预览使用 */
export const selectPreviewNetwork = createSelector(
  selectPublishedNetwork,
  selectDraftTrains,
  (published, drafts): TrainNetwork => mergeDrafts(published, drafts),
);

export const selectFilter = createSelector(selectTimetableState, (state) => state.filter);
export const selectViewport = createSelector(selectTimetableState, (state) => state.viewport);
export const selectSelectedTrainId = createSelector(selectTimetableState, (state) => state.selectedTrainId);
export const selectBatchSelection = createSelector(selectTimetableState, (state) => state.batchSelection);
export const selectPrintSectionId = createSelector(selectTimetableState, (state) => state.printSectionId);
export const selectNotices = createSelector(selectTimetableState, (state) => state.notices);

/** 预演图按筛选结果展示的列车（含草稿改动） */
export const selectVisibleTrains = createSelector(
  selectPreviewNetwork,
  selectFilter,
  (network, filter) => filterTrains(network, filter.query, filter.categories, filter.direction),
);

/** 已发布版本中的选中列车（预演覆盖由编辑页单独叠加） */
export const selectPublishedSelectedTrain = createSelector(
  selectPublishedNetwork,
  selectSelectedTrainId,
  (network, trainId) => network.trains.find((train) => train.id === trainId) ?? null,
);

/** 预演版本中的选中列车 */
export const selectSelectedTrain = createSelector(
  selectPreviewNetwork,
  selectSelectedTrainId,
  (network, trainId) => network.trains.find((train) => train.id === trainId) ?? null,
);

export const selectSelectedDraft = createSelector(
  selectDraftTrains,
  selectSelectedTrainId,
  (drafts, trainId): DraftTrain | null => (trainId ? drafts[trainId] ?? null : null),
);

/**
 * 编辑器预演冲突：按筛选结果计算，调度员据此调整批次。
 * 与提交时的全图重算不同，这里只看当前筛选可见的列车。
 */
export const selectConflicts = createSelector(
  selectPreviewNetwork,
  selectVisibleTrains,
  (network, visible) => computeConflicts(network, new Set(visible.map((train) => train.id))),
);

/** 现行版本的全量冲突（隐藏的车也参与），供分析页与安全监控读取 */
export const selectPublishedConflicts = createSelector(
  selectPublishedValidation,
  (validation) => validation.conflicts,
);

export const selectConflictSummary = createSelector(selectConflicts, (conflicts) => ({
  total: conflicts.length,
  danger: conflicts.filter((conflict) => conflict.severity === 'danger').length,
  warning: conflicts.filter((conflict) => conflict.severity === 'warning').length,
  headway: conflicts.filter((conflict) => conflict.type === 'headway').length,
  track: conflicts.filter((conflict) => conflict.type === 'track').length,
  overtake: conflicts.filter((conflict) => conflict.type === 'overtake').length,
}));

/** 安全监控（页头/分析页）读取现行已发布版本 */
export const selectPublishedConflictSummary = createSelector(selectPublishedConflicts, (conflicts) => ({
  total: conflicts.length,
  danger: conflicts.filter((conflict) => conflict.severity === 'danger').length,
  warning: conflicts.filter((conflict) => conflict.severity === 'warning').length,
  headway: conflicts.filter((conflict) => conflict.type === 'headway').length,
  track: conflicts.filter((conflict) => conflict.type === 'track').length,
  overtake: conflicts.filter((conflict) => conflict.type === 'overtake').length,
}));

export const selectSelectedConflicts = createSelector(
  selectConflicts,
  selectSelectedTrainId,
  (conflicts, trainId) => trainId
    ? conflicts.filter((conflict) => conflict.trainIds.includes(trainId)).slice(0, 60)
    : conflicts.slice(0, 60),
);

export const selectBatchSummary = createSelector(selectDraftTrains, (drafts) => {
  const entries = Object.values(drafts);
  return {
    trainCount: entries.length,
    changeCount: entries.reduce((total, entry) => total + entry.changes.length, 0),
  };
});
