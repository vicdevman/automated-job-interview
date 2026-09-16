import 'server-only';
import type { SttBatchProvider } from './types';
import { NotImplementedError } from '../errors';

/**
 * Whisper as a BATCH provider. PRD §2.1 note on objective 1: Whisper has no
 * realtime streaming API, so it cannot back the live interview — it stays
 * available behind the same registry for whole-file transcription.
 * Implemented in Phase 3.
 */
export const whisperBatch: SttBatchProvider = {
  id: 'whisper',
  mode: 'batch',
  async transcribe() {
    throw new NotImplementedError('Whisper batch transcription');
  },
};
