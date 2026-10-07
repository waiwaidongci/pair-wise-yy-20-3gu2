import { createReducer, on } from '@ngrx/store';
import {
  TimetableState,
  TrainNetwork,
  ViewportState,
} from '../types/timetable';
import {
  adjustBaseTime,
  addNotice,
  batchShift,
  clearBatchSelection,
  discardAllDrafts,
  discardDraft,
  dismissNotice,
  importNetwork,
  moveTrain,
  publishBatch,
  publishBatchFailure,
  publishBatchSuccess,
  resetViewport,
  restorePersistedState,
  selectTrain,
  setPrintSection,
  toggleBatchTrain,
  updateFilter,
  updateTrainStop,
  updateViewport,
} from './timetable.actions';
import {
  createMockNetwork,
  shiftTrain,
  stageShift,
  stageStopChange,
  validateFullNetwork,
} from '../utils/timetable-utils';

const INITIAL_VIEWPORT: ViewportState = {
  scaleX: 1.25,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
};

function pushNotice(notices: string[], message: string): string[] {
  return [...notices, message].slice(-8);
}

const bootstrapNetwork = createMockNetwork();
const bootstrapValidation = validateFullNetwork(bootstrapNetwork);

export const initialState: TimetableState = {
  publishedNetwork: bootstrapNetwork,
  draftTrains: {},
  baselineRevision: 1,
  publishedAt: Date.now(),
  baseTimeOffsetMin: 0,
  publishStatus: 'idle',
  publishError: null,
  publishedValidation: bootstrapValidation,
  filter: {
    query: '',
    categories: [],
    direction: 'all',
  },
  viewport: INITIAL_VIEWPORT,
  selectedTrainId: bootstrapNetwork.trains[0]?.id ?? null,
  batchSelection: [],
  printSectionId: null,
  notices: [],
};

export const timetableReducer = createReducer(
  initialState,
  on(selectTrain, (state, { trainId }) => ({ ...state, selectedTrainId: trainId })),
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

  // —— 调整只进入待发布批次，现行运行图保持不变 ——
  on(moveTrain, (state, { trainId, deltaMinutes }) => {
    const publishedTrain = state.publishedNetwork.trains.find((train) => train.id === trainId);
    if (!publishedTrain || !deltaMinutes) return state;
    const next = stageShift(state.draftTrains[trainId], publishedTrain, deltaMinutes);
    const draftTrains = { ...state.draftTrains };
    if (next.changes.length === 0) {
      delete draftTrains[trainId];
    } else {
      draftTrains[trainId] = next;
    }
    return { ...state, draftTrains, publishStatus: 'idle', publishError: null };
  }),
  on(batchShift, (state, { deltaMinutes }) => {
    const ids = state.batchSelection.length > 0
      ? new Set(state.batchSelection)
      : new Set(state.selectedTrainId ? [state.selectedTrainId] : []);
    if (ids.size === 0 || !deltaMinutes) return state;
    const draftTrains = { ...state.draftTrains };
    state.publishedNetwork.trains.forEach((train) => {
      if (!ids.has(train.id)) return;
      const next = stageShift(draftTrains[train.id], train, deltaMinutes);
      if (next.changes.length === 0) {
        delete draftTrains[train.id];
      } else {
        draftTrains[train.id] = next;
      }
    });
    return { ...state, draftTrains, publishStatus: 'idle', publishError: null };
  }),
  on(updateTrainStop, (state, { trainId, stationId, changes }) => {
    const publishedTrain = state.publishedNetwork.trains.find((train) => train.id === trainId);
    if (!publishedTrain) return state;
    const station = state.publishedNetwork.stations.find((item) => item.id === stationId);
    const draftTrains = {
      ...state.draftTrains,
      [trainId]: stageStopChange(
        state.draftTrains[trainId],
        publishedTrain,
        stationId,
        changes,
        station?.name,
      ),
    };
    return { ...state, draftTrains, publishStatus: 'idle', publishError: null };
  }),
  on(discardDraft, (state, { trainId }) => {
    if (!state.draftTrains[trainId]) return state;
    const draftTrains = { ...state.draftTrains };
    delete draftTrains[trainId];
    return { ...state, draftTrains, publishError: null };
  }),
  on(discardAllDrafts, (state) => {
    if (Object.keys(state.draftTrains).length === 0) return state;
    return { ...state, draftTrains: {}, publishError: null };
  }),

  // —— 发布流程：失败回滚，保留原图与既有分析结果 ——
  on(publishBatch, (state) => ({ ...state, publishStatus: 'publishing', publishError: null })),
  on(publishBatchSuccess, (state, { network, publishedAt, validation }) => ({
    ...state,
    publishedNetwork: network,
    draftTrains: {},
    baselineRevision: state.baselineRevision + 1,
    publishedAt,
    publishStatus: 'idle',
    publishError: null,
    publishedValidation: validation,
    batchSelection: [],
    notices: pushNotice(
      state.notices,
      `批次已发布：全图重算 ${network.trains.length} 趟列车（含隐藏车），现行版本现有 ${validation.dangerCount} 项严重冲突、${validation.warningCount} 项预警，本次调整未引入新的严重冲突。`,
    ),
  })),
  on(publishBatchFailure, (state, { error }) => ({
    ...state,
    publishStatus: 'failed',
    publishError: error,
    // publishedNetwork、draftTrains、publishedValidation 均保持原样——回滚并保留原图与分析结果
    notices: pushNotice(state.notices, `发布失败已回滚：${error}`),
  })),

  // —— 基准时刻改动：旧批次立即失效并按新基准重算 ——
  on(adjustBaseTime, (state, { deltaMinutes }) => {
    if (!deltaMinutes) return state;
    const network: TrainNetwork = {
      ...state.publishedNetwork,
      trains: state.publishedNetwork.trains.map((train) => shiftTrain(train, deltaMinutes)),
    };
    const validation = validateFullNetwork(network);
    return {
      ...state,
      publishedNetwork: network,
      draftTrains: {},
      baselineRevision: state.baselineRevision + 1,
      baseTimeOffsetMin: state.baseTimeOffsetMin + deltaMinutes,
      publishedValidation: validation,
      notices: pushNotice(
        state.notices,
        '基准时刻已调整，原待发布批次失效并按新基准重新计算。',
      ),
    };
  }),

  on(setPrintSection, (state, { sectionId }) => ({ ...state, printSectionId: sectionId })),
  on(importNetwork, (state, { network }) => {
    // 导入数据整体替换现行图：旧批次立即失效，并对全图重新计算
    const validation = validateFullNetwork(network);
    return {
      ...state,
      publishedNetwork: network,
      draftTrains: {},
      baselineRevision: state.baselineRevision + 1,
      publishedAt: Date.now(),
      baseTimeOffsetMin: 0,
      publishStatus: 'idle',
      publishError: null,
      publishedValidation: validation,
      selectedTrainId: network.trains[0]?.id ?? null,
      batchSelection: [],
      viewport: INITIAL_VIEWPORT,
      notices: pushNotice(
        state.notices,
        `已导入 ${network.trains.length} 趟列车、${network.stations.length} 个车站；原待发布批次已失效，全图分析已重算。`,
      ),
    };
  }),
  on(addNotice, (state, { message }) => ({ ...state, notices: pushNotice(state.notices, message) })),
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
