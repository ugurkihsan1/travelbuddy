export type OfflineStatus = {
  status: 'unsupported' | 'not-ready' | 'preparing' | 'ready' | 'error' | 'preview';
  cachedPhotos: number;
  totalPhotos: number;
  message: string;
};

const unsupported: OfflineStatus = { status: 'unsupported', cachedPhotos: 0, totalPhotos: 0, message: 'Offline installation is available in the production app over HTTPS.' };
const preview: OfflineStatus = { status: 'preview', cachedPhotos: 0, totalPhotos: 0, message: 'Offline preview: the app, map, guide, and venue photos are included in this file.' };

async function worker(): Promise<ServiceWorker | null> {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD || !window.isSecureContext) return null;
  if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 7000)),
  ]);
  return registration?.active ?? null;
}

async function request(type: 'GET_OFFLINE_STATUS' | 'CACHE_OFFLINE_IMAGES', onProgress?: (status: OfflineStatus) => void): Promise<OfflineStatus> {
  if (location.protocol === 'file:' || document.querySelector('meta[name="travelbuddy-preview"]')) return preview;
  let active: ServiceWorker | null;
  try { active = await worker(); }
  catch { return { status: 'error', cachedPhotos: 0, totalPhotos: 0, message: 'Offline storage is unavailable in this browser.' }; }
  if (!active) return unsupported;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let timeout: ReturnType<typeof setTimeout>;
    const complete = (status: OfflineStatus) => { clearTimeout(timeout); channel.port1.close(); resolve(status); };
    const schedule = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => complete({ status: 'error', cachedPhotos: 0, totalPhotos: 0, message: 'Offline preparation timed out. Check your connection and try again.' }), type === 'GET_OFFLINE_STATUS' ? 8000 : 45000);
    };
    schedule();
    channel.port1.onmessage = (event: MessageEvent<OfflineStatus & { type?: string }>) => {
      const status = event.data;
      if (!status || typeof status.status !== 'string') return;
      if (status.type === 'OFFLINE_PROGRESS') { schedule(); onProgress?.(status); }
      else if (['OFFLINE_STATUS', 'OFFLINE_READY', 'OFFLINE_ERROR'].includes(status.type ?? '')) complete(status);
    };
    try { active.postMessage({ type }, [channel.port2]); }
    catch { complete({ status: 'error', cachedPhotos: 0, totalPhotos: 0, message: 'Offline storage is unavailable in this browser.' }); }
  });
}

export function getOfflineStatus(): Promise<OfflineStatus> {
  return request('GET_OFFLINE_STATUS');
}

export function prepareOffline(onProgress?: (status: OfflineStatus) => void): Promise<OfflineStatus> {
  return request('CACHE_OFFLINE_IMAGES', onProgress);
}
