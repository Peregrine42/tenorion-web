import _ from "lodash";
import { forRange } from "./utils";
import { Howl, Howler } from "howler";

export type InstrumentPitch = {
  name: string;
  sample: string;
  format: string;
  gain?: number;
};

export type Instrument = {
  name: string;
  pitches: InstrumentPitch[];
  continuous: boolean;
};

type ReadyInstrumentPitch = {
  settings: InstrumentPitch;
  howlObj: Howl;
  index: number;
  continuous: boolean;
  gain?: number;
};

type Activation = {
  pitch: ReadyInstrumentPitch;
  subBeat: number;
  active: boolean;
};

type Playing = {
  subBeatsPlayed: number;
  endDueAfter: number;
  howlId: number;
  activation: Activation;
};

export class Sequencer {
  totalSubBeats = 0;
  pending: Record<string, Instrument> = {};
  pitches: Record<string, ReadyInstrumentPitch> = {};
  activations: Activation[][] = [];
  onSubbeat: (newSubBeat: number) => Promise<void>;
  tempo = 108;
  cursor = -1;
  subBeatsPerBeat = 0.25;
  intervalId: number | undefined = undefined;
  playing: Playing[] = [];
  isPlaying: boolean = false;

  constructor(onSubbeat: (newSubBeat: number) => Promise<void>) {
    this.onSubbeat = onSubbeat;
  }

  async setup(
    totalSubBeats: number,
    pendingInstruments: Instrument[],
    initialActivations: boolean[][]
  ) {
    this.totalSubBeats = totalSubBeats;
    let index = 0;
    for (const inst of pendingInstruments) {
      for (const pitch of inst.pitches) {
        this.pitches[`${inst.name}-${pitch.name}`] = {
          settings: pitch,
          howlObj: new Howl({
            src: pitch.sample,
            format: pitch.format,
            volume: pitch.gain || 1,
          }),
          index,
          continuous: inst.continuous,
          gain: pitch.gain,
        };
        index += 1;
      }
    }

    await forRange(0, totalSubBeats, async (subBeat) => {
      const subBeatColumn: Activation[] = [];
      this.activations.push(subBeatColumn);
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
        const act = this.activations[i][j];
        if (row) this.toggleActivation(act);
        j += 1;
      }
      i += 1;
    }
  }

  setTempo = _.debounce(async (newTempo: number) => {
    if (this.isPlaying) await this.pause();
    this.tempo = newTempo;
    if (this.isPlaying) await this.play();
  }, 500);

  async toggleActivation(activation: Activation, activationOverride?: boolean) {
    if (activationOverride !== undefined)
      activation.active = activationOverride;
    else activation.active = !activation.active;
  }

  async tick() {
    this.isPlaying = true;
    await this.stopPitchesEndingNext();
    this.cursor += 1;
    if (this.cursor >= this.totalSubBeats) this.cursor = 0;
    this.onSubbeat?.(this.cursor);
    await this.playPitchesStartingNow();
    await this.overlapLoopingPitches();
  }

  async overlapLoopingPitches() {
    const newIds: { id: number; activation: Activation }[] = [];
    for (const playing of this.playing) {
      const currentActivation =
        this.activations[this.cursor][playing.activation.pitch.index];
      if (playing.subBeatsPlayed > this.inBeats(2)) {
        playing.activation.pitch.howlObj.fade(1, 0, 150, playing.howlId);
        const id = currentActivation.pitch.howlObj.play();
        newIds.push({ id, activation: currentActivation });
      }
    }

    let found = this.playing.findIndex(
      (p) => p.subBeatsPlayed > this.inBeats(2)
    );
    while (found > -1) {
      this.playing.splice(found, 1);
      found = this.playing.findIndex((p) => p.subBeatsPlayed > this.inBeats(2));
    }

    for (const { id, activation } of newIds) {
      this.playing.push({
        endDueAfter: await this.figureOutDuration(activation),
        activation,
        howlId: id,
        subBeatsPlayed: 1,
      });
    }
  }

  async play() {
    if (!this.intervalId) {
      this.intervalId = setInterval(async () => {
        await this.tick();
      }, (60 * 1000) / (this.tempo / this.subBeatsPerBeat));

      await this.tick();
    }
  }

  async getHowlerVars() {
    return { masterGain: Howler.masterGain, ctx: Howler.ctx };
  }

  async stopPitchesEndingNext(): Promise<void> {
    for (const playing of this.playing) {
      playing.endDueAfter = await this.figureOutDuration(playing.activation);
      playing.subBeatsPlayed += 1;
      if (playing.subBeatsPlayed >= playing.endDueAfter) {
        playing.activation.pitch.howlObj.stop(playing.howlId);
      }
    }

    let found = this.playing.findIndex(
      (p) => p.subBeatsPlayed >= p.endDueAfter
    );
    while (found > -1) {
      this.playing.splice(found, 1);
      found = this.playing.findIndex((p) => p.subBeatsPlayed >= p.endDueAfter);
    }
  }

  async playPitchesStartingNow(): Promise<void> {
    const subBeatActivations = this.activations[this.cursor];

    for (const activation of subBeatActivations) {
      if (activation.active && !this.alreadyPlaying(activation)) {
        const id = activation.pitch.howlObj.play();
        this.playing.push({
          endDueAfter: await this.figureOutDuration(activation),
          activation: activation,
          howlId: id,
          subBeatsPlayed: 1,
        });
      }
    }
  }

  alreadyPlaying(activation: Activation) {
    return this.playing.find((p) => p.activation.pitch === activation.pitch);
  }

  async figureOutDuration(activation: Activation): Promise<number> {
    if (!activation.pitch.continuous) return 1;

    let duration = 1;
    const startingIndex = activation.subBeat;
    const stoppingIndex =
      activation.subBeat === 0 ? this.totalSubBeats - 1 : startingIndex - 1;
    for (
      let i = startingIndex;
      i !== stoppingIndex;
      i === this.totalSubBeats - 1 ? (i = 0) : (i += 1)
    ) {
      const candidate = this.activations[i][activation.pitch.index];
      if (!candidate.active) break;
      duration += 1;
    }

    return duration;
  }

  async stopPlayingPitchesNow(): Promise<void> {
    for (const playing of this.playing) {
      playing.activation.pitch.howlObj.stop(playing.howlId);
    }

    while (this.playing.length) {
      this.playing.splice(0, 1);
    }
  }

  async pause() {
    await this.stopPlayingPitchesNow();
    clearInterval(this.intervalId);
    this.intervalId = 0;
  }

  async stop() {
    await this.stopPlayingPitchesNow();
    clearInterval(this.intervalId);
    this.cursor = -1;
    this.onSubbeat(-1);
    this.isPlaying = false;
    this.intervalId = 0;
  }

  async clearAllActivations() {
    for (const subBeatActivations of this.activations) {
      for (const activation of subBeatActivations) {
        if (activation.active) this.toggleActivation(activation);
      }
    }
  }

  inSecs(dur: number) {
    return (60 / (this.tempo / this.subBeatsPerBeat)) * dur;
  }

  inBeats(secs: number) {
    const r = secs / (60 / (this.tempo / this.subBeatsPerBeat));
    return r;
  }
}
