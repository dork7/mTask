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
const CACHE_NAME = 'laya-model-v2';
/** Earlier versions stored each file as one entry, which Chromium rejects for the 1.7GB weights. */
const OLD_CACHE_NAMES = ['laya-model-v1'];
/** 64MB per cache entry: Chromium's Cache API fails ("Unexpected internal error") on multi-GB entries. */
const DEFAULT_PART_BYTES = 64 * 1024 * 1024;
const FILES = [
  'laya.onnx',
  'laya.onnx.data',
  'laya_config.json',
  'tokenizer/tokenizer.json',
  'tokenizer/tokenizer_config.json',
] as const;

export interface EnsureBundleOptions {
  /** Maximum bytes per Cache Storage entry. */
  partBytes?: number;
}

interface Manifest {
  size: number;
  parts: number;
}

type OnBytes = (loaded: number, size: number | null, source: ProgressInfo['source']) => void;

const partKey = (url: string, i: number) => `${url}?part=${i}`;
const manifestKey = (url: string) => `${url}?manifest`;

async function readFromCache(cache: Cache, url: string, onBytes: OnBytes): Promise<ArrayBuffer | null> {
  const manifestResponse = await cache.match(manifestKey(url));
  if (!manifestResponse) return null;
  const manifest = (await manifestResponse.json()) as Manifest;
  const out = new Uint8Array(manifest.size);
  let offset = 0;
  for (let i = 0; i < manifest.parts; i += 1) {
    const part = await cache.match(partKey(url, i));
    if (!part) return null; // evicted piecemeal: treat as not cached
    const bytes = new Uint8Array(await part.arrayBuffer());
    out.set(bytes, offset);
    offset += bytes.byteLength;
    onBytes(offset, manifest.size, 'cache');
  }
  return offset === manifest.size ? out.buffer : null;
}

/**
 * Writes `bytes` to the cache as fixed-size parts, then a manifest. The manifest goes last so
 * an interrupted or failed write never looks like a complete cached file. A failed write must
 * not fail classification; the file is simply downloaded again next time.
 */
async function writeToCache(cache: Cache, url: string, bytes: Uint8Array, partBytes: number): Promise<void> {
  try {
    const parts = Math.max(1, Math.ceil(bytes.byteLength / partBytes));
    for (let i = 0; i < parts; i += 1) {
      await cache.put(partKey(url, i), new Response(bytes.slice(i * partBytes, (i + 1) * partBytes)));
    }
    const manifest: Manifest = { size: bytes.byteLength, parts };
    await cache.put(manifestKey(url), new Response(JSON.stringify(manifest)));
  } catch (error) {
    console.warn(`laya: could not cache ${url}; it will be downloaded again next time`, error);
  }
}

async function readStream(body: ReadableStream<Uint8Array>, size: number | null, onBytes: OnBytes): Promise<Uint8Array> {
  const reader = body.getReader();
  // With a known size, write straight into one buffer instead of holding every chunk plus a copy.
  let out = new Uint8Array(size ?? 0);
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size !== null && loaded + value.byteLength <= size) out.set(value, loaded);
    else chunks.push(value);
    loaded += value.byteLength;
    onBytes(loaded, size, 'network');
  }
  if (size !== null && loaded === size) return out;
  // Size unknown or wrong: assemble from whatever was received.
  const prefix = size !== null ? out.subarray(0, Math.min(loaded, size)) : new Uint8Array(0);
  out = new Uint8Array(loaded);
  out.set(prefix, 0);
  let offset = prefix.byteLength;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function fetchFile(cache: Cache, file: string, partBytes: number, onBytes: OnBytes): Promise<ArrayBuffer> {
  const url = `${REPO_BASE}/${file}`;
  const cached = await readFromCache(cache, url, onBytes);
  if (cached) return cached;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to download ${file}: ${response.status}`);
  }
  const header = response.headers?.get('content-length');
  const size = header ? Number(header) : null;
  let bytes: Uint8Array;
  if (response.body) {
    bytes = await readStream(response.body, size, onBytes);
  } else {
    bytes = new Uint8Array(await response.arrayBuffer());
    onBytes(bytes.byteLength, size ?? bytes.byteLength, 'network');
  }
  await writeToCache(cache, url, bytes, partBytes);
  return bytes.buffer as ArrayBuffer;
}

export async function ensureBundle(
  onProgress?: (info: ProgressInfo) => void,
  options: EnsureBundleOptions = {},
): Promise<BundleFiles> {
  const partBytes = options.partBytes ?? DEFAULT_PART_BYTES;
  // Best-effort: a persisted origin is exempt from automatic eviction of the multi-GB cache.
  await navigator.storage?.persist?.().catch(() => false);
  await Promise.all(OLD_CACHE_NAMES.map((name) => caches.delete(name).catch(() => false)));
  const cache = await caches.open(CACHE_NAME);
  const buffers: Record<string, ArrayBuffer> = {};
  for (let i = 0; i < FILES.length; i += 1) {
    const file = FILES[i];
    buffers[file] = await fetchFile(cache, file, partBytes, (loaded, size, source) =>
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
