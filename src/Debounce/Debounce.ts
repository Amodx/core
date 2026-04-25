export const debounce = <T extends (...args: any[]) => any>(
  callback: T,
  wait: number
) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pending: {
    promise: Promise<Awaited<ReturnType<T>>>;
    resolve: (v: Awaited<ReturnType<T>>) => void;
    reject: (e: unknown) => void;
  } | null = null;
  let latestArgs: Parameters<T>;

  return (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    latestArgs = args;

    if (timeoutId !== null) clearTimeout(timeoutId);

    if (!pending) {
      let resolve!: (v: Awaited<ReturnType<T>>) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<Awaited<ReturnType<T>>>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      pending = { promise, resolve, reject };
    }

    timeoutId = setTimeout(async () => {
      const p = pending!;
      pending = null;
      timeoutId = null;
      try {
        p.resolve(await callback(...latestArgs));
      } catch (e) {
        p.reject(e);
      }
    }, wait);

    return pending.promise;
  };
};