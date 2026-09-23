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

type OnBytes = (loaded: number, size: number | null) => void;

async function readBody(response: Response, onBytes: OnBytes): Promise<ArrayBuffer> {
  const header = response.headers?.get('content-length');
  const size = header ? Number(header) : null;
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onBytes(buffer.byteLength, size ?? buffer.byteLength);
    return buffer;
  }
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onBytes(loaded, size);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

async function fetchFile(file: string, onBytes: OnBytes): Promise<ArrayBuffer> {
  const url = `${REPO_BASE}/${file}`;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) {
    const buffer = await cached.arrayBuffer();
    onBytes(buffer.byteLength, buffer.byteLength);
    return buffer;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to download ${file}: ${response.status}`);
  }
  const buffer = await readBody(response, onBytes);
  await cache.put(url, new Response(buffer));
  return buffer;
}

export async function ensureBundle(onProgress?: (info: ProgressInfo) => void): Promise<BundleFiles> {
  // Best-effort: a persisted origin is exempt from automatic eviction of the multi-GB cache.
  await navigator.storage?.persist?.().catch(() => false);
  const buffers: Record<string, ArrayBuffer> = {};
  for (let i = 0; i < FILES.length; i += 1) {
    const file = FILES[i];
    buffers[file] = await fetchFile(file, (loaded, size) =>
      onProgress?.({ file, index: i + 1, total: FILES.length, loaded, size }),
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
