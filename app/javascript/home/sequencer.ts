import _ from "lodash";
import { forRange } from "./utils";
import {
  Player as TonePlayer,
  connect as toneConnect,
  Channel as ToneChannel,
  ToneAudioNode,
  Gain,
  Reverb,
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
  fadingOut: boolean;
  samplerName: string;
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
};

type Note = {
  startIndex: number;
  stopIndex: number;
  duration: number;
  pitch: ReadyInstrumentPitch;
  original: boolean;
};

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

    sampler.volume.value = gain;

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
          fadingOut: false,
          settings: pitch,
          index,
          continuous: inst.continuous,
          gain: pitch.gain || 0,
          offset: pitch.offset || 0,
          loop: [],
          samplerName: `${inst.name}-${pitch.name}`,
          doubleUp: inst.doubleUp || false,
          instrument: inst,
        };

        this.pitches[`${inst.name}-${pitch.name}`] = readyPitch;

        if (pitch.visible) index += 1;
      }
    }
    this._totalPitches = index;

    await forRange(0, totalSubBeats, async (subBeat) => {
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
      // if (note.pitch.doubleUp) {
      //   const newPitchName = transposePitchName(note.pitch);
      //   const extraPitch = this.pitches[newPitchName];
      //   if (extraPitch) {
      //     const extraNote = _.cloneDeep(note);
      //     extraNote.original = false;
      //     extraNote.pitch = extraPitch;
      //     _notes.push(extraNote);
      //   }
      // }
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
    this._playing = true;
    this.cursor += 1;

    this.stopPendingPitches();
    if (this.cursor >= this._totalSubBeats) this.cursor = 0;
    await this.updatePlayingPitches();

    for (const pl of _playing) {
      if (pl.note.pitch.playing) pl.subBeatsPlayed += 1;
    }

    await this.startPitchesStartingNow(starting);
    await this.updatePlayingPitches();
  }

  stopPendingPitches() {
    for (const p of Object.values(this.pitches)) {
      if (p.fadingOut) {
        this.stopPlayingSampler(p.samplerName);
        if (p.doubleUp) {
          this.stopPlayingSampler(doubleUpPitchName(p));
        }
        p.fadingOut = false;
        p.playing = false;
      }
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

  async updatePlayingPitches(): Promise<void> {
    const planningToStop = _playing.filter(
      (pl) => pl.subBeatsPlayed >= pl.endDueAfter - 2
    );

    for (const playing of planningToStop) {
      playing.note.pitch.shouldPlay = false;
    }

    let targ = _playing.findIndex((p) => !p.note.pitch.shouldPlay);
    while (targ > -1) {
      _playing.splice(targ, 1);
      targ = _playing.findIndex((p) => !p.note.pitch.shouldPlay);
    }

    for (const pitch of Object.values(this.pitches)) {
      if (!pitch.shouldPlay && pitch.playing) {
        this.setFadeOutOnSampler(pitch.continuous, pitch.samplerName);

        if (pitch.doubleUp) {
          this.setFadeOutOnSampler(pitch.continuous, doubleUpPitchName(pitch));
        }

        pitch.fadingOut = true;
      }
    }
  }

  async startPitchesStartingNow(initial = false): Promise<void> {
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
      this.playSampler(note, sampler);

      if (note.pitch.doubleUp) {
        this.playSampler(
          note,
          sampleBank.samplers[doubleUpPitchName(note.pitch)]
        );
      }
    }

    // if (initial) {
    //   const notesUnderCursor = _notes.filter(
    //     (n) => n.startIndex <= this.cursor && n.stopIndex > this.cursor
    //   );
    //   for (const pitch of Object.values(this.pitches)) {
    //     const noteIsUnderCursor = !!notesUnderCursor.find(
    //       (n) => n.pitch.samplerName === pitch.samplerName
    //     );
    //     pitch.shouldPlay = noteIsUnderCursor;
    //   }
    // }
  }

  playSampler(note: Note, sampler: TonePlayer) {
    if (note.pitch.continuous)
      sampler.set({
        fadeIn: this.inSecs(0.2),
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
    let fade = 0.1;
    if (continuous) {
      fade = 0.6;
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
    const reverb = new Reverb(2);
    // const compressor = new Compressor(-0.1, 4);
    const gain = new Gain(7, "decibels");

    await this.connect(gain);
    toneConnect(gain, reverb);
    // toneConnect(gain, compressor);
    reverb.toDestination();
    gain.toDestination();
    // compressor.toDestination();
  }
}
