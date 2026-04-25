import { Observable } from "../Observers/index";

export type SafePromiseFunction<T> = (
  resolve: (data: T) => void,
  reject: (data: any) => void,
  promise: SafePromise,
) => void;

export class SafePromiseDiedError extends Error {
  fatal = true;
  constructor(public promise: SafePromise) {
    super(`${promise.id} died.`);
  }
}

export class SafePromise<T = any> {
  private _run: SafePromiseFunction<T>;

  private dieTimer: any = 0;
  private paused = false;
  private _resolve: Function;
  private _reject: Function;
  private startTime = 0;
  private elapsed = 0;
  isCanceled = false;
  private ran = false;

  private _isResolved = false;
  private _isRejected = false;

  observers = {
    died: new Observable<SafePromiseDiedError>(),
    canceled: new Observable<void>(),
    rejected: new Observable<void>(),
    resolved: new Observable<T>(),
    finally: new Observable<void>(),
    error: new Observable<any>(),
  };
  constructor(
    public id: string,
    run: SafePromiseFunction<T>,
    public dieTimeOut: number | null = null,
  ) {
    this._run = run;
  }

  isResolved() {
    return this._isResolved;
  }
  isRejected() {
    return this._isRejected;
  }

  waitTillDone() {
    if (!this.ran) return false;
    if (this.isRejected() || this.isRejected() || this.isCanceled) return false;
    const { promise, resolve, reject } = Promise.withResolvers();
    const sub = Symbol("");
    const unSub = () => {
      this.observers.resolved.unsubscribe(sub);
      this.observers.rejected.unsubscribe(sub);
      this.observers.canceled.unsubscribe(sub);
      this.observers.error.unsubscribe(sub);
    };

    this.observers.resolved.subscribe(sub, () => {
      resolve(true);
      unSub();
    });
    this.observers.rejected.subscribe(sub, () => {
      reject(false);
      unSub();
    });
    this.observers.canceled.subscribe(sub, () => {
      reject(false);
      unSub();
    });
    this.observers.error.subscribe(sub, () => {
      reject(false);
      unSub();
    });
    this.observers.died.subscribe(sub, () => {
      reject(false);
      unSub();
    });
    return promise;
  }
  resolve(data: T) {
    if (!this.ran) return;
    this.clearDieTimer();
    this._isResolved = true;
    this.observers.resolved.notify(data);
    this._resolve(data);
  }

  reject(data: any) {
    if (!this.ran) return;
    this.clearDieTimer();
    this._reject(data);
    this._isRejected = true;
    this.observers.rejected.notify(data);
  }

  pause() {
    if (!this.ran) return;

    if (this.paused) return;
    this.paused = true;
    this.clearDieTimer();
    const now = performance.now();
    const currentElapsed = now - this.startTime;
    this.elapsed += currentElapsed;
    this.startTime = now;
  }
  resume() {
    if (!this.ran) return;

    if (!this.paused) return;
    this.paused = false;
    if (this.dieTimeOut !== null) {
      this.setDie(
        this.dieTimeOut - this.elapsed > 0 ? this.dieTimeOut - this.elapsed : 0,
      );
    }
  }

  private setDie(timeOut = this.dieTimeOut) {
    if (timeOut === null) return;
    this.clearDieTimer();
    this.dieTimer = setTimeout(() => {
      if (
        this.paused ||
        this.isCanceled ||
        this._isResolved ||
        this._isRejected
      )
        return;
      const error = new SafePromiseDiedError(this);
      this.observers.died.notify(error);
      this._reject(error);
      this._isRejected = true;
    }, timeOut);
  }

  private clearDieTimer() {
    if (typeof this.dieTimer !== "undefined") clearTimeout(this.dieTimer);
  }

  cancel() {
    if (!this.ran) return;
    if (this._isResolved || this._isRejected || this.isCanceled) return;
    this.isCanceled = true;
    this.observers.canceled.notify();
    this.resolve(null as any);
  }

  run(): Promise<T> {
    const { promise, resolve, reject } = Promise.withResolvers();
    this.startTime = performance.now();
    this._resolve = resolve;
    this._reject = reject;
    this.ran = true;
    this.setDie();
    this._run(
      (data: T) => this.resolve(data),
      (data: any) => this.reject(data),
      this,
    );
    promise.catch((error) => {
      this.observers.error.notify(error);
      throw new Error(error);
    });
    promise.finally(() => {
      this.clearDieTimer();
      this.observers.finally.notify();
    });
    return promise as Promise<T>;
  }
}
