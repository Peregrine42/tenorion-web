import _, { range } from "lodash";
import {
  Player as TonePlayer,
  connect as toneConnect,
  Channel as ToneChannel,
  ToneAudioNode,
  Gain,
  Reverb,
  Compressor,
} from "tone";
import { clearRequestInterval, requestInterval } from "./requestInterval";

export type InstrumentPitch = {
  name: string;
  sample: string;
  format: string;
  gain?: number;
  offset?: number;
  visible?: boolean;
};

export type Instrument = {
  name: string;
  pitches: InstrumentPitch[];
  continuous: boolean;
  doubleDown?: boolean;
  doubleUp?: boolean;
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
  shouldPlay: boolean;
  playing: boolean;
  samplerName: string;
  doubleDown: boolean;
  doubleUp: boolean;
  instrument: Instrument;
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
  fadingOut: boolean;
};

type Note = {
  startIndex: number;
  stopIndex: number;
  duration: number;
  pitch: ReadyInstrumentPitch;
  original: boolean;
};

const doubleDownPitchName = (pitch: ReadyInstrumentPitch) =>
  `${pitch.instrument.name}-${pitch.settings.name[0]}${
    parseInt(pitch.settings.name.slice(1)) - 1
  }`;

const doubleUpPitchName = (pitch: ReadyInstrumentPitch) =>
  `${pitch.instrument.name}-${pitch.settings.name[0]}${
    parseInt(pitch.settings.name.slice(1)) + 1
  }`;

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

    if (continuous) {
      sampler.loop = true;
      sampler.loopStart = 1;
      sampler.loopEnd = 3;
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
const _activations: Activation[][] = [];

export class Sequencer {
  _totalSubBeats = 0;
  _totalPitches = 0;
  pending: Record<string, Instrument> = {};
  pitches: Record<string, ReadyInstrumentPitch> = {};
  _activationsChanged: Record<string, string> = {};
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
    return _activations;
  }

  getNotes() {
    return _notes;
  }

  getCursor() {
    return this.cursor;
  }

  activationsChanged() {
    return this._activationsChanged;
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
        const samplerName = `${inst.name}-${pitch.name}`;
        await sampleBank.setupNewSampler(
          samplerName,
          pitch.sample,
          pitch.gain,
          inst.continuous
        );

        this.setFadeOutOnSampler(inst.continuous, samplerName);

        const readyPitch: ReadyInstrumentPitch = {
          shouldPlay: false,
          playing: false,
          settings: pitch,
          index,
          continuous: inst.continuous,
          gain: pitch.gain || 0,
          offset: pitch.offset || 0,
          loop: [],
          samplerName: `${inst.name}-${pitch.name}`,
          doubleDown: inst.doubleDown || false,
          doubleUp: inst.doubleUp || false,
          instrument: inst,
        };

        this.pitches[`${inst.name}-${pitch.name}`] = readyPitch;

        if (pitch.visible) index += 1;
      }
    }
    this._totalPitches = index;

    range(0, totalSubBeats).forEach((subBeat) => {
      const subBeatColumn: Activation[] = [];
      _activations.push(subBeatColumn);
      for (const inst of pendingInstruments) {
        for (const pitch of inst.pitches.filter((p) => p.visible)) {
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
        const act = _activations[i][j];
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

    this._activationsChanged = {};

    this.reStateWhereNotesAreAtActivationPitch(activation);
  }

  reStateWhereNotesAreAtActivationPitch(activation: Activation) {
    if (!activation.pitch.continuous) {
      if (activation.active) {
        _notes.push({
          duration: 1,
          startIndex: activation.subBeat,
          stopIndex:
            activation.subBeat === this._totalSubBeats - 1
              ? 0
              : activation.subBeat + 1,
          pitch: activation.pitch,
          original: true,
        });
      } else {
        this.filterActivationFromNotes(activation);
      }
      return;
    }

    this.filterNotes(activation.pitch);

    const newNotes: Note[] = (() => {
      const _newNotes: Note[] = [];

      const startIndex =
        activation.subBeat === this._totalSubBeats - 1
          ? 0
          : activation.subBeat + 1;

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
        candidate = _activations[i][activation.pitch.index];
        if (!candidate.active) {
          break;
        } else {
          candidate = null;
        }
      }

      if (candidate === null) {
        _newNotes.push({
          duration: this._totalSubBeats,
          startIndex: 0,
          stopIndex: -2,
          pitch: activation.pitch,
          original: true,
        });
        return _newNotes;
      }

      const sIndex =
        candidate.subBeat === this._totalSubBeats - 1
          ? 0
          : candidate.subBeat + 1;
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
        c = _activations[i][activation.pitch.index];
        if (c.active) {
          foundNote = true;
          if (starting === -1) starting = c.subBeat;
        } else {
          if (starting > -1) {
            _newNotes.push({
              duration: dur,
              startIndex: starting,
              stopIndex: ending === this._totalSubBeats - 1 ? 0 : ending + 1,
              pitch: c.pitch,
              original: true,
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
        _newNotes.push({
          duration: dur,
          startIndex: starting,
          stopIndex: c.subBeat === this._totalSubBeats - 1 ? 0 : c.subBeat + 1,
          pitch: c.pitch,
          original: true,
        });
        dur = 0;
        starting = -1;
      }
      return _newNotes;
    })();

    for (const note of newNotes) {
      _notes.push(note);
    }
  }

  filterNotes(pitch: ReadyInstrumentPitch) {
    // let doubleUpI = _notes.findIndex((n) => !n.original);
    // while (doubleUpI > -1) {
    //   _notes.splice(doubleUpI, 1);
    //   doubleUpI = _notes.findIndex((n) => !n.original);
    // }

    let samePitchI = _notes.findIndex(
      (n) => n.pitch.samplerName === pitch.samplerName
    );
    while (samePitchI > -1) {
      _notes.splice(samePitchI, 1);
      samePitchI = _notes.findIndex(
        (n) => n.pitch.samplerName === pitch.samplerName
      );
    }
  }

  filterActivationFromNotes(activation: Activation) {
    let i = _notes.findIndex(
      (n) =>
        n.startIndex === activation.subBeat &&
        n.pitch.samplerName === activation.pitch.samplerName
    );
    while (i > -1) {
      _notes.splice(i, 1);
      i = _notes.findIndex(
        (n) =>
          n.startIndex === activation.subBeat &&
          n.pitch.samplerName === activation.pitch.samplerName
      );
    }
  }

  async tick(starting = false) {
    this.stopPendingPitches();

    this._playing = true;
    this.cursor += 1;
    if (this.cursor >= this._totalSubBeats) this.cursor = 0;

    // await this.updatePlayingPitches();

    for (const pl of _playing) {
      if (pl.note.pitch.playing) pl.subBeatsPlayed += 1;
    }

    await this.updatePlayingPitches(starting);
    await this.startPitchesStartingNow();
    await this.updatePlayingPitches(starting);
  }

  stopPendingPitches() {
    for (const p of _playing) {
      if (p.fadingOut) {
        this.stopPlayingSampler(p.note.pitch.samplerName);
        if (p.note.pitch.doubleDown) {
          this.stopPlayingSampler(doubleDownPitchName(p.note.pitch));
        }
        if (p.note.pitch.doubleUp) {
          this.stopPlayingSampler(doubleUpPitchName(p.note.pitch));
        }
        p.note.pitch.playing = false;
      }
    }

    let targ = _playing.findIndex((p) => !p.note.pitch.playing);
    while (targ > -1) {
      _playing.splice(targ, 1);
      targ = _playing.findIndex((p) => !p.note.pitch.playing);
    }
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

  async updatePlayingPitches(initial = false): Promise<void> {
    const planningToStop = _playing.filter(
      (pl) => pl.subBeatsPlayed >= pl.endDueAfter
    );

    for (const playing of planningToStop) {
      if (
        !_playing.find(
          (p) =>
            p.note.pitch.samplerName === playing.note.pitch.samplerName &&
            p.subBeatsPlayed < p.endDueAfter
        )
      ) {
        playing.note.pitch.shouldPlay = false;
        playing.fadingOut = true;
      }
    }

    for (const pitch of Object.values(this.pitches)) {
      if (!pitch.shouldPlay && pitch.playing) {
        this.setFadeOutOnSampler(pitch.continuous, pitch.samplerName);

        if (pitch.doubleDown) {
          this.setFadeOutOnSampler(
            pitch.continuous,
            doubleDownPitchName(pitch)
          );
        }

        if (pitch.doubleUp) {
          this.setFadeOutOnSampler(pitch.continuous, doubleUpPitchName(pitch));
        }
      }
    }

    if (initial) {
      const notesUnderCursor = _notes.filter(
        (n) => n.startIndex <= this.cursor && n.stopIndex > this.cursor
      );
      for (const pitch of Object.values(this.pitches)) {
        const noteIsUnderCursor = !!notesUnderCursor.find(
          (n) => n.pitch.samplerName === pitch.samplerName
        );
        pitch.shouldPlay = noteIsUnderCursor;
      }
    }
  }

  async startPitchesStartingNow(): Promise<void> {
    const subBeatNotes = _notes.filter(
      (n) =>
        (n.startIndex === this.cursor && n.duration !== this._totalSubBeats) ||
        (n.duration === this._totalSubBeats && !n.pitch.shouldPlay)
    );

    for (const note of subBeatNotes) {
      note.pitch.shouldPlay = true;
      _playing.push({
        endDueAfter: note.duration,
        note,
        subBeatsPlayed: 1,
        fadingOut: false,
      });

      // if (note.pitch.doubleUp) {
      //   _playing.push({
      //     endDueAfter: note.duration,
      //     note,
      //     subBeatsPlayed: 1,
      //     double: true,
      //   });
      // }

      const sampler = sampleBank.samplers[note.pitch.samplerName];
      this.startSampler(note, sampler);

      if (note.pitch.doubleDown) {
        this.startSampler(
          note,
          sampleBank.samplers[doubleDownPitchName(note.pitch)]
        );
      }

      if (note.pitch.doubleUp) {
        this.startSampler(
          note,
          sampleBank.samplers[doubleUpPitchName(note.pitch)]
        );
      }
    }
  }

  startSampler(note: Note, sampler: TonePlayer) {
    if (note.pitch.continuous)
      sampler.set({
        fadeIn: this.inSecs(0.4),
      });
    if (note.pitch.gain) {
      sampler.set({
        volume: note.pitch.gain,
      });
    }
    note.pitch.playing = true;
    sampler.start();
  }

  setFadeOutOnSampler(continuous: boolean, samplerName: string) {
    const sampler = sampleBank.samplers[samplerName];
    let fade = this.inSecs(0.1);
    if (continuous) {
      fade = this.inSecs(0.7);
    }
    sampler.set({
      fadeOut: fade,
    });
  }

  stopPlayingSampler(samplerName: string) {
    const sampler = sampleBank.samplers[samplerName];
    sampler.stop();
  }

  async stopPlayingPitchesNow(): Promise<void> {
    for (const p of _playing) {
      for (const loop of p.note.pitch.loop)
        if (loop.value) {
          cancelAnimationFrame(loop.value);
          p.note.pitch.loop = [];
        }
      p.note.pitch.shouldPlay = false;
      p.fadingOut = true;
    }

    await this.updatePlayingPitches();
    this.stopPendingPitches();

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
    for (const subBeatActivations of _activations) {
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
  }

  async onAudioContextStart() {
    this.playSilence(); // a hack to get iPads to allow sequenced sounds through
    const reverb = new Reverb(1);
    const compressor = new Compressor(-35);
    const pregain = new Gain(2, "decibels");
    const gain = new Gain(0, "decibels");

    await this.connect(pregain);
    toneConnect(pregain, reverb);
    toneConnect(pregain, compressor);
    toneConnect(reverb, gain);
    toneConnect(compressor, gain);
    gain.toDestination();
    // compressor.toDestination();
  }
}
