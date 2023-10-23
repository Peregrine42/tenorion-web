import _ from "lodash";
import { forRange } from "./utils";
import {
  Player as TonePlayer,
  connect as toneConnect,
  Channel as ToneChannel,
  ToneAudioNode,
  Gain,
  Compressor,
  Reverb,
} from "tone";
import { clearRequestInterval, requestInterval } from "./requestInterval";

export type InstrumentPitch = {
  name: string;
  sample: string;
  format: string;
  gain?: number;
  offset?: number;
};

export type Instrument = {
  name: string;
  pitches: InstrumentPitch[];
  continuous: boolean;
};

type ReadyInstrumentPitch = {
  settings: InstrumentPitch;
  index: number;
  continuous: boolean;
  gain: number;
  offset: number;
  loop: {
    value?: number;
  }[];
  playing: boolean;
  samplerName: string;
};

type Activation = {
  pitch: ReadyInstrumentPitch;
  subBeat: number;
  active: boolean;
};

type Playing = {
  subBeatsPlayed: number;
  endDueAfter: number;
  note: Note;
};

type Note = {
  startIndex: number;
  endIndex: number;
  duration: number;
  pitch: ReadyInstrumentPitch;
};

export class SampleBank {
  samplers: Record<string, TonePlayer>;

  constructor(public mainOutput: ToneChannel) {
    this.samplers = {};
  }

  async setupNewSampler(
    name: string,
    sample: string,
    gain: number = 0,
    continuous: boolean = false
  ) {
    const sampler = await new Promise<TonePlayer>((r) => {
      const s: TonePlayer = new TonePlayer(sample, () => {
        toneConnect(s, this.mainOutput);
        r(s);
      });
    });

    sampler.volume.value = gain;

    if (continuous) {
      sampler.loop = true;
      sampler.loopStart = 1;
      sampler.loopEnd = 2;
    }

    this.samplers[name] = sampler;
  }
}

const sampleBank = new SampleBank(new ToneChannel());
const silence = document.createElement("audio");
silence.controls = true;
silence.src =
  "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV////////////////////////////////////////////AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQDkAAAAAAAAAGw9wrNaQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxHYAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

const _notes: Note[] = [];
const _playing: Playing[] = [];

export class Sequencer {
  _activations: Activation[][] = [];
  _totalSubBeats = 0;
  _totalPitches = 0;
  pending: Record<string, Instrument> = {};
  pitches: Record<string, ReadyInstrumentPitch> = {};
  _tempo = 108;
  cursor = -1;
  subBeatsPerBeat = 0.25;
  intervalId: { value?: number } | undefined = undefined;
  _playing: boolean = false;
  _isSetUp: boolean = false;
  _isConnected: boolean = false;

  isSetUp() {
    return this._isSetUp;
  }

  isPlaying() {
    return this._playing;
  }

  isConnected() {
    return this._isConnected;
  }

  getTempo() {
    return this._tempo;
  }

  getTotalSubBeats() {
    return this._totalSubBeats;
  }

  getTotalPitches() {
    return this._totalPitches;
  }

  getActivations() {
    return this._activations;
  }

  getCursor() {
    return this.cursor;
  }

  async setup(
    totalSubBeats: number,
    pendingInstruments: Instrument[],
    initialActivations: boolean[][]
  ) {
    this._totalSubBeats = totalSubBeats;
    let index = 0;
    for (const inst of pendingInstruments) {
      for (const pitch of inst.pitches) {
        await sampleBank.setupNewSampler(
          `${inst.name}-${pitch.name}`,
          pitch.sample,
          pitch.gain,
          inst.continuous
        );

        this.pitches[`${inst.name}-${pitch.name}`] = {
          playing: false,
          settings: pitch,
          index,
          continuous: inst.continuous,
          gain: pitch.gain || 1,
          offset: pitch.offset || 0,
          loop: [],
          samplerName: `${inst.name}-${pitch.name}`,
        };

        index += 1;
      }
    }
    this._totalPitches = index;

    await forRange(0, totalSubBeats, async (subBeat) => {
      const subBeatColumn: Activation[] = [];
      this._activations.push(subBeatColumn);
      for (const inst of pendingInstruments) {
        for (const pitch of inst.pitches) {
          subBeatColumn.push({
            pitch: this.pitches[`${inst.name}-${pitch.name}`],
            subBeat,
            active: false,
          });
        }
      }
    });

    let i = 0;
    for (const subBeatColumn of initialActivations) {
      let j = 0;
      for (const row of subBeatColumn) {
        const act = this._activations[i][j];
        if (row) await this.toggleActivation(act);
        j += 1;
      }
      i += 1;
    }

    this._isSetUp = true;
  }

  setTempo = _.debounce(async (newTempo: number) => {
    if (this._playing) await this.pause();
    this._tempo = newTempo;
    if (this._playing) await this.play();
  }, 500);

  async toggleActivation(activation: Activation, activationOverride?: boolean) {
    if (activationOverride !== undefined)
      activation.active = activationOverride;
    else activation.active = !activation.active;

    const startIndex =
      activation.subBeat === this._totalSubBeats - 1
        ? 0
        : activation.subBeat + 1;

    this.filterContinuousNotes(activation.pitch.index);
    let candidate: null | Activation = null;
    let looped = false;
    for (
      let i = startIndex;
      looped === false || i < startIndex;
      i === this._totalSubBeats - 1 ? (i = -1) : (i += 1)
    ) {
      if (i === -1) {
        looped = true;
        continue;
      }
      candidate = this._activations[i][activation.pitch.index];
      if (!candidate.active) {
        break;
      } else {
        candidate = null;
      }
    }

    if (candidate === null) {
      _notes.push({
        duration: this._totalSubBeats,
        startIndex: 0,
        endIndex: -1,
        pitch: activation.pitch,
      });
      return;
    }

    const sIndex =
      candidate.subBeat === this._totalSubBeats - 1 ? 0 : candidate.subBeat + 1;
    let c = candidate;
    let foundNote = false;
    let dur = 0;
    let starting = -1;
    let ending = -1;
    let l = false;
    for (
      let i = sIndex;
      l === false || i < sIndex;
      i === this._totalSubBeats - 1 ? (i = -1) : (i += 1)
    ) {
      if (i === -1) {
        l = true;
        continue;
      }
      c = this._activations[i][activation.pitch.index];
      if (c.active) {
        foundNote = true;
        if (starting === -1) starting = c.subBeat;
      } else {
        if (starting > -1) {
          _notes.push({
            duration: dur,
            startIndex: starting,
            endIndex: ending,
            pitch: c.pitch,
          });
          dur = 0;
          starting = -1;
          ending = -1;
        }
        foundNote = false;
      }
      ending = c.subBeat;

      if (foundNote) dur += 1;
    }

    if (starting > -1) {
      _notes.push({
        duration: dur,
        startIndex: starting,
        endIndex: c.subBeat,
        pitch: c.pitch,
      });
      dur = 0;
      starting = -1;
    }
  }

  filterContinuousNotes(index: number) {
    let i = _notes.findIndex((n) => n.pitch.index === index);
    while (i > -1) {
      _notes.splice(i, 1);
      i = _notes.findIndex((n) => n.pitch.index === index);
    }
  }

  async tick(starting = false) {
    this._playing = true;
    this.cursor += 1;
    if (this.cursor >= this._totalSubBeats) this.cursor = 0;
    await this.playPitchesStartingNow(starting);
    await this.stopPitchesEndingNext();
  }

  async play() {
    this._playing = true;
    if (!this.intervalId) {
      this.intervalId = requestInterval(async () => {
        await this.tick();
      }, (60 * 1000) / (this._tempo / this.subBeatsPerBeat));

      await this.tick(true);
    }
  }

  async connect(node: ToneAudioNode) {
    this._isConnected = true;
    toneConnect(sampleBank.mainOutput, node);
  }

  async stopPitchesEndingNext(): Promise<void> {
    const prevCursor =
      this.cursor === 0 ? this._totalSubBeats - 1 : this.cursor - 1;

    const subBeatNotes = _notes.filter(
      (n) => n.endIndex === prevCursor && n.duration !== this._totalSubBeats
    );

    for (const note of subBeatNotes) {
      const playingNotes = _playing.filter((p) => p.note.pitch === note.pitch);
      for (const playing of playingNotes) {
        playing.note.pitch.playing = false;
        const sampler = sampleBank.samplers[playing.note.pitch.samplerName];
        if (playing.note.pitch.continuous) sampler.stop();
      }
    }
  }

  async playPitchesStartingNow(starting = false): Promise<void> {
    let extra: Note[] = [];

    if (starting) {
      extra = _notes
        .filter((n) => n.startIndex > this.cursor && n.endIndex < n.startIndex)
        .map((n) => {
          return {
            duration: n.duration,
            pitch: n.pitch,
            startIndex: n.startIndex,
            endIndex: n.endIndex,
          };
        });
    }

    const subBeatNotes = _notes
      .filter(
        (n) =>
          (n.startIndex === this.cursor &&
            n.duration !== this._totalSubBeats) ||
          (n.duration === this._totalSubBeats && !n.pitch.playing)
      )
      .map((n) => {
        return {
          duration: n.duration,
          pitch: n.pitch,
          startIndex: n.startIndex,
          endIndex: n.endIndex,
        };
      });

    const all = [...subBeatNotes, ...extra];
    for (const note of all) {
      if (note.pitch.continuous) note.pitch.playing = true;
      const dur = note.duration;
      const sampler = sampleBank.samplers[note.pitch.samplerName];
      sampler.start();
      _playing.push({
        endDueAfter: dur,
        note,
        subBeatsPlayed: 1,
      });
    }
  }

  async stopPlayingPitchesNow(): Promise<void> {
    for (const p of _playing) {
      for (const loop of p.note.pitch.loop)
        if (loop.value) {
          cancelAnimationFrame(loop.value);
          p.note.pitch.loop = [];
        }
      const sampler = sampleBank.samplers[p.note.pitch.samplerName];
      sampler.stop();
    }

    while (_playing.length) {
      _playing.splice(0, 1);
    }
  }

  async pause() {
    await this.stopPlayingPitchesNow();
    if (this.intervalId !== undefined) clearRequestInterval(this.intervalId);
    this.intervalId = undefined;
  }

  async stop() {
    await this.stopPlayingPitchesNow();
    if (this.intervalId !== undefined) clearRequestInterval(this.intervalId);
    this.intervalId = undefined;
    this.cursor = -1;
    this._playing = false;
  }

  async clearAllActivations() {
    for (const subBeatActivations of this._activations) {
      for (const activation of subBeatActivations) {
        if (activation.active) this.toggleActivation(activation);
      }
    }
  }

  inSecs(dur: number) {
    const r = (60 / (this._tempo / this.subBeatsPerBeat)) * dur;
    return r;
  }

  inBeats(secs: number) {
    const r = Math.floor(secs / (60 / (this._tempo / this.subBeatsPerBeat)));
    return r;
  }

  async toggle() {
    if (!this.isPlaying()) {
      // check if we are starting playing for the first time
      if (!this.isConnected()) {
        await this.onAudioContextStart();
      }

      await this.play();
    } else {
      await this.stop();
    }
  }

  playSilence() {
    silence.play();
  };

  async onAudioContextStart() {
    this.playSilence(); // a hack to get iPads to allow sequenced sounds through
    const reverb = new Reverb(0.6);
    const compressor = new Compressor(-0.1, 4);
    const gain = new Gain(0.7);

    await this.connect(gain);
    toneConnect(gain, reverb);
    toneConnect(gain, compressor);
    reverb.toDestination();
    compressor.toDestination();
  }
}
