import * as ort from 'onnxruntime-web';
import { ensureBundle, type ProgressInfo } from './modelBundle';
import { loadTokenizer, type LoadedTokenizer } from './tokenizer';
import type { LayaConfig } from './types';

export interface SpecialIds {
  cls: number;
  sep: number;
  mask: number;
  pad: number;
  maskTok: string;
}

export interface LayaModel {
  session: ort.InferenceSession;
  tok: LoadedTokenizer;
  config: LayaConfig;
  ids: SpecialIds;
}

let modelPromise: Promise<LayaModel> | undefined;

export function loadModel(onProgress?: (info: ProgressInfo) => void): Promise<LayaModel> {
  if (!modelPromise) {
    modelPromise = buildModel(onProgress).catch((error) => {
      modelPromise = undefined;
      throw error;
    });
  }
  return modelPromise;
}

async function buildModel(onProgress?: (info: ProgressInfo) => void): Promise<LayaModel> {
  const bundle = await ensureBundle(onProgress);
  const tok = loadTokenizer(bundle.tokenizerJson, bundle.tokenizerConfigJson);
  const id = (t: string) => {
    const v = tok.tokenToId(t);
    if (v === undefined) throw new Error(`special token ${t} missing from tokenizer`);
    return v;
  };
  const ids: SpecialIds = { cls: id('[CLS]'), sep: id('[SEP]'), mask: id('[MASK]'), pad: id('[PAD]'), maskTok: '[MASK]' };
  const session = await ort.InferenceSession.create(bundle.onnx, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    externalData: [{ path: 'laya.onnx.data', data: bundle.onnxData }],
  });
  return { session, tok, config: bundle.config, ids };
}
