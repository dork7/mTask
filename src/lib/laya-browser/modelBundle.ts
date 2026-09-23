import type { LayaConfig } from './types';

export interface ProgressInfo {
  file: string;
  /** 1-based position of `file` in the bundle. */
  index: number;
  total: number;
  /** Bytes of `file` received so far. */
  loaded: number;
  /** Size of `file` in bytes, or null when the server did not send content-length. */
  size: number | null;
  /** 'cache' when `file` was read from Cache Storage instead of downloaded. */
  source: 'cache' | 'network';
}

export interface BundleFiles {
  onnx: ArrayBuffer;
  onnxData: ArrayBuffer;
  config: LayaConfig;
  tokenizerJson: unknown;
  tokenizerConfigJson: unknown;
}

const REPO_BASE = 'https://huggingface.co/receptron/laya-onnx/resolve/main';
const CACHE_NAME = 'laya-model-v1';
const FILES = [
  'laya.onnx',
  'laya.onnx.data',
  'laya_config.json',
  'tokenizer/tokenizer.json',
  'tokenizer/tokenizer_config.json',
] as const;

type OnBytes = (loaded: number, size: number | null, source: ProgressInfo['source']) => void;

async function readStream(body: ReadableStream<Uint8Array>, size: number | null, onBytes: OnBytes): Promise<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onBytes(loaded, size, 'network');
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

// A failed cache write (e.g. quota exceeded) must not fail classification; the file is
// simply downloaded again on the next page load.
function storeInCache(cache: Cache, url: string, response: Response): Promise<void> {
  return cache.put(url, response).catch((error: unknown) => {
    console.warn(`laya: could not cache ${url}; it will be downloaded again next time`, error);
  });
}

async function fetchFile(file: string, onBytes: OnBytes): Promise<ArrayBuffer> {
  const url = `${REPO_BASE}/${file}`;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) {
    const buffer = await cached.arrayBuffer();
    onBytes(buffer.byteLength, buffer.byteLength, 'cache');
    return buffer;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to download ${file}: ${response.status}`);
  }
  const header = response.headers?.get('content-length');
  const size = header ? Number(header) : null;
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onBytes(buffer.byteLength, size ?? buffer.byteLength, 'network');
    await storeInCache(cache, url, new Response(buffer.slice(0)));
    return buffer;
  }
  // Stream one branch straight into Cache Storage while reading the other, rather than
  // copying the finished (up to 1.7GB) buffer into a second Response.
  const [toCache, toRead] = response.body.tee();
  const stored = storeInCache(cache, url, new Response(toCache, { headers: response.headers }));
  const buffer = await readStream(toRead, size, onBytes);
  await stored;
  return buffer;
}

export async function ensureBundle(onProgress?: (info: ProgressInfo) => void): Promise<BundleFiles> {
  // Best-effort: a persisted origin is exempt from automatic eviction of the multi-GB cache.
  await navigator.storage?.persist?.().catch(() => false);
  const buffers: Record<string, ArrayBuffer> = {};
  for (let i = 0; i < FILES.length; i += 1) {
    const file = FILES[i];
    buffers[file] = await fetchFile(file, (loaded, size, source) =>
      onProgress?.({ file, index: i + 1, total: FILES.length, loaded, size, source }),
    );
  }
  const decode = (buf: ArrayBuffer) => JSON.parse(new TextDecoder().decode(buf));
  return {
    onnx: buffers['laya.onnx'],
    onnxData: buffers['laya.onnx.data'],
    config: decode(buffers['laya_config.json']) as LayaConfig,
    tokenizerJson: decode(buffers['tokenizer/tokenizer.json']),
    tokenizerConfigJson: decode(buffers['tokenizer/tokenizer_config.json']),
  };
}
