import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('classifyWithModel', () => {
  beforeEach(() => {
    // vi.doMock registrations from the loadModel tests outlive vi.resetModules; this block
    // needs the real onnxruntime-web Tensor.
    vi.doUnmock('onnxruntime-web');
    vi.doUnmock('./modelBundle');
    vi.doUnmock('./tokenizer');
  });

  it('scores a single score-type question and maps the output to a SystemOneResult', async () => {
    vi.resetModules();
    const { classifyWithModel } = await import('./model');

    const fakeModel = {
      session: {
        run: vi.fn().mockResolvedValue({
          logits: { data: new Float32Array([1, 3]) },
          act_probs: { data: new Float32Array([0.42]), dims: [1, 1] },
        }),
      },
      tok: { encode: (text: string) => text.trim().split(/\s+/).filter(Boolean).map((_, i) => i), tokenToId: () => 0 },
      config: { max_len: 64, head_max_len: 32, temperature: [1, 1, 1] as [number, number, number], temperature_by_options: {} },
      ids: { cls: 101, sep: 102, mask: 103, pad: 0, maskTok: '[MASK]' },
    };

    const result = await classifyWithModel(fakeModel as never, 'refund issue', {
      urgency: { type: 'score', instructions: 'urgent?', criteria: ['low', 'high'] },
    });

    expect(result.model).toBe('laya-browser');
    expect(result.usage).toEqual({ input_tokens: 17, output_tokens: 0 });
    expect(result.answers.urgency.type).toBe('score');
    expect(result.answers.urgency.score).toBeCloseTo(0.8808, 4);
    expect(result.answers.urgency.confidence).toBeCloseTo(0.4729, 4);
    expect(result.answers.urgency.legend).toEqual({ '0': 'low', '1': 'high' });
    expect(result.answers.urgency.probabilities).toEqual({ '0': 0.1192, '1': 0.8808 });
    expect(result.answers.urgency.rl_agent.act_probability).toBeCloseTo(0.42, 6);
    expect(fakeModel.session.run).toHaveBeenCalledWith(
      expect.objectContaining({
        input_ids: expect.anything(),
        attention_mask: expect.anything(),
        marker_pos: expect.anything(),
        marker_mask: expect.anything(),
        qtype: expect.anything(),
      }),
    );
  });

  it('throws when no questions are given', async () => {
    vi.resetModules();
    const { classifyWithModel } = await import('./model');
    await expect(classifyWithModel({} as never, 'x', {})).rejects.toThrow(
      'classify: at least one question is required',
    );
  });
});

describe('classify', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('loads the model then delegates to classifyWithModel', async () => {
    vi.resetModules();
    const run = vi.fn().mockResolvedValue({
      logits: { data: new Float32Array([1, 3]) },
      act_probs: { data: new Float32Array([0.42]), dims: [1, 1] },
    });
    const onProgress = vi.fn();
    const ensureBundle = vi.fn().mockResolvedValue(fakeBundle);
    vi.doMock('./modelBundle', () => ({ ensureBundle }));
    vi.doMock('./tokenizer', () => ({
      loadTokenizer: vi.fn().mockReturnValue({
        encode: (text: string) => text.trim().split(/\s+/).filter(Boolean).map((_, i) => i),
        tokenToId: (t: string) => specialTokenIds[t],
      }),
    }));
    vi.doMock('onnxruntime-web', async (importOriginal) => ({
      ...(await importOriginal<typeof import('onnxruntime-web')>()),
      InferenceSession: { create: vi.fn().mockResolvedValue({ run }) },
    }));

    const { classify } = await import('./model');
    const result = await classify(
      'refund issue',
      { urgency: { type: 'score', instructions: 'urgent?', criteria: ['low', 'high'] } },
      onProgress,
    );

    expect(ensureBundle).toHaveBeenCalledWith(onProgress);
    expect(run).toHaveBeenCalledTimes(1);
    expect(result.answers.urgency.score).toBeCloseTo(0.8808, 4);
  });
});
