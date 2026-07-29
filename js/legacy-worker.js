const LEGACY_CACHE_PREFIX = 'dienstplanrad';
const LEGACY_WORKER_PATH = '/sw.js';
const DEFAULT_SETTLE_TIMEOUT_MS = 5000;

function workerScriptUrls(registration) {
  return [registration?.installing, registration?.waiting, registration?.active]
    .map(worker => worker?.scriptURL)
    .filter(Boolean);
}

function hasHistoricalWorker(registration, workerUrl) {
  const expected = new URL(workerUrl);
  return workerScriptUrls(registration).some(scriptUrl => {
    const actual = new URL(scriptUrl);
    return actual.origin === expected.origin && actual.pathname === expected.pathname;
  });
}

async function clearLegacyCaches(cacheStorage) {
  if (!cacheStorage?.keys || !cacheStorage?.delete) return [];
  const keys = await cacheStorage.keys();
  const legacyKeys = keys.filter(key => key.startsWith(LEGACY_CACHE_PREFIX));
  await Promise.all(legacyKeys.map(key => cacheStorage.delete(key)));
  return legacyKeys;
}

function controllerChangeWaiter(serviceWorker, timeoutMs) {
  if (!serviceWorker?.addEventListener) {
    return { promise: Promise.resolve(false), cancel() {} };
  }

  let settle = null;
  let timer = null;
  const finish = changed => {
    if (!settle) return;
    const complete = settle;
    settle = null;
    if (timer !== null) clearTimeout(timer);
    serviceWorker.removeEventListener?.('controllerchange', onControllerChange);
    complete(changed);
  };
  const onControllerChange = () => finish(true);
  const promise = new Promise(resolve => {
    settle = resolve;
    serviceWorker.addEventListener('controllerchange', onControllerChange, { once: true });
    timer = setTimeout(() => finish(false), timeoutMs);
  });

  return {
    promise,
    cancel: () => finish(false)
  };
}

/**
 * Ersetzt ausschließlich den historischen DienstplanRAD-Worker durch den
 * No-op-Worker an derselben URL. Dessen skipWaiting/clients.claim-Kette nimmt
 * dem alten Cache-First-Worker den aktuellen Tab ab; erst danach beginnen
 * Bootstrap- und Monatsabrufe.
 */
export async function neutralizeLegacyServiceWorker({
  baseUrl = globalThis.location?.href,
  serviceWorker = globalThis.navigator?.serviceWorker,
  cacheStorage = globalThis.caches,
  settleTimeoutMs = DEFAULT_SETTLE_TIMEOUT_MS
} = {}) {
  const deletedBeforeUpdate = await clearLegacyCaches(cacheStorage).catch(() => []);
  if (!baseUrl || !serviceWorker?.getRegistration) {
    return { found: false, replaced: false, controllerChanged: false, deletedCaches: deletedBeforeUpdate };
  }

  const workerUrl = new URL(LEGACY_WORKER_PATH, baseUrl).href;
  const defaultScope = new URL('/', baseUrl).href;
  let registration;
  try {
    registration = await serviceWorker.getRegistration(defaultScope);
  } catch {
    return { found: false, replaced: false, controllerChanged: false, deletedCaches: deletedBeforeUpdate };
  }

  if (!registration || !hasHistoricalWorker(registration, workerUrl)) {
    return { found: false, replaced: false, controllerChanged: false, deletedCaches: deletedBeforeUpdate };
  }

  const waiter = controllerChangeWaiter(serviceWorker, settleTimeoutMs);
  let replaced = false;
  let controllerChanged = false;
  try {
    await serviceWorker.register(workerUrl, {
      scope: registration.scope || defaultScope,
      updateViaCache: 'none'
    });
    replaced = true;
    controllerChanged = await waiter.promise;
  } catch {
    waiter.cancel();
    await registration.unregister().catch(() => false);
  }

  const deletedAfterUpdate = await clearLegacyCaches(cacheStorage).catch(() => []);
  return {
    found: true,
    replaced,
    controllerChanged,
    deletedCaches: [...new Set([...deletedBeforeUpdate, ...deletedAfterUpdate])]
  };
}
