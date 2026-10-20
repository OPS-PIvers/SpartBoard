import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  synthesizeSpeech: vi.fn(),
  download: vi.fn(),
}));

vi.mock('@google-cloud/text-to-speech', () => ({
  TextToSpeechClient: class {
    synthesizeSpeech = mocks.synthesizeSpeech;
  },
}));
vi.mock('firebase-admin', () => ({
  storage: () => ({
    bucket: () => ({ file: () => ({ download: mocks.download }) }),
  }),
}));

import { createVoiceReader, VoiceServiceError } from './voiceRefs';

const take = readFileSync(
  resolve(__dirname, 'testdata/voices/es-ES-Neural2-A_perro.wav')
);
const fakeModel = () =>
  Promise.resolve({ data: new Float32Array(392), frames: 1, size: 392 });

beforeEach(() => {
  mocks.synthesizeSpeech.mockReset();
  mocks.download.mockReset();
});

describe('Cloud TTS errors', () => {
  it.each([7, 8, 16])('stops the request on code %i', async (code) => {
    mocks.synthesizeSpeech.mockRejectedValue(
      Object.assign(new Error('refused'), { code })
    );
    const r = createVoiceReader({ runModel: fakeModel });
    await expect(r.read('es-ES-Neural2-A', 'perro')).rejects.toBeInstanceOf(
      VoiceServiceError
    );
  });

  it.each([3, 5])('treats code %i as a voice with no reading', async (code) => {
    mocks.synthesizeSpeech.mockRejectedValue(
      Object.assign(new Error('bad voice'), { code })
    );
    const r = createVoiceReader({ runModel: fakeModel });
    expect(await r.read('es-ES-Neural2-A', 'perro')).toEqual([]);
  });

  it('lets other errors fail only that voice', async () => {
    mocks.synthesizeSpeech.mockRejectedValue(
      Object.assign(new Error('unavailable'), { code: 14 })
    );
    const r = createVoiceReader({ runModel: fakeModel });
    const err: unknown = await r
      .read('es-ES-Neural2-A', 'perro')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(VoiceServiceError);
  });

  it('asks for 16 kHz LINEAR16 in the voice locale and decodes base64 audio', async () => {
    mocks.synthesizeSpeech.mockResolvedValue([
      { audioContent: take.toString('base64') },
    ]);
    const runModel = vi.fn(fakeModel);
    const r = createVoiceReader({ runModel });
    expect(await r.read('es-US-Neural2-A', 'perro')).toEqual([]);
    expect(runModel).toHaveBeenCalledTimes(1);
    expect(mocks.synthesizeSpeech.mock.calls[0][0]).toEqual({
      input: { text: 'perro' },
      voice: { languageCode: 'es-US', name: 'es-US-Neural2-A' },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 16000 },
    });
  });
});

describe('the stored model', () => {
  it('refuses a model that is not the pinned one and does not download it again right away', async () => {
    mocks.synthesizeSpeech.mockResolvedValue([{ audioContent: take }]);
    mocks.download.mockResolvedValue([Buffer.from('not a model')]);
    const r = createVoiceReader({
      synthesize: () => Promise.resolve(new Uint8Array(take)),
    });
    await expect(r.read('es-ES-Neural2-A', 'perro')).rejects.toBeInstanceOf(
      VoiceServiceError
    );
    await expect(r.read('es-ES-Neural2-F', 'perro')).rejects.toBeInstanceOf(
      VoiceServiceError
    );
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });
});
