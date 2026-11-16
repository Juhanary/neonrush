import type { GameAudio, MusicTrack } from '../audio/audio';
import { musicStart, type CustomLevel } from '../core/custom';
import type { CustomStore } from './custom-store';

/**
 * Decoded music of custom tracks. A decoded song is tens of megabytes, so only the one last used is kept.
 */
export class Tracks {
  private id = '';
  private buf?: AudioBuffer;

  constructor(private store: CustomStore, private audio: GameAudio) {}

  /** The editor decoded a file itself. */
  set(id: string, buf: AudioBuffer | undefined): void { this.id = buf ? id : ''; this.buf = buf; }

  /** Decoded file of a track, or undefined when it has none, the file is not on this device, or it cannot be decoded. */
  async buffer(level: CustomLevel): Promise<AudioBuffer | undefined> {
    if (!level.music) return undefined;
    if (this.id === level.id && this.buf) return this.buf;
    try {
      const data = await this.store.getAudio(level.id);
      if (!data) return undefined;
      // decoding detaches the buffer it is given
      const buf = await this.audio.decode(data.slice(0));
      this.set(level.id, buf);
      return buf;
    } catch { return undefined; }
  }

  /** The music of a track as the audio engine takes it. */
  async track(level: CustomLevel): Promise<MusicTrack | undefined> {
    const buf = await this.buffer(level);
    return buf && level.music ? { buf, bpm: level.music.bpm, start: musicStart(level.music) } : undefined;
  }
}
