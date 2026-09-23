import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REPO_BASE = 'https://huggingface.co/receptron/laya-onnx/resolve/main';

function jsonBuffer(value: unknown): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer;
}

describe('ensureBundle', () => {
  let cachePut: ReturnType<typeof vi.fn>;
  let cacheMatch: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cachePut = vi.fn().mockResolvedValue(undefined);
    cacheMatch = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('caches', {
      open: vi.fn().mockResolvedValue({ match: cacheMatch, put: cachePut }),
    });
    fetchMock = vi.fn().mockImplementation((url: string) => {
      const file = url.replace(`${REPO_BASE}/`, '');
      const bodies: Record<string, ArrayBuffer> = {
        'laya.onnx': new ArrayBuffer(4),
        'laya.onnx.data': new ArrayBuffer(8),
        'laya_config.json': jsonBuffer({ max_len: 64, head_max_len: 32, temperature: [1, 1, 1], temperature_by_options: {} }),
        'tokenizer/tokenizer.json': jsonBuffer({ fake: 'tokenizer' }),
        'tokenizer/tokenizer_config.json': jsonBuffer({ fake: 'config' }),
      };
      return Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(bodies[file]),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches all 5 bundle files from the Hugging Face repo and parses the JSON ones', async () => {
    const { ensureBundle } = await import('./modelBundle');

    const bundle = await ensureBundle();

    expect(fetchMock).toHaveBeenCalledWith(`${REPO_BASE}/laya.onnx`);
    expect(fetchMock).toHaveBeenCalledWith(`${REPO_BASE}/laya.onnx.data`);
    expect(fetchMock).toHaveBeenCalledWith(`${REPO_BASE}/laya_config.json`);
    expect(fetchMock).toHaveBeenCalledWith(`${REPO_BASE}/tokenizer/tokenizer.json`);
    expect(fetchMock).toHaveBeenCalledWith(`${REPO_BASE}/tokenizer/tokenizer_config.json`);
    expect(bundle.onnx.byteLength).toBe(4);
    expect(bundle.onnxData.byteLength).toBe(8);
    expect(bundle.config).toEqual({ max_len: 64, head_max_len: 32, temperature: [1, 1, 1], temperature_by_options: {} });
    expect(bundle.tokenizerJson).toEqual({ fake: 'tokenizer' });
    expect(bundle.tokenizerConfigJson).toEqual({ fake: 'config' });
  });

  it('reports progress once per file, in order, with an increasing index', async () => {
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

  it('serves a file from Cache Storage instead of fetching when already cached', async () => {
    cacheMatch.mockImplementation((url: string) =>
      url.endsWith('laya_config.json')
        ? Promise.resolve({
            arrayBuffer: () =>
              Promise.resolve(
                jsonBuffer({ max_len: 1, head_max_len: 1, temperature: [1, 1, 1], temperature_by_options: {} }),
              ),
          })
        : Promise.resolve(undefined),
    );
    const { ensureBundle } = await import('./modelBundle');

    await ensureBundle();

    expect(fetchMock).not.toHaveBeenCalledWith(`${REPO_BASE}/laya_config.json`);
  });

  it('throws when a file fails to download', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    const { ensureBundle } = await import('./modelBundle');

    await expect(ensureBundle()).rejects.toThrow('failed to download laya.onnx: 404');
  });

  it('reports bytes received while streaming a file body, using content-length as the size', async () => {
    const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])];
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '5' }),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            chunks.forEach((c) => controller.enqueue(c));
            controller.close();
          },
        }),
      }),
    );
    const { ensureBundle } = await import('./modelBundle');
    const onProgress = vi.fn();

    const bundle = await ensureBundle(onProgress);

    expect(Array.from(new Uint8Array(bundle.onnx))).toEqual([1, 2, 3, 4, 5]);
    expect(onProgress).toHaveBeenCalledWith({ file: 'laya.onnx', index: 1, total: 5, loaded: 3, size: 5, source: 'network' });
    expect(onProgress).toHaveBeenCalledWith({ file: 'laya.onnx', index: 1, total: 5, loaded: 5, size: 5, source: 'network' });
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

  it('streams a downloaded file into Cache Storage under its URL', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '3' }),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([7, 8, 9]));
            controller.close();
          },
        }),
      }),
    );
    const { ensureBundle } = await import('./modelBundle');

    await ensureBundle();

    const [url, stored] = cachePut.mock.calls.find(([u]) => u === `${REPO_BASE}/laya.onnx`)!;
    expect(url).toBe(`${REPO_BASE}/laya.onnx`);
    expect(Array.from(new Uint8Array(await (stored as Response).arrayBuffer()))).toEqual([7, 8, 9]);
  });

  it('still returns the model when writing it to Cache Storage fails', async () => {
    cachePut.mockRejectedValue(new DOMException('quota exceeded', 'QuotaExceededError'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { ensureBundle } = await import('./modelBundle');

    const bundle = await ensureBundle();

    expect(bundle.onnxData.byteLength).toBe(8);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reports whether each file came from the cache or the network', async () => {
    cacheMatch.mockImplementation((url: string) =>
      url.endsWith('laya.onnx.data')
        ? Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })
        : Promise.resolve(undefined),
    );
    const { ensureBundle } = await import('./modelBundle');
    const onProgress = vi.fn();

    await ensureBundle(onProgress);

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ file: 'laya.onnx.data', source: 'cache' }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ file: 'laya.onnx', source: 'network' }));
    expect(fetchMock).not.toHaveBeenCalledWith(`${REPO_BASE}/laya.onnx.data`);
  });
});
