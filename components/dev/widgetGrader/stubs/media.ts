// Synthetic camera and microphone so Webcam and Sound mount in browsers with no devices.

const DEVICES = [
  { kind: 'videoinput', deviceId: 'grader-camera', label: 'Grader camera' },
  { kind: 'audioinput', deviceId: 'grader-mic', label: 'Grader microphone' },
] as const;

const fakeVideoTrack = (): MediaStreamTrack => {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const bars = ['#e2e8f0', '#facc15', '#22d3ee', '#4ade80', '#e879f9'];
    bars.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect((i * canvas.width) / bars.length, 0, canvas.width, 480);
    });
  }
  return canvas.captureStream(1).getVideoTracks()[0];
};

const fakeAudioTrack = (): MediaStreamTrack => {
  const audio = new AudioContext();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  gain.gain.value = 0.02;
  const dest = audio.createMediaStreamDestination();
  osc.connect(gain).connect(dest);
  osc.start();
  return dest.stream.getAudioTracks()[0];
};

const getUserMedia = (constraints?: MediaStreamConstraints) => {
  const tracks: MediaStreamTrack[] = [];
  if (constraints?.video) tracks.push(fakeVideoTrack());
  if (constraints?.audio) tracks.push(fakeAudioTrack());
  return Promise.resolve(new MediaStream(tracks));
};

export const installFakeMedia = (): void => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices: () => Promise.resolve(DEVICES),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
};
