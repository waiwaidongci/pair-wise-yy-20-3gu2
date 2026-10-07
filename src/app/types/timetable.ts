export type TrainDirection = 'up' | 'down';
export type TrainCategory = '高铁' | '动车' | '普速' | '货运';
export type StopKind = 'stop' | 'pass' | 'meet' | 'overtake';

export interface StationTrack {
  id: string;
  name: string;
  main: boolean;
}

export interface Station {
  id: string;
  name: string;
  shortName: string;
  km: number;
  tracks: StationTrack[];
}

export interface RailSection {
  id: string;
  fromStationId: string;
  toStationId: string;
  distanceKm: number;
  minHeadwayMin: number;
  baseRunningMin: number;
}

export interface TrainStop {
  stationId: string;
  kind: StopKind;
  arrival: number;
  departure: number;
  trackId: string;
  meetTrainNumber?: string;
}

export interface Train {
  id: string;
  number: string;
  category: TrainCategory;
  direction: TrainDirection;
  color: string;
  stops: TrainStop[];
  selected: boolean;
}

export interface TrainNetwork {
  lineName: string;
  stations: Station[];
  sections: RailSection[];
  trains: Train[];
}

export type ConflictType = 'headway' | 'track' | 'overtake';
export type ConflictSeverity = 'danger' | 'warning';

export interface TimeRange {
  start: number;
  end: number;
}

export interface TimetableConflict {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  title: string;
  detail: string;
  trainIds: string[];
  sectionId?: string;
  stationId?: string;
  timeRange: TimeRange;
  suggestedShift: TimeRange;
}

export interface ViewportState {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

export interface TimetableFilter {
  query: string;
  categories: TrainCategory[];
  direction: TrainDirection | 'all';
}

/**
 * 预演批次中的一条调整。
 * - shift：整列平移 deltaMinutes（相对时刻，可叠加）
 * - stop：单站时刻/作业方式/股道覆盖（绝对量，后写覆盖前写）
 */
export type DraftChange =
  | { kind: 'shift'; trainId: string; deltaMinutes: number }
  | { kind: 'stop'; trainId: string; stationId: string; changes: Partial<TrainStop> };

export interface TimetableState {
  /** 已发布版本（现行调度），分析/导出/打印都读它 */
  publishedNetwork: TrainNetwork;
  /** 预演批次：尚未提交的调整集合，只在预演（画布）里生效 */
  draft: DraftChange[];
  filter: TimetableFilter;
  viewport: ViewportState;
  selectedTrainId: string | null;
  batchSelection: string[];
  printSectionId: string | null;
  notices: string[];
  /** 最近一次发布是否被回滚（全图重算发现严重冲突） */
  publishError: string | null;
  /** 最近一次成功发布的时间戳 */
  lastPublishedAt: number | null;
}

export interface ImportedNetworkFile {
  lineName?: string;
  stations?: Station[];
  sections?: RailSection[];
  trains?: Train[];
}
