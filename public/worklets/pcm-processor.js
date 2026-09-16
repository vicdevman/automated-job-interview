/**
 * Microphone → PCM S16LE frames at the provider's declared sample rate.
 *
 * Lives in /public rather than lib/ because AudioWorklet.addModule() loads a
 * URL, not a bundled module.
 *
 * Two jobs:
 *   1. resample from the AudioContext rate to the target rate. The context is
 *      usually opened at the target rate already, in which case this is a
 *      no-op; Safari does not always honour a requested rate, so the fallback
 *      path does linear interpolation rather than silently sending 48kHz audio
 *      labelled as 16kHz.
 *   2. pack samples into fixed-size frames so the socket sends steady chunks
 *      instead of one message per 128-sample render quantum.
 *
 * It also reports a running RMS to the main thread, which drives barge-in
 * detection and the mic level meter — computed here so the UI never has to run
 * its own analyser over the input.
 */
class PcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.targetRate = opts.targetRate || 16000;
    this.frameSize = opts.frameSize || 1024;

    this.ratio = sampleRate / this.targetRate;
    this.needsResample = Math.abs(this.ratio - 1) > 0.001;

    this.buffer = new Float32Array(this.frameSize);
    this.filled = 0;

    // Fractional read position into the incoming block when resampling.
    this.readPos = 0;
    this.lastSample = 0;

    this.muted = false;

    // RMS is accumulated from the RAW input, never from what we transmit.
    // While muted we transmit silence but must still report the true level, or
    // barge-in could never fire during the interviewer's turn.
    this.sumSquares = 0;
    this.sampleCount = 0;
    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'mute') this.muted = Boolean(data.value);
    };
  }

  /** Pushes one target-rate sample, emitting a frame once the buffer is full. */
  push(sample) {
    this.buffer[this.filled++] = sample;
    if (this.filled < this.frameSize) return;

    const pcm = new Int16Array(this.frameSize);
    for (let i = 0; i < this.frameSize; i++) {
      const s = Math.max(-1, Math.min(1, this.buffer[i]));
      // Asymmetric scaling: Int16 range is -32768..32767.
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    const rms = this.sampleCount > 0 ? Math.sqrt(this.sumSquares / this.sampleCount) : 0;
    this.sumSquares = 0;
    this.sampleCount = 0;

    this.port.postMessage({ type: 'frame', pcm: pcm.buffer, rms: rms }, [pcm.buffer]);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || channel.length === 0) return true;

    // Always measure the real microphone, muted or not.
    for (let i = 0; i < channel.length; i++) {
      this.sumSquares += channel[i] * channel[i];
    }
    this.sampleCount += channel.length;

    if (this.muted) {
      // Still emit frames so the socket keeps receiving audio and the session
      // does not idle out during the interviewer's turn (PRD §6.1 step 4).
      for (let i = 0; i < channel.length; i++) this.push(0);
      return true;
    }

    if (!this.needsResample) {
      for (let i = 0; i < channel.length; i++) this.push(channel[i]);
      return true;
    }

    // Linear interpolation between the previous block's tail and this block.
    let pos = this.readPos;
    while (pos < channel.length) {
      const index = Math.floor(pos);
      const frac = pos - index;
      const a = index === 0 ? this.lastSample : channel[index - 1];
      const b = channel[index];
      this.push(a + (b - a) * frac);
      pos += this.ratio;
    }
    this.readPos = pos - channel.length;
    this.lastSample = channel[channel.length - 1];
    return true;
  }
}

registerProcessor('pcm-processor', PcmProcessor);
