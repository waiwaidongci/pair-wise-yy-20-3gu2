import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { tap, withLatestFrom } from 'rxjs';
import {
  batchShift,
  discardDraft,
  importNetwork,
  moveTrain,
  publishDraft,
  resetViewport,
  shiftBaseline,
  updateFilter,
  updateTrainStop,
  updateViewport,
} from './timetable.actions';
import { selectFilter, selectViewport } from './timetable.selectors';

const STORAGE_KEY = 'pair-wise-yy-20.timetable-view';

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

  readonly announceChanges = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          moveTrain,
          batchShift,
          updateTrainStop,
          importNetwork,
          publishDraft,
          discardDraft,
          shiftBaseline,
        ),
        tap((action) => {
          if ('deltaMinutes' in action) {
            console.info('[运行图] 时刻已调整', action);
          } else {
            console.info('[运行图] 批次状态变更', action.type);
          }
        }),
      ),
    { dispatch: false },
  );
}
