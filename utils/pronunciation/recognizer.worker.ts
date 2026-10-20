// Owns the ONNX session off the main thread (F26): single-threaded WASM, CPU only.
import * as ort from 'onnxruntime-web-1-30';
import wasmUrl from '../../node_modules/onnxruntime-web-1-30/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import { PRONUNCIATION_MODEL } from '@/config/pronunciationModel';
import vocab from './xlsr53EspeakVocab.json';
import { normalizeForWav2Vec2 } from './audio';
import { greedyCtcDecode, invertVocab } from './ctcDecode';
import { logSoftmax } from './likelihood';
import { ModelLoadError, loadModel } from './modelCache';
import {
  meanNonBlankConfidence,
  type WorkerRequest,
  type WorkerResponse,
} from './recognizerCore';

ort.env.wasm.wasmPaths = { wasm: wasmUrl };
ort.env.wasm.numThreads = 1;

const SYMBOLS = invertVocab(vocab);
let session: ort.InferenceSession | null = null;

const post = (msg: WorkerResponse) => self.postMessage(msg);

async function load(urls: string[]): Promise<void> {
  let bytes: Uint8Array;
  let source: 'cache' | 'network';
  try {
    const loaded = await loadModel(urls, PRONUNCIATION_MODEL, (l, t) =>
      post({ type: 'progress', loaded: l, total: t })
    );
    bytes = loaded.bytes;
    source = loaded.source;
  } catch (err) {
    post({
      type: 'load-error',
      reason: err instanceof ModelLoadError ? err.reason : 'download-failed',
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  post({ type: 'starting' });
  try {
    session = await ort.InferenceSession.create(bytes, {
      executionProviders: ['wasm'],
    });
  } catch (err) {
    post({
      type: 'load-error',
      reason: 'no-wasm',
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  post({ type: 'loaded', source });
}

async function recognize(id: number, audio: Float32Array): Promise<void> {
  try {
    if (!session) throw new Error('Model not loaded');
    const input = normalizeForWav2Vec2(audio);
    const feeds: Record<string, ort.Tensor> = {
      [session.inputNames[0]]: new ort.Tensor('float32', input, [
        1,
        input.length,
      ]),
    };
    if (session.inputNames.includes('attention_mask')) {
      feeds.attention_mask = new ort.Tensor(
        'int64',
        new BigInt64Array(input.length).fill(1n),
        [1, input.length]
      );
    }
    const out = await session.run(feeds);
    const logits = out[session.outputNames[0]];
    const [, frames, vocabSize] = logits.dims;
    const data = logits.data as Float32Array;
    const { tokens } = greedyCtcDecode(
      data,
      frames,
      vocabSize,
      SYMBOLS,
      PRONUNCIATION_MODEL.padId
    );
    const confidence = meanNonBlankConfidence(
      data,
      frames,
      vocabSize,
      PRONUNCIATION_MODEL.padId
    );
    const logProbs = {
      data: logSoftmax(data, frames, vocabSize),
      frames,
      vocabSize,
    };
    logits.dispose();
    self.postMessage(
      {
        type: 'result',
        id,
        tokens,
        confidence,
        logProbs,
      } satisfies WorkerResponse,
      { transfer: [logProbs.data.buffer] }
    );
  } catch (err) {
    post({
      type: 'recognize-error',
      id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'load') void load(msg.urls);
  else void recognize(msg.id, msg.audio);
};
