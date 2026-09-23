import { afterEach, describe, expect, it, vi } from 'vitest';

const fakeBundle = {
  onnx: new ArrayBuffer(4),
  onnxData: new ArrayBuffer(8),
  config: { max_len: 64, head_max_len: 32, temperature: [1, 1, 1] as [number, number, number], temperature_by_options: {} },
  tokenizerJson: { fake: 'tokenizer' },
  tokenizerConfigJson: { fake: 'config' },
};

const specialTokenIds: Record<string, number> = { '[CLS]': 101, '[SEP]': 102, '[MASK]': 103, '[PAD]': 0 };

function mockTokenizer() {
  return { encode: vi.fn(), tokenToId: (t: string) => specialTokenIds[t] };
}

describe('loadModel', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('resolves the special token ids and opens an onnxruntime-web session with externalData', async () => {
    const ensureBundle = vi.fn().mockResolvedValue(fakeBundle);
    vi.doMock('./modelBundle', () => ({ ensureBundle }));
    const loadTokenizer = vi.fn().mockReturnValue(mockTokenizer());
    vi.doMock('./tokenizer', () => ({ loadTokenizer }));
    const fakeSession = { run: vi.fn() };
    const create = vi.fn().mockResolvedValue(fakeSession);
    vi.doMock('onnxruntime-web', () => ({ InferenceSession: { create } }));

    const { loadModel } = await import('./model');
    const model = await loadModel();

    expect(loadTokenizer).toHaveBeenCalledWith(fakeBundle.tokenizerJson, fakeBundle.tokenizerConfigJson);
    expect(model.ids).toEqual({ cls: 101, sep: 102, mask: 103, pad: 0, maskTok: '[MASK]' });
    expect(create).toHaveBeenCalledWith(
      fakeBundle.onnx,
      expect.objectContaining({
        executionProviders: ['wasm'],
        externalData: [{ path: 'laya.onnx.data', data: fakeBundle.onnxData }],
      }),
    );
    expect(model.session).toBe(fakeSession);
    expect(model.config).toBe(fakeBundle.config);
  });

  it('loads the bundle only once across multiple loadModel calls', async () => {
    const ensureBundle = vi.fn().mockResolvedValue(fakeBundle);
    vi.doMock('./modelBundle', () => ({ ensureBundle }));
    vi.doMock('./tokenizer', () => ({ loadTokenizer: vi.fn().mockReturnValue(mockTokenizer()) }));
    vi.doMock('onnxruntime-web', () => ({ InferenceSession: { create: vi.fn().mockResolvedValue({ run: vi.fn() }) } }));

    const { loadModel } = await import('./model');
    await loadModel();
    await loadModel();

    expect(ensureBundle).toHaveBeenCalledTimes(1);
  });

  it('retries loading if a previous attempt failed', async () => {
    const ensureBundle = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(fakeBundle);
    vi.doMock('./modelBundle', () => ({ ensureBundle }));
    vi.doMock('./tokenizer', () => ({ loadTokenizer: vi.fn().mockReturnValue(mockTokenizer()) }));
    vi.doMock('onnxruntime-web', () => ({ InferenceSession: { create: vi.fn().mockResolvedValue({ run: vi.fn() }) } }));

    const { loadModel } = await import('./model');

    await expect(loadModel()).rejects.toThrow('network down');
    await expect(loadModel()).resolves.toBeDefined();
    expect(ensureBundle).toHaveBeenCalledTimes(2);
  });

  it('throws a clear error when a required special token is missing from the tokenizer', async () => {
    vi.doMock('./modelBundle', () => ({ ensureBundle: vi.fn().mockResolvedValue(fakeBundle) }));
    vi.doMock('./tokenizer', () => ({
      loadTokenizer: vi.fn().mockReturnValue({ encode: vi.fn(), tokenToId: () => undefined }),
    }));
    vi.doMock('onnxruntime-web', () => ({ InferenceSession: { create: vi.fn() } }));

    const { loadModel } = await import('./model');

    await expect(loadModel()).rejects.toThrow('special token [CLS] missing from tokenizer');
  });
});
