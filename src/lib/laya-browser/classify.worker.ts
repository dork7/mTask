// Runs the model off the main thread: tokenizing, building the ~1.7GB session and
// inference would otherwise freeze the page until they finish.
import { classify } from './model';
import type { ClassifyRequest, ClassifyResponse } from './classifyClient';

const post = (message: ClassifyResponse) => self.postMessage(message);

// One request at a time: the ONNX session is shared and can't run concurrently.
let queue: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<ClassifyRequest>) => {
  const { id, state, questions } = event.data;
  queue = queue.then(() =>
    classify(state, questions, (progress) => post({ id, progress })).then(
      (result) => post({ id, result }),
      (error: unknown) => post({ id, error: error instanceof Error ? error.message : String(error) }),
    ),
  );
};
