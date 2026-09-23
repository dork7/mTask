import * as ort from 'onnxruntime-web';
import { ensureBundle, type ProgressInfo } from './modelBundle';
import { loadTokenizer, type LoadedTokenizer } from './tokenizer';
import { buildSequence, confidenceFromProbs, QTYPES, renderOptions, softmax, tempBucket, toInternal } from './sequence';
import type { Answer, LayaConfig, Question, SystemOneResult } from './types';

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

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

export async function classifyWithModel<Q extends Record<string, Question>>(
  model: LayaModel,
  state: unknown,
  questions: Q,
): Promise<SystemOneResult<Q>> {
  const qids = Object.keys(questions);
  if (qids.length === 0) {
    throw new Error('classify: at least one question is required');
  }
  const items = qids.map((qid) => {
    const q = toInternal(questions[qid]);
    const { ids, markers } = buildSequence(model.tok.encode, model.ids, state, q, model.config.max_len, model.config.head_max_len);
    if (markers.length !== renderOptions(q).length) {
      throw new Error(`question ${JSON.stringify(qid)}: options do not fit in head_max_len=${model.config.head_max_len} tokens`);
    }
    return { q, ids, markers, qtype: QTYPES[q.t] };
  });

  const n = items.length;
  const L = Math.max(...items.map((it) => it.ids.length));
  const K = Math.max(...items.map((it) => it.markers.length));
  const inputIds = new BigInt64Array(n * L).fill(BigInt(model.ids.pad));
  const attention = new BigInt64Array(n * L);
  const markerPos = new BigInt64Array(n * K);
  const markerMask = new Uint8Array(n * K);
  const qtype = new BigInt64Array(n);
  let nTokens = 0;

  items.forEach((it, i) => {
    it.ids.forEach((v, j) => {
      inputIds[i * L + j] = BigInt(v);
      attention[i * L + j] = 1n;
    });
    nTokens += it.ids.length;
    it.markers.forEach((m, j) => {
      markerPos[i * K + j] = BigInt(m);
      markerMask[i * K + j] = 1;
    });
    qtype[i] = BigInt(it.qtype);
  });

  const out = await model.session.run({
    input_ids: new ort.Tensor('int64', inputIds, [n, L]),
    attention_mask: new ort.Tensor('int64', attention, [n, L]),
    marker_pos: new ort.Tensor('int64', markerPos, [n, K]),
    marker_mask: new ort.Tensor('bool', markerMask, [n, K]),
    qtype: new ort.Tensor('int64', qtype, [n]),
  });

  const logits = out.logits?.data;
  const act = out.act_probs;
  if (!(logits instanceof Float32Array) || !act || !(act.data instanceof Float32Array)) {
    throw new Error('unexpected model outputs (expected float32 logits and act_probs)');
  }
  const actData = act.data;
  const nAct = (act.dims as readonly number[])[1] ?? 1;
  const answers: Record<string, Answer> = {};

  items.forEach((it, r) => {
    const qid = qids[r];
    const k = it.markers.length;
    const temp = model.config.temperature_by_options[tempBucket(it.qtype, k)] ?? model.config.temperature[it.qtype] ?? 1;
    const p = softmax(Array.from(logits.subarray(r * K, r * K + k), (v) => v / temp));
    const ext = { act_probability: actData[r * nAct] ?? 0 };
    const q = it.q;
    if (q.t === 'choice') {
      const keys = Object.keys(q.crit as Record<string, string | null>);
      const best = p.indexOf(Math.max(...p));
      answers[qid] = {
        type: 'choice',
        choice: keys[best],
        probabilities: Object.fromEntries(keys.map((kk, i) => [kk, round4(p[i] ?? 0)])),
        confidence: round4(confidenceFromProbs(p)),
        rl_agent: ext,
      };
    } else if (q.t === 'score') {
      const crit = q.crit as string[];
      answers[qid] = {
        type: 'score',
        score: round4(p.reduce((s, v, i) => s + i * v, 0)),
        legend: Object.fromEntries(crit.map((c, i) => [String(i), c])),
        probabilities: Object.fromEntries(p.map((v, i) => [String(i), round4(v)])),
        confidence: round4(confidenceFromProbs(p)),
        rl_agent: ext,
      };
    } else {
      answers[qid] = { type: 'noul', noul: round4(p[1] ?? 0), rl_agent: ext };
    }
  });

  return {
    model: 'laya-browser',
    answers: answers as SystemOneResult<Q>['answers'],
    usage: { input_tokens: nTokens, output_tokens: 0 },
  };
}

export async function classify<Q extends Record<string, Question>>(
  state: unknown,
  questions: Q,
  onProgress?: (info: ProgressInfo) => void,
): Promise<SystemOneResult<Q>> {
  const model = await loadModel(onProgress);
  return classifyWithModel(model, state, questions);
}
