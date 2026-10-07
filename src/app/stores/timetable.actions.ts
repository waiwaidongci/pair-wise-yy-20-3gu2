import { createAction, props } from '@ngrx/store';
import {
  DraftTrain,
  PublishValidation,
  TimetableFilter,
  TrainNetwork,
  TrainStop,
  ViewportState,
} from '../types/timetable';

export const selectTrain = createAction('[Timetable] Select train', props<{ trainId: string | null }>());
export const toggleBatchTrain = createAction('[Timetable] Toggle batch train', props<{ trainId: string }>());
export const clearBatchSelection = createAction('[Timetable] Clear batch selection');
export const updateFilter = createAction('[Timetable] Update filter', props<{ filter: Partial<TimetableFilter> }>());
export const updateViewport = createAction('[Timetable] Update viewport', props<{ viewport: Partial<ViewportState> }>());
export const resetViewport = createAction('[Timetable] Reset viewport');

// —— 以下调整只进入待发布批次，在预演中生效，不改动现行调度 ——
export const moveTrain = createAction(
  '[Timetable] Stage train move',
  props<{ trainId: string; deltaMinutes: number }>(),
);
export const batchShift = createAction('[Timetable] Stage batch shift', props<{ deltaMinutes: number }>());
export const updateTrainStop = createAction(
  '[Timetable] Update train stop',
  props<{ trainId: string; stationId: string; changes: Partial<TrainStop> }>(),
);
export const discardDraft = createAction('[Timetable] Discard draft', props<{ trainId: string }>());
export const discardAllDrafts = createAction('[Timetable] Discard all drafts');

// —— 批次发布：提交时对全图重算（隐藏的车也参与） ——
export const publishBatch = createAction('[Timetable] Publish batch');
export const publishBatchSuccess = createAction(
  '[Timetable] Publish batch success',
  props<{ network: TrainNetwork; publishedAt: number; validation: PublishValidation }>(),
);
export const publishBatchFailure = createAction(
  '[Timetable] Publish batch failure',
  props<{ error: string }>(),
);

// —— 运行图被导入数据替换或基准时刻改动：旧批次立即失效 ——
export const adjustBaseTime = createAction('[Timetable] Adjust base time', props<{ deltaMinutes: number }>());

export const setPrintSection = createAction('[Timetable] Set print section', props<{ sectionId: string | null }>());
export const importNetwork = createAction('[Timetable] Import network', props<{ network: TrainNetwork }>());
export const addNotice = createAction('[Timetable] Add notice', props<{ message: string; severity?: 'success' | 'error' }>());
export const dismissNotice = createAction('[Timetable] Dismiss notice', props<{ index: number }>());
export const restorePersistedState = createAction(
  '[Timetable] Restore persisted state',
  props<{ state: Partial<Pick<TimetableStatePayload, 'filter' | 'viewport'>> }>(),
);

interface TimetableStatePayload {
  filter: TimetableFilter;
  viewport: ViewportState;
}

export type { DraftTrain };
