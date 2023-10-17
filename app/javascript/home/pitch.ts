import { take } from "./utils";

export type BasePitch = {
  value: string;
};

export type Pitch = {
  playing: number;
  originalLength: number;
  instrument: number;
  join?: boolean;
  doubleUp?: boolean;
  current: ((offset: number) => void)[];
} & BasePitch;

export function* scaleGenerator(
  scaleName: string,
  startOctave: number,
  startPitch: string
) {
  const scaleNotes = (() => {
    if (scaleName === "pentatonic") return ["C", "D", "E", "G", "A"];
    else throw new Error("Unknown scale!");
  })();

  const startNoteIndex = scaleNotes.findIndex((pitch) => startPitch === pitch);
  if (startNoteIndex === -1) throw new Error("Unknown start note!");

  let octave = startOctave;
  let noteIndex = startNoteIndex;

  while (true) {
    const note = `${scaleNotes[noteIndex]}${octave}`;
    yield note;

    noteIndex = (noteIndex + 1) % scaleNotes.length;

    if (noteIndex === 0) {
      octave += 1;
    }
  }
}

export const setupPitch =
  (instrumentIndex: number, join?: boolean, doubleUp?: boolean) =>
  (value: string): Pitch => {
    return {
      value,
      instrument: instrumentIndex,
      playing: 0,
      originalLength: 0,
      current: [],
      join,
      doubleUp
    };
  };

export const scalePitches = (
  instrumentIndex: number,
  scaleName: string,
  {
    startOctave,
    startPitch,
    limit,
    join = false,
    doubleUp = false
  }: {
    limit: number;
    startPitch: string;
    startOctave: number;
    join?: boolean;
    doubleUp?: boolean
  }
): Pitch[] => {
  return Array.from(
    take(scaleGenerator(scaleName, startOctave, startPitch), limit)
  )
    .map(setupPitch(instrumentIndex, join, doubleUp))
    .reverse();
};

export const drumkitTR808Pitches = (): string[] => [
  "hihat-open/oh10",
  "hihat-close/ch",
  "clap/cp",
  "snare/sd0075",
  "kick/bd0000",
];

export const drumkitTr808 = 0;
export const strings = 1;
export const marimba = 2;

export const pitches: Pitch[] = [
  ...scalePitches(marimba, "pentatonic", {
    startOctave: 4,
    startPitch: "C",
    limit: 5,
  }),
  ...scalePitches(strings, "pentatonic", {
    startOctave: 3,
    startPitch: "C",
    limit: 6,
    join: true,
    doubleUp: true
  }),
  ...drumkitTR808Pitches().map(setupPitch(drumkitTr808)),
];

export const lookupPitch = (row: number): Pitch => {
  return pitches[row];
};
