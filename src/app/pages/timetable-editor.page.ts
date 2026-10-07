import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { combineLatest, map } from 'rxjs';
import { ConflictPanelComponent } from '../components/conflict-panel.component';
import { GraphCanvasComponent } from '../components/graph-canvas.component';
import { TrainInspectorComponent } from '../components/train-inspector.component';
import {
  addNotice,
  adjustBaseTime,
  batchShift,
  clearBatchSelection,
  discardAllDrafts,
  discardDraft,
  dismissNotice,
  importNetwork,
  moveTrain,
  publishBatch,
  resetViewport,
  restorePersistedState,
  selectTrain,
  setPrintSection,
  toggleBatchTrain,
  updateFilter,
  updateTrainStop,
  updateViewport,
} from '../stores/timetable.actions';
import {
  selectBatchSelection,
  selectBatchSummary,
  selectConflictSummary,
  selectConflicts,
  selectDraftTrains,
  selectFilter,
  selectPreviewNetwork,
  selectPublishedAt,
  selectPublishedConflicts,
  selectPublishedNetwork,
  selectNotices,
  selectPrintSectionId,
  selectSelectedTrainId,
  selectSelectedConflicts,
  selectSelectedTrain,
  selectViewport,
  selectVisibleTrains,
  selectPublishError,
  selectPublishStatus,
} from '../stores/timetable.selectors';
import { TimetableConflict, TrainNetwork } from '../types/timetable';
import { formatTime } from '../utils/time';
import { filterTrains, normalizeImportedNetwork } from '../utils/timetable-utils';

@Component({
  selector: 'app-timetable-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    MultiSelectModule,
    SelectModule,
    TagModule,
    TooltipModule,
    GraphCanvasComponent,
    TrainInspectorComponent,
    ConflictPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="viewModel$ | async as vm">
      <section class="editor-page" [class.editor-page--printing]="!!vm.printSectionId">
        <div class="toolbar">
          <div class="toolbar__title">
            <span>运行图编辑</span>
            <strong>{{ vm.network.lineName }}</strong>
            <small>
              {{ vm.visibleTrains.length }} / {{ vm.network.trains.length }} 趟列车 ·
              现行版本 {{ vm.publishedAtLabel }}
            </small>
          </div>
          <div class="toolbar__filters">
            <span class="search-box">
              <i class="pi pi-search"></i>
              <input
                pInputText
                [(ngModel)]="query"
                (ngModelChange)="setQuery($event)"
                placeholder="车次"
                aria-label="按车次筛选"
              />
            </span>
            <p-multiSelect
              [options]="categories"
              [(ngModel)]="selectedCategories"
              (ngModelChange)="setCategories($event)"
              optionLabel="label"
              optionValue="value"
              placeholder="车型"
              [maxSelectedLabels]="1"
              size="small"
              ariaLabel="按车型筛选"
            ></p-multiSelect>
            <p-select
              [options]="directions"
              [(ngModel)]="direction"
              (ngModelChange)="setDirection($event)"
              optionLabel="label"
              optionValue="value"
              size="small"
              ariaLabel="按方向筛选"
            ></p-select>
          </div>
          <div class="toolbar__actions">
            <p-button
              icon="pi pi-search-minus"
              severity="secondary"
              [text]="true"
              pTooltip="缩小"
              (onClick)="zoom(0.85)"
            ></p-button>
            <p-button
              icon="pi pi-search-plus"
              severity="secondary"
              [text]="true"
              pTooltip="放大"
              (onClick)="zoom(1.15)"
            ></p-button>
            <p-button
              icon="pi pi-expand"
              severity="secondary"
              [text]="true"
              pTooltip="复位视图"
              (onClick)="resetView()"
            ></p-button>
            <span class="toolbar__divider"></span>
            <p-button
              icon="pi pi-upload"
              label="导入 JSON"
              severity="secondary"
              size="small"
              (onClick)="importDialog = true"
            ></p-button>
            <p-button
              icon="pi pi-download"
              label="导出现行版本"
              severity="secondary"
              size="small"
              (onClick)="exportNetwork(vm.publishedNetwork)"
            ></p-button>
          </div>
        </div>

        <div class="summary-bar">
          <div class="summary-item">
            <i class="pi pi-exclamation-triangle"></i>
            <span>预演严重冲突</span>
            <strong class="danger">{{ vm.summary.danger }}</strong>
          </div>
          <div class="summary-item">
            <i class="pi pi-clock"></i>
            <span>追踪预警</span>
            <strong>{{ vm.summary.headway }}</strong>
          </div>
          <div class="summary-item">
            <i class="pi pi-building"></i>
            <span>股道占用</span>
            <strong>{{ vm.summary.track }}</strong>
          </div>
          <div class="summary-item">
            <i class="pi pi-arrow-right-arrow-left"></i>
            <span>越行风险</span>
            <strong>{{ vm.summary.overtake }}</strong>
          </div>
          <div class="summary-bar__spacer"></div>
          <div class="batch-control">
            <span>批量平移</span>
            <p-inputNumber
              [(ngModel)]="batchMinutes"
              [showButtons]="true"
              [min]="-60"
              [max]="60"
              [step]="1"
              suffix=" 分"
              size="small"
              ariaLabel="批量平移分钟"
            ></p-inputNumber>
            <p-button
              icon="pi pi-arrows-h"
              label="收入批次"
              size="small"
              severity="secondary"
              [disabled]="vm.batchSelection.length === 0"
              (onClick)="applyBatchShift()"
            ></p-button>
            <span class="selection-count" *ngIf="vm.batchSelection.length">
              已选 {{ vm.batchSelection.length }}
              <button type="button" (click)="clearBatch()">清除</button>
            </span>
          </div>
          <div class="baseline-control">
            <span>基准时刻</span>
            <p-button
              icon="pi pi-angle-double-left"
              label="-30 分"
              size="small"
              severity="secondary"
              [text]="true"
              [disabled]="vm.batchSummary.trainCount > 0"
              pTooltip="改动基准时刻后旧批次立即失效"
              (onClick)="shiftBaseTime(-30)"
            ></p-button>
            <p-button
              icon="pi pi-angle-double-right"
              label="+30 分"
              size="small"
              severity="secondary"
              [text]="true"
              [disabled]="vm.batchSummary.trainCount > 0"
              pTooltip="改动基准时刻后旧批次立即失效"
              (onClick)="shiftBaseTime(30)"
            ></p-button>
          </div>
          <div class="print-control">
            <p-select
              [options]="vm.publishedNetwork.sections"
              [(ngModel)]="printSectionId"
              optionLabel="id"
              optionValue="id"
              placeholder="选择区间"
              size="small"
              ariaLabel="选择打印区间"
            ></p-select>
            <p-button
              icon="pi pi-print"
              label="打印区间"
              size="small"
              [disabled]="!printSectionId"
              (onClick)="printSection()"
            ></p-button>
          </div>
        </div>

        <div class="batch-dock" [class.batch-dock--empty]="vm.batchSummary.trainCount === 0">
          <div class="batch-dock__status">
            <span class="batch-dock__dot"></span>
            <ng-container *ngIf="vm.batchSummary.trainCount > 0; else noBatch">
              <strong>待发布批次</strong>
              <span>
                {{ vm.batchSummary.trainCount }} 趟列车、{{ vm.batchSummary.changeCount }} 项调整
                仅在预演中生效，尚未覆盖现行调度
              </span>
            </ng-container>
            <ng-template #noBatch>
              <strong>现行调度无待发布调整</strong>
              <span>拖线、批量平移、停站与股道改动会先收入批次</span>
            </ng-template>
          </div>
          <div class="batch-dock__changes" *ngIf="vm.batchSummary.trainCount > 0">
            <button
              type="button"
              class="batch-chip"
              *ngFor="let entry of vm.batchEntries"
              [class.batch-chip--selected]="entry.trainId === vm.selectedTrainId"
              (click)="selectTrainAction(entry.trainId)"
            >
              <strong>{{ entry.trainNumber }}</strong>
              <span>{{ entry.changes.length }} 项</span>
              <i class="pi pi-times" (click)="discardDraft(entry.trainId, $event)"></i>
            </button>
          </div>
          <div class="batch-dock__actions">
            <p-tag
              *ngIf="vm.publishStatus === 'failed'"
              severity="danger"
              value="发布失败已回滚"
            ></p-tag>
            <p-tag
              *ngIf="vm.publishStatus === 'publishing'"
              severity="info"
              value="全图重算中…"
            ></p-tag>
            <p-button
              icon="pi pi-undo"
              label="放弃批次"
              severity="secondary"
              size="small"
              [outlined]="true"
              [disabled]="vm.batchSummary.trainCount === 0 || vm.publishStatus === 'publishing'"
              (onClick)="discardAll()"
            ></p-button>
            <p-button
              icon="pi pi-send"
              label="提交发布"
              size="small"
              [loading]="vm.publishStatus === 'publishing'"
              [disabled]="vm.batchSummary.trainCount === 0"
              pTooltip="对全图重算区间追踪、到发线占用和越行关系（隐藏的车也参与）"
              (onClick)="publish()"
            ></p-button>
          </div>
        </div>
        <p class="batch-error" *ngIf="vm.publishError">
          <i class="pi pi-exclamation-circle"></i>
          {{ vm.publishError }}
          <span>原图与分析结果已保留，批次仍可继续修改。</span>
        </p>

        <div class="workspace">
          <aside class="workspace__left panel">
            <app-train-inspector
              [train]="vm.selectedTrain"
              [stations]="vm.network.stations"
              (trainShifted)="shiftSelected($event, vm.selectedTrain?.id || null)"
              (stopUpdated)="updateStop($event, vm.selectedTrain?.id || null)"
            ></app-train-inspector>
          </aside>

          <section class="graph-panel">
            <div class="graph-panel__header">
              <div>
                <strong>时间—里程坐标图</strong>
                <span>红色区间表示正在违反安全间隔</span>
              </div>
              <div class="legend">
                <span><i class="legend-line"></i>运行线</span>
                <span><i class="legend-stop"></i>停站</span>
                <span><i class="legend-danger"></i>冲突</span>
              </div>
            </div>
            <app-graph-canvas
              [network]="vm.network"
              [publishedNetwork]="vm.publishedNetwork"
              [trains]="vm.visibleTrains"
              [publishedTrains]="vm.publishedVisibleTrains"
              [conflicts]="vm.printSectionId ? vm.publishedConflicts : vm.conflicts"
              [viewport]="vm.viewport"
              [selectedTrainId]="vm.printSectionId ? null : vm.selectedTrainId"
              [batchSelection]="vm.printSectionId ? [] : vm.batchSelection"
              [printSectionId]="vm.printSectionId"
              (trainSelected)="selectTrainAction($event)"
              (trainMoved)="moveTrainAction($event)"
              (viewportChanged)="updateViewportAction($event)"
              (batchToggled)="toggleBatch($event)"
            ></app-graph-canvas>
            <footer class="graph-panel__footer">
              <span>视图缩放 {{ (vm.viewport.scaleX * 100).toFixed(0) }}%（{{ vm.batchSummary.trainCount ? '预演含未发布批次' : '与现行版本一致' }}）</span>
              <span>Alt + 点击可加入批量选择</span>
              <span *ngIf="vm.batchSelection.length">批量选中 {{ vm.batchSelection.length }} 趟</span>
            </footer>
          </section>

          <aside class="workspace__right panel">
            <app-conflict-panel
              [conflicts]="vm.selectedConflicts"
              (conflictSelected)="focusConflict($event)"
            ></app-conflict-panel>
          </aside>
        </div>

        <div class="notice-stack" *ngIf="vm.notices.length">
          <p-message
            *ngFor="let notice of vm.notices; let index = index"
            severity="success"
            [text]="notice"
            [closable]="true"
            (onClose)="dismissNoticeAction(index)"
          ></p-message>
        </div>
      </section>

      <p-dialog
        header="导入线路与运行图数据"
        [(visible)]="importDialog"
        [modal]="true"
        [style]="{ width: '520px' }"
        [draggable]="false"
      >
        <div class="import-dialog">
          <p>
            选择包含 <code>lineName</code>、<code>stations</code>、<code>sections</code> 和
            <code>trains</code> 的 JSON 文件。导入前会检查车站引用和必填结构。
          </p>
          <label class="file-drop">
            <input type="file" accept="application/json,.json" (change)="onImportFile($event)" />
            <i class="pi pi-cloud-upload"></i>
            <strong>选择 JSON 文件</strong>
            <span>或点击此处浏览本机文件</span>
          </label>
          <div class="import-template">
            <span>当前内置线路：</span>
            <strong>{{ (viewModel$ | async)?.network?.lineName }}</strong>
          </div>
        </div>
        <ng-template pTemplate="footer">
          <p-button label="取消" severity="secondary" (onClick)="importDialog = false"></p-button>
        </ng-template>
      </p-dialog>
    </ng-container>
  `,
})
export class TimetableEditorPageComponent implements OnInit {
  readonly store = inject(Store);
  readonly categories = [
    { label: '高铁', value: '高铁' },
    { label: '动车', value: '动车' },
    { label: '普速', value: '普速' },
    { label: '货运', value: '货运' },
  ];
  readonly directions = [
    { label: '全部方向', value: 'all' },
    { label: '上行', value: 'up' },
    { label: '下行', value: 'down' },
  ];

  query = '';
  selectedCategories: string[] = [];
  direction: 'up' | 'down' | 'all' = 'all';
  batchMinutes = 5;
  printSectionId: string | null = null;
  importDialog = false;

  readonly viewModel$ = combineLatest({
    network: this.store.select(selectPreviewNetwork),
    publishedNetwork: this.store.select(selectPublishedNetwork),
    visibleTrains: this.store.select(selectVisibleTrains),
    selectedTrain: this.store.select(selectSelectedTrain),
    selectedTrainId: this.store.select(selectSelectedTrainId),
    batchSelection: this.store.select(selectBatchSelection),
    filter: this.store.select(selectFilter),
    viewport: this.store.select(selectViewport),
    conflicts: this.store.select(selectConflicts),
    publishedConflicts: this.store.select(selectPublishedConflicts),
    selectedConflicts: this.store.select(selectSelectedConflicts),
    summary: this.store.select(selectConflictSummary),
    printSectionId: this.store.select(selectPrintSectionId),
    notices: this.store.select(selectNotices),
    drafts: this.store.select(selectDraftTrains),
    batchSummary: this.store.select(selectBatchSummary),
    publishStatus: this.store.select(selectPublishStatus),
    publishError: this.store.select(selectPublishError),
    publishedAt: this.store.select(selectPublishedAt),
  }).pipe(
    map((state) => ({
      ...state,
      publishedVisibleTrains: filterTrains(
        state.publishedNetwork,
        state.filter.query,
        state.filter.categories,
        state.filter.direction,
      ),
      batchEntries: Object.values(state.drafts),
      publishedAtLabel: new Date(state.publishedAt).toLocaleString('zh-CN', { hour12: false }),
    })),
  );

  ngOnInit(): void {
    try {
      const persisted = localStorage.getItem('pair-wise-yy-20.timetable-view');
      if (persisted) {
        this.store.dispatch(restorePersistedState({ state: JSON.parse(persisted) }));
      }
    } catch {
      localStorage.removeItem('pair-wise-yy-20.timetable-view');
    }
  }

  @HostListener('window:afterprint')
  onAfterPrint(): void {
    setTimeout(() => this.store.dispatch(setPrintSection({ sectionId: null })), 50);
  }

  setQuery(value: string): void {
    this.store.dispatch(updateFilter({ filter: { query: value } }));
  }

  setCategories(value: string[]): void {
    this.store.dispatch(updateFilter({ filter: { categories: value as never[] } }));
  }

  setDirection(value: 'up' | 'down' | 'all'): void {
    this.store.dispatch(updateFilter({ filter: { direction: value } }));
  }

  zoom(factor: number): void {
    this.store.select(selectViewport).subscribe((viewport) => {
      this.store.dispatch(
        updateViewport({
          viewport: {
            scaleX: Math.max(0.5, Math.min(5, viewport.scaleX * factor)),
            scaleY: Math.max(0.5, Math.min(4, viewport.scaleY * factor)),
          },
        }),
      );
    }).unsubscribe();
  }

  resetView(): void {
    this.store.dispatch(resetViewport());
  }

  clearBatch(): void {
    this.store.dispatch(clearBatchSelection());
  }

  selectTrainAction(trainId: string): void {
    this.store.dispatch(selectTrain({ trainId }));
  }

  moveTrainAction(event: { trainId: string; deltaMinutes: number }): void {
    this.store.dispatch(moveTrain(event));
  }

  updateViewportAction(viewport: Partial<{ scaleX: number; scaleY: number; offsetX: number; offsetY: number }>): void {
    this.store.dispatch(updateViewport({ viewport }));
  }

  dismissNoticeAction(index: number): void {
    this.store.dispatch(dismissNotice({ index }));
  }

  shiftSelected(deltaMinutes: number, trainId: string | null): void {
    if (!trainId) return;
    this.store.dispatch(moveTrain({ trainId, deltaMinutes }));
  }

  updateStop(
    event: { stationId: string; changes: Record<string, unknown> },
    trainId: string | null,
  ): void {
    if (!trainId) return;
    this.store.dispatch(
      updateTrainStop({
        trainId,
        stationId: event.stationId,
        changes: event.changes as never,
      }),
    );
  }

  toggleBatch(trainId: string): void {
    this.store.dispatch(toggleBatchTrain({ trainId }));
  }

  applyBatchShift(): void {
    this.store.dispatch(batchShift({ deltaMinutes: this.batchMinutes }));
  }

  publish(): void {
    this.store.dispatch(publishBatch());
  }

  discardDraft(trainId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.store.dispatch(discardDraft({ trainId }));
  }

  discardAll(): void {
    this.store.dispatch(discardAllDrafts());
  }

  shiftBaseTime(deltaMinutes: number): void {
    this.store.dispatch(adjustBaseTime({ deltaMinutes }));
  }

  focusConflict(conflict: TimetableConflict): void {
    const trainId = conflict.trainIds[0];
    if (trainId) this.store.dispatch(selectTrain({ trainId }));
  }

  printSection(): void {
    if (!this.printSectionId) return;
    this.store.dispatch(setPrintSection({ sectionId: this.printSectionId }));
    setTimeout(() => window.print(), 300);
  }

  exportNetwork(network: unknown): void {
    const blob = new Blob([JSON.stringify(network, null, 2)], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `运行图数据-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async onImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      let fallbackNetwork: TrainNetwork | undefined;
      this.store.select(selectPublishedNetwork).subscribe((network) => {
        fallbackNetwork = network;
      }).unsubscribe();
      const network = normalizeImportedNetwork(raw, fallbackNetwork as TrainNetwork);
      this.store.dispatch(importNetwork({ network }));
      this.importDialog = false;
    } catch (error) {
      this.store.dispatch(addNotice({ message: error instanceof Error ? error.message : '无法解析 JSON 文件' }));
    } finally {
      input.value = '';
    }
  }

  formatTime(value: number): string {
    return formatTime(value);
  }
}
