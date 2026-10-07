import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import {
  batchShift,
  importNetwork,
  moveTrain,
  publishBatch,
  publishBatchFailure,
  publishBatchSuccess,
  resetViewport,
  updateFilter,
  updateTrainStop,
  updateViewport,
} from './timetable.actions';
import {
  selectFilter,
  selectPreviewNetwork,
  selectPublishedValidation,
  selectViewport,
} from './timetable.selectors';
import { switchMap, tap, withLatestFrom } from 'rxjs';
import { validateFullNetwork } from '../utils/timetable-utils';

const STORAGE_KEY = 'pair-wise-yy-20.timetable-view';
/** 模拟服务端全图校验耗时 */
const PUBLISH_DELAY_MS = 650;

function serverValidate<T>(payload: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(payload), PUBLISH_DELAY_MS);
  });
}

@Injectable()
export class TimetableEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);

  readonly persistView = createEffect(
    () =>
      this.actions$.pipe(
        ofType(updateViewport, updateFilter, resetViewport),
        withLatestFrom(this.store.select(selectViewport), this.store.select(selectFilter)),
        tap(([, viewport, filter]) => {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ viewport, filter }));
        }),
      ),
    { dispatch: false },
  );

  readonly announceDrafting = createEffect(
    () =>
      this.actions$.pipe(
        ofType(moveTrain, batchShift, updateTrainStop, importNetwork),
        tap((action) => {
          if (action.type === importNetwork.type) {
            console.info('[运行图] 现行图已替换，待发布批次失效');
          } else {
            console.info('[运行图] 调整已收入待发布批次（仅预演生效）', action);
          }
        }),
      ),
    { dispatch: false },
  );

  /**
   * 提交发布：对合并批次后的全图重新计算区间追踪、到发线占用和越行关系。
   * 不使用任何筛选集合——隐藏的车同样参与。本次批次新引入的严重冲突会被
   * 视为服务端拒收：reducer 回滚并保留原图与分析结果；既存基线问题不阻塞。
   */
  readonly publish = createEffect(() =>
    this.actions$.pipe(
      ofType(publishBatch),
      withLatestFrom(
        this.store.select(selectPreviewNetwork),
        this.store.select(selectPublishedValidation),
      ),
      switchMap(([, previewNetwork, baseline]) =>
        serverValidate(previewNetwork).then((network) => {
          const validation = validateFullNetwork(network, baseline.conflicts);
          if (validation.newDangerCount > 0) {
            const first = validation.newDangerConflicts[0];
            const detail = first ? `（例：${first.title}）` : '';
            return publishBatchFailure({
              error: `全图重算发现本次调整新引入 ${validation.newDangerCount} 项严重冲突${detail}，已回滚至原图，批次保留待修改。`,
            });
          }
          // 校验通过：预演图转为新的现行版本
          return publishBatchSuccess({
            network,
            publishedAt: Date.now(),
            validation,
          });
        }),
      ),
    ),
  );
}
