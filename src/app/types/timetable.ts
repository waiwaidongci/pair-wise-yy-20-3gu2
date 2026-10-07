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

/** 待发布调整的变更类别：拖线/平移为时刻、停站作业、到发股道 */
export type PendingChangeKind = 'shift' | 'stop' | 'track';

/** 一条待发布批次内的变更记录，仅用于预演展示与说明 */
export interface PendingChange {
  id: string;
  kind: PendingChangeKind;
  detail: string;
  /** 相对已发布版本的累计平移分钟（时刻类调整） */
  deltaMinutes: number;
}

/** 一辆车在待发布批次中的草稿 */
export interface DraftTrain {
  trainId: string;
  trainNumber: string;
  draft: Train;
  changes: PendingChange[];
}

export type PublishStatus = 'idle' | 'publishing' | 'failed';

/** 全图提交校验结果（隐藏的车也参与） */
export interface PublishValidation {
  conflicts: TimetableConflict[];
  dangerCount: number;
  warningCount: number;
  /** 本次批次相对现行版本新引入的严重冲突（发布被拒收的判定依据） */
  newDangerCount: number;
  /** 新引入严重冲突的说明，用于发布失败回滚后的提示 */
  newDangerConflicts: TimetableConflict[];
}

export interface TimetableState {
  /** 现行（已发布）运行图：分析页、导出、打印都读取这一版 */
  publishedNetwork: TrainNetwork;
  /** 待发布批次：草稿列车，仅在编辑预演中生效 */
  draftTrains: Record<string, DraftTrain>;
  /** 批次所基于的已发布版本标识；被导入或基准时刻改动替换后立即失效 */
  baselineRevision: number;
  /** 现行版本的发布时间戳（模拟服务端版本） */
  publishedAt: number;
  /** 基准时刻偏移（分钟），改动后旧批次立即失效 */
  baseTimeOffsetMin: number;
  publishStatus: PublishStatus;
  publishError: string | null;
  /** 发布失败时保留的上一次全图校验结果（基于原图） */
  publishedValidation: PublishValidation;
  filter: TimetableFilter;
  viewport: ViewportState;
  selectedTrainId: string | null;
  batchSelection: string[];
  printSectionId: string | null;
  notices: string[];
}

export interface ImportedNetworkFile {
  lineName?: string;
  stations?: Station[];
  sections?: RailSection[];
  trains?: Train[];
}
