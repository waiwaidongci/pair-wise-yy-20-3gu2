import { createReducer, on } from '@ngrx/store';
import {
  DraftChange,
  TimetableState,
  ViewportState,
} from '../types/timetable';
import {
  addNotice,
  batchShift,
  clearBatchSelection,
  discardDraft,
  dismissNotice,
  importNetwork,
  moveTrain,
  publishDraft,
  resetViewport,
  restorePersistedState,
  selectTrain,
  setPrintSection,
  shiftBaseline,
  toggleBatchTrain,
  updateFilter,
  updateTrainStop,
  updateViewport,
} from './timetable.actions';
import {
  applyDraft,
  computeConflicts,
  createMockNetwork,
  shiftAllTrains,
} from '../utils/timetable-utils';

const INITIAL_VIEWPORT: ViewportState = {
  scaleX: 1.25,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
};

export const initialState: TimetableState = {
  publishedNetwork: createMockNetwork(),
  draft: [],
  filter: {
    query: '',
    categories: [],
    direction: 'all',
  },
  viewport: INITIAL_VIEWPORT,
  selectedTrainId: 'T1',
  batchSelection: [],
  printSectionId: null,
  notices: [],
  publishError: null,
  lastPublishedAt: null,
};

/** 预演批次最多保留的调整条数（超出则合并压缩）。 */
const MAX_DRAFT_CHANGES = 400;

function appendDraft(state: TimetableState, change: DraftChange): TimetableState {
  const draft = [...state.draft, change].slice(-MAX_DRAFT_CHANGES);
  return { ...state, draft, publishError: null };
}

export const timetableReducer = createReducer(
  initialState,
  on(selectTrain, (state, { trainId }) => ({
    ...state,
    selectedTrainId: trainId,
  })),
  on(toggleBatchTrain, (state, { trainId }) => ({
    ...state,
    batchSelection: state.batchSelection.includes(trainId)
      ? state.batchSelection.filter((id) => id !== trainId)
      : [...state.batchSelection, trainId],
  })),
  on(clearBatchSelection, (state) => ({ ...state, batchSelection: [] })),
  on(updateFilter, (state, { filter }) => ({
    ...state,
    filter: { ...state.filter, ...filter },
  })),
  on(updateViewport, (state, { viewport }) => ({
    ...state,
    viewport: { ...state.viewport, ...viewport },
  })),
  on(resetViewport, (state) => ({ ...state, viewport: INITIAL_VIEWPORT })),
  // —— 以下调整只进入预演批次，不触碰已发布网络 ——
  on(moveTrain, (state, { trainId, deltaMinutes }) =>
    appendDraft(state, { kind: 'shift', trainId, deltaMinutes }),
  ),
  on(batchShift, (state, { deltaMinutes }) => {
    const ids = state.batchSelection.length > 0
      ? state.batchSelection
      : state.selectedTrainId
        ? [state.selectedTrainId]
        : [];
    if (ids.length === 0) return state;
    const additions: DraftChange[] = ids.map((trainId) => ({
      kind: 'shift',
      trainId,
      deltaMinutes,
    }));
    return { ...state, draft: [...state.draft, ...additions].slice(-MAX_DRAFT_CHANGES), publishError: null };
  }),
  on(updateTrainStop, (state, { trainId, stationId, changes }) =>
    appendDraft(state, { kind: 'stop', trainId, stationId, changes }),
  ),
  on(setPrintSection, (state, { sectionId }) => ({ ...state, printSectionId: sectionId })),
  // —— 提交发布：对预演网络全图重算（隐藏车也参与），严重冲突则回滚 ——
  on(publishDraft, (state) => {
    if (state.draft.length === 0) return state;
    const previewNetwork = applyDraft(state.publishedNetwork, state.draft);
    const fullConflicts = computeConflicts(previewNetwork);
    const dangerCount = fullConflicts.filter((conflict) => conflict.severity === 'danger').length;
    if (dangerCount > 0) {
      return {
        ...state,
        publishError: `发布失败：预演网络全图重算发现 ${dangerCount} 项严重冲突，已回滚，现行调度保持不变。`,
        notices: [
          ...state.notices,
          `发布失败：全图重算发现 ${dangerCount} 项严重冲突（区间追踪/到发线占用/越行），已回滚至现行调度。`,
        ],
      };
    }
    const warningCount = fullConflicts.length;
    return {
      ...state,
      publishedNetwork: previewNetwork,
      draft: [],
      publishError: null,
      lastPublishedAt: Date.now(),
      notices: [
        ...state.notices,
        `运行图已发布：全图校验通过（${warningCount} 项预警/冲突已记录），现行调度已更新。`,
      ],
    };
  }),
  on(discardDraft, (state) => ({
    ...state,
    draft: [],
    publishError: null,
  })),
  // —— 导入替换或基准时刻改动后，旧批次立刻失效 ——
  on(importNetwork, (state, { network }) => ({
    ...state,
    publishedNetwork: network,
    draft: [],
    publishError: null,
    selectedTrainId: network.trains[0]?.id ?? null,
    batchSelection: [],
    viewport: INITIAL_VIEWPORT,
    notices: [...state.notices, `已导入 ${network.trains.length} 趟列车、${network.stations.length} 个车站，未发布的预演批次已失效`],
  })),
  on(shiftBaseline, (state, { deltaMinutes }) => ({
    ...state,
    publishedNetwork: shiftAllTrains(state.publishedNetwork, deltaMinutes),
    draft: [],
    publishError: null,
    notices: [...state.notices, `基准时刻已平移 ${deltaMinutes > 0 ? '+' : ''}${deltaMinutes} 分，旧预演批次已失效`],
  })),
  on(addNotice, (state, { message }) => ({ ...state, notices: [...state.notices, message] })),
  on(dismissNotice, (state, { index }) => ({
    ...state,
    notices: state.notices.filter((_, noticeIndex) => noticeIndex !== index),
  })),
  on(restorePersistedState, (state, { state: persisted }) => ({
    ...state,
    filter: persisted.filter ? { ...state.filter, ...persisted.filter } : state.filter,
    viewport: persisted.viewport ? { ...state.viewport, ...persisted.viewport } : state.viewport,
  })),
);
