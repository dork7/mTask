import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REPO_BASE = 'https://huggingface.co/receptron/laya-onnx/resolve/main';
const CONFIG = { max_len: 64, head_max_len: 32, temperature: [1, 1, 1], temperature_by_options: {} };

function jsonBuffer(value: unknown): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer;
}

function streamResponse(bytes: number[], chunkSize = 3) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-length': String(bytes.length) }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += chunkSize) {
          controller.enqueue(new Uint8Array(bytes.slice(i, i + chunkSize)));
        }
        controller.close();
      },
    }),
  };
}

/** Map-backed stand-in for a Cache Storage cache. */
function fakeCache() {
  const entries = new Map<string, ArrayBuffer>();
  return {
    entries,
    match: vi.fn(async (url: string) => {
      const buf = entries.get(url);
      return buf ? new Response(buf.slice(0)) : undefined;
    }),
    put: vi.fn(async (url: string, response: Response) => {
      entries.set(url, await response.arrayBuffer());
    }),
  };
}

describe('ensureBundle', () => {
  let cache: ReturnType<typeof fakeCache>;
  let cacheDelete: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;
  const bodies: Record<string, ArrayBuffer> = {
    'laya.onnx': new ArrayBuffer(4),
    'laya.onnx.data': new ArrayBuffer(8),
    'laya_config.json': jsonBuffer(CONFIG),
    'tokenizer/tokenizer.json': jsonBuffer({ fake: 'tokenizer' }),
    'tokenizer/tokenizer_config.json': jsonBuffer({ fake: 'config' }),
  };

  beforeEach(() => {
    cache = fakeCache();
    cacheDelete = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache), delete: cacheDelete });
    fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(bodies[url.replace(`${REPO_BASE}/`, '')].slice(0)),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches all 5 bundle files from the Hugging Face repo and parses the JSON ones', async () => {
    const { ensureBundle } = await import('./modelBundle');

    const bundle = await ensureBundle();

    for (const file of Object.keys(bodies)) {
      expect(fetchMock).toHaveBeenCalledWith(`${REPO_BASE}/${file}`);
    }
    expect(bundle.onnx.byteLength).toBe(4);
    expect(bundle.onnxData.byteLength).toBe(8);
    expect(bundle.config).toEqual(CONFIG);
    expect(bundle.tokenizerJson).toEqual({ fake: 'tokenizer' });
    expect(bundle.tokenizerConfigJson).toEqual({ fake: 'config' });
  });

  it('reports progress for each file, in order, with an increasing index', async () => {
    const { ensureBundle } = await import('./modelBundle');
    const onProgress = vi.fn();

    await ensureBundle(onProgress);

    expect(onProgress).toHaveBeenCalledTimes(5);
    expect(onProgress).toHaveBeenNthCalledWith(1, expect.objectContaining({ file: 'laya.onnx', index: 1, total: 5 }));
    expect(onProgress).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({ file: 'tokenizer/tokenizer_config.json', index: 5, total: 5 }),
    );
  });

  it('throws when a file fails to download', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    const { ensureBundle } = await import('./modelBundle');

    await expect(ensureBundle()).rejects.toThrow('failed to download laya.onnx: 404');
  });

  it('reports bytes received while streaming a file body, using content-length as the size', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(streamResponse([1, 2, 3, 4, 5])));
    const { ensureBundle } = await import('./modelBundle');
    const onProgress = vi.fn();

    const bundle = await ensureBundle(onProgress);

    expect(Array.from(new Uint8Array(bundle.onnx))).toEqual([1, 2, 3, 4, 5]);
    expect(onProgress).toHaveBeenCalledWith({ file: 'laya.onnx', index: 1, total: 5, loaded: 3, size: 5, source: 'network' });
    expect(onProgress).toHaveBeenCalledWith({ file: 'laya.onnx', index: 1, total: 5, loaded: 5, size: 5, source: 'network' });
  });

  it('caches large files in parts no bigger than partBytes, and a second load reads them back without fetching', async () => {
    const data = Array.from({ length: 10 }, (_, i) => i + 1);
    fetchMock.mockImplementation((url: string) =>
      url.endsWith('laya.onnx.data')
        ? Promise.resolve(streamResponse(data))
        : Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(bodies[url.replace(`${REPO_BASE}/`, '')].slice(0)) }),
    );
    const { ensureBundle } = await import('./modelBundle');

    await ensureBundle(undefined, { partBytes: 4 });

    const dataParts = [...cache.entries.entries()].filter(([k]) => k.startsWith(`${REPO_BASE}/laya.onnx.data?part=`));
    expect(dataParts.map(([, v]) => v.byteLength)).toEqual([4, 4, 2]);

    fetchMock.mockClear();
    const onProgress = vi.fn();
    const again = await ensureBundle(onProgress, { partBytes: 4 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(Array.from(new Uint8Array(again.onnxData))).toEqual(data);
    expect(again.config).toEqual(CONFIG);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ file: 'laya.onnx.data', source: 'cache' }));
  });

  it('still returns the model when a cache write fails, and downloads that file again next time', async () => {
    const put = cache.put.getMockImplementation()!;
    cache.put.mockImplementation(async (url: string, response: Response) => {
      if (url.includes('laya.onnx.data')) throw new DOMException('Unexpected internal error.', 'UnknownError');
      return put(url, response);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { ensureBundle } = await import('./modelBundle');

    const bundle = await ensureBundle();
    expect(bundle.onnxData.byteLength).toBe(8);
    expect(warn).toHaveBeenCalled();

    fetchMock.mockClear();
    await ensureBundle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${REPO_BASE}/laya.onnx.data`);
  });

  it('removes the old single-entry cache from earlier versions', async () => {
    const { ensureBundle } = await import('./modelBundle');

    await ensureBundle();

    expect(cacheDelete).toHaveBeenCalledWith('laya-model-v1');
  });

  it('asks the browser to persist storage so the cached model is less likely to be evicted', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { ...navigator, storage: { persist } });
    const { ensureBundle } = await import('./modelBundle');

    await ensureBundle();

    expect(persist).toHaveBeenCalled();
  });

  it('still loads the bundle when storage persistence is unsupported or rejected', async () => {
    vi.stubGlobal('navigator', { ...navigator, storage: { persist: vi.fn().mockRejectedValue(new Error('nope')) } });
    const { ensureBundle } = await import('./modelBundle');

    await expect(ensureBundle()).resolves.toBeDefined();
  });
});
