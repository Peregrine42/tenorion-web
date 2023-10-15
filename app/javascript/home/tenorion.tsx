import React, { useEffect, useState, JSX, useRef } from "react";
import { ResizeObserver } from "@juggle/resize-observer";
import useMeasure from "react-use-measure";
import _ from "lodash";
import { DrumMachine, Soundfont } from "smplr";

const noop: () => void = () => {};

type Grid = { active: boolean; x: number; y: number; w: number; h: number }[][];
type Pitch = {
  value: string;
  instrument: number;
  playing: number;
  current: (offset: number) => void;
};
type CellCoord = { i: number; j: number } | null;

function* scaleGenerator(
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

  let octave = startOctave; // Starting octave
  let noteIndex = startNoteIndex; // Index of the current note in the scale

  while (true) {
    const note = `${scaleNotes[noteIndex]}${octave}`;
    yield note;

    // Move to the next note in the scale
    noteIndex = (noteIndex + 1) % scaleNotes.length;

    // If we've wrapped around the scale, move to the next octave
    if (noteIndex === 0) {
      octave += 1;
    }
  }
}

function* take<T>(generator: Generator<T>, count: number) {
  for (let i = 0; i < count; i++) {
    const result = generator.next();
    if (result.done) {
      break;
    }
    yield result.value;
  }
}

const setupPitch =
  (instrumentIndex: number) =>
  (value: string): Pitch => {
    return { value, instrument: instrumentIndex, playing: 0, current: noop };
  };

const scalePitches = (
  instrumentIndex: number,
  scaleName: string,
  {
    startOctave,
    startPitch,
    limit,
  }: { limit: number; startPitch: string; startOctave: number }
): Pitch[] =>
  Array.from(
    take(scaleGenerator(scaleName, startOctave, startPitch), limit)
  ).map(setupPitch(instrumentIndex)).reverse();

const drumkitTR808Pitches = (instrumentIndex: number): Pitch[] => [
  {
    value: "hihat-open/oh10",
    instrument: instrumentIndex,
    playing: 0,
    current: noop,
  },
  {
    value: "hihat-close/ch",
    instrument: instrumentIndex,
    playing: 0,
    current: noop,
  },
  { value: "clap/cp", instrument: instrumentIndex, playing: 0, current: noop },
  {
    value: "snare/sd0075",
    instrument: instrumentIndex,
    playing: 0,
    current: noop,
  },
  {
    value: "kick/bd0000",
    instrument: instrumentIndex,
    playing: 0,
    current: noop,
  },
];

const marimba = 2;
const strings = 1;
const drumkitTr808 = 0;

const pitches: Pitch[] = [
  ...scalePitches(marimba, "pentatonic", {
    startOctave: 4,
    startPitch: "C",
    limit: 5,
  }),
  ...scalePitches(strings, "pentatonic", {
    startOctave: 3,
    startPitch: "C",
    limit: 6,
  }),
  ...drumkitTR808Pitches(drumkitTr808),
];

const lookupPitch = (row: number): Pitch => {
  return pitches[row];
};

const forRange = async (
  start: number,
  stop: number,
  func: (index: number) => Promise<boolean | void>
): Promise<void> => {
  for (let i = start; i < stop; i += 1) {
    const stop = await func(i);
    if (stop) return;
  }
};

const getNewGrid = async (
  previousGrid: Grid,
  overallWidth: number,
  overallHeight: number,
  clear = false,
  isStarter = false
): Promise<Grid> => {
  const pitchesCount = 16;
  const beatsCount = 16;

  const grid: Grid = [];
  await forRange(0, beatsCount, async () => {
    const column = [];
    grid.push(column);
  });

  await forRange(0, pitchesCount, async (row) => {
    await forRange(0, beatsCount, async (column) => {
      const xPos = (overallWidth / beatsCount) * row;
      const yPos = (overallHeight / pitchesCount) * column;
      const width = overallWidth / beatsCount;
      const height = overallHeight / pitchesCount;

      const active =
        previousGrid[row]?.[column]?.active ||
        initialActivation(row, column, isStarter);

      grid[row].push({
        x: xPos,
        y: yPos,
        w: width,
        h: height,
        active: clear ? false : active,
      });
    });
  });

  return grid;
};

const hintUnderCursor = (
  r: number,
  g: number,
  b: number,
  playing: boolean
): string => {
  if (playing) {
    return `rgb(${r},${g + 10},${b + 30})`;
  } else {
    return `rgb(${r},${g},${b})`;
  }
};

const colorFor = (i: number, j: number, playing: boolean): string => {
  if (i % 4 === 0) return hintUnderCursor(206, 161, 252, playing);
  return hintUnderCursor(217, 196, 237, playing);
};

const pointWithinCell = (
  w: number,
  h: number,
  x: number,
  y: number,
  offsetX: number,
  offsetY: number
): boolean => {
  const withinX = offsetX > x && offsetX < x + w;
  const withinY = offsetY > y && offsetY < y + h;
  return withinX && withinY;
};

const getCellCoordsFromTouchEvent = async (
  grid: Grid,
  e: React.TouchEvent<SVGSVGElement>
): Promise<CellCoord> => {
  const pitchesCount = 16;
  const beatsCount = 16;

  const parent = (e.target as HTMLElement).parentElement?.parentElement;
  if (!parent) return null;
  const bb = parent.getBoundingClientRect();
  const { x, y } = bb;

  let offsetX = e.changedTouches[0].clientX - x;
  let offsetY = e.changedTouches[0].clientY - y;

  let target: { i: number; j: number } | null = null;
  await forRange(0, pitchesCount, async (i) => {
    for (let j = 0; j < 16; j += 1) {
      const w = grid[i][j].w;
      const h = grid[i][j].h;
      const x = grid[i][j].x;
      const y = grid[i][j].y;
      if (pointWithinCell(w, h, x, y, offsetX, offsetY)) {
        target = { i, j };
      }
    }
  });
  return target;
};

const TenorionCell = ({
  isUnderCursor: playing,
  i,
  j,
  gridWidth: width,
  gridHeight: height,
  pointerIsDragging: dragging,
  pointerActionDirection: actionDirection,
  onDown,
  onUp,
  active,
  setActive,
  cellX: x,
  cellY: y,
  cellWidth: w,
  cellHeight: h,
}: {
  isUnderCursor: boolean;
  i: number;
  j: number;
  gridWidth: number;
  gridHeight: number;
  pointerIsDragging: boolean;
  pointerActionDirection: boolean;
  onDown: (active: boolean) => void;
  onUp: () => void;
  active: boolean;
  setActive: (v: boolean) => void;
  cellX: number;
  cellY: number;
  cellWidth: number;
  cellHeight: number;
}) => {
  const [firstActive, setFirstActive] = useState(false);

  useEffect(() => {
    if (!firstActive && active) setFirstActive(true);
  }, [active, firstActive]);

  const entryDelay = i * j * 0.002;

  return (
    <g
      onMouseDown={(e) => {
        if (hasTouch()) return;
        e.preventDefault();
        onDown(!active);
        setActive(!active);
      }}
      onMouseOver={(e) => {
        !hasTouch() && e.preventDefault();
        !hasTouch() && dragging && setActive(actionDirection);
      }}
      onMouseUp={() => !hasTouch() && onUp()}
    >
      <rect
        style={{
          animation: "0.4s opacity forwards",
          animationDelay: `${entryDelay}s`,
        }}
        opacity="0"
        className="cell"
        rx={width * 0.005}
        fill={colorFor(i, j, playing)}
        x={x + 0.02 * (width / 16)}
        y={y + 0.02 * (height / 16)}
        width={w * 0.94}
        height={h * 0.94}
      />
      <rect
        x={x + 0.02 * (width / 16)}
        y={y + 0.02 * (height / 16)}
        width={w * 0.94}
        height={h * 0.94}
        style={{
          animation: active
            ? "0.3s some-opacity forwards"
            : "0.2s no-opacity forwards",
          fill: firstActive ? "black" : "white",
          opacity: 0.4,
          pointerEvents: "none",
        }}
      />
    </g>
  );
};

const getDuration = (
  i: number,
  j: number,
  pitch: { value: string; instrument: number; playing?: number },
  grid: Grid
) => {
  if (pitch.playing) {
    return 0;
  }
  if ([0, 2].includes(pitch.instrument)) {
    return 1;
  }
  const row = grid.map((columns) => columns[j]);
  const remainingAhead = row.slice(i);
  const stopIndex = remainingAhead.findIndex((c) => !c.active);
  const noteLength = remainingAhead.slice(0, stopIndex).length;
  let extraStopIndex = 0;
  if (stopIndex === -1) {
    const remainingBehind = row.slice(0, i);
    extraStopIndex = remainingBehind.findIndex((c) => !c.active);
    if (extraStopIndex === -1) extraStopIndex = i;
  }

  const totalLength = noteLength + extraStopIndex;
  return totalLength;
};

const Tenorion = ({}: {}) => {
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragActivating, setDragActivating] = useState(false);
  const [grid, setGrid] = useState<Grid>([]);
  const [ref, bounds] = useMeasure({ polyfill: ResizeObserver });
  const [cursor, setCursor] = useState(-1);
  const [lastCursor, setLastCursor] = useState(-1);
  const [tempo, setTempo] = useState(108);
  const [cued, setCued] = useState(false);
  const [intervalId, setIntervalId] = useState<number | undefined>();

  const drumkit = useRef<any>();
  const strings = useRef<any>();
  const marimba = useRef<any>();

  useEffect(() => {
    if (cued) {
      const id = setInterval(() => {
        setCursor((v) => {
          if (v < 15) {
            v = v + 1;
          } else {
            v = 0;
          }

          return v;
        });
      }, (60 * 1000) / (tempo * 4));
      setIntervalId(id);
      return () => {
        clearInterval(id);
      };
    } else {
      const col = grid[0];
      console.log(col);
      if (col) {
        col.forEach((_, j) => {
          const p = lookupPitch(j);
          p.current(0);
          p.playing = 0;
        });
      }
      if (intervalId !== undefined) clearInterval(intervalId);
    }
  }, [
    cued,
    tempo,
    setCursor,
    marimba.current,
    drumkit.current,
    strings.current,
  ]);

  useEffect(() => {
    if (cursor > -1 && lastCursor !== cursor) {
      setLastCursor(cursor);
      for (let j = 0; j < 16; j += 1) {
        const cell = grid[cursor][j];

        const pitch = lookupPitch(j);
        const instrument = (() => {
          if (pitch.instrument === 0) return drumkit;
          if (pitch.instrument === 1) return strings;
          if (pitch.instrument === 2) return marimba;
        })();

        if (cell.active) {
          const dur = getDuration(cursor, j, pitch, grid);
          if (dur > 0) {
            pitch.current = instrument?.current?.start({
              duration: (60 / (tempo * 4)) * dur,
              velocity: 80,
              note: pitch.value,
            });
            pitch.playing = dur;
          }
        }

        if (pitch.playing > 0) {
          pitch.playing -= 1;
        }
      }
    }
  }, [
    grid,
    cursor,
    lastCursor,
    marimba.current,
    drumkit.current,
    strings.current,
  ]);

  useEffect(() => {
    (async () => {
      if (bounds.width > 0 && bounds.height > 0) {
        const newMaxWidth = bounds.width * 0.9;
        const newMaxHeight = bounds.height * 0.9;

        let newWidth = newMaxHeight;
        let newHeight = newMaxHeight;
        if (newMaxWidth < newMaxHeight) {
          newWidth = newMaxWidth;
          newHeight = newMaxWidth;
        }

        setWidth(newWidth);
        setHeight(newHeight);
        setGrid(await getNewGrid(grid, newWidth, newHeight, false, true));
      }
    })();
  }, [bounds, setWidth, setHeight]);

  useEffect(() => {}, []);

  const getActive = (i: number, j: number) => {
    return grid[i][j].active;
  };

  const setParticularActive = (a: boolean, i: number, j: number) => {
    const newGrid = _.cloneDeep(grid);
    newGrid[i][j].active = a;
    setGrid(newGrid);
  };

  const getCells = (grid: Grid) => {
    const cells: JSX.Element[][] = [];
    if (width && height) {
      for (let i = 0; i < 16; i += 1) {
        const current: JSX.Element[] = [];
        cells.push(current);
        for (let j = 0; j < 16; j += 1) {
          current.push(
            <TenorionCell
              isUnderCursor={cursor === i}
              key={`${i}-${j}`}
              i={i}
              j={j}
              cellX={grid[i][j].x}
              cellY={grid[i][j].y}
              cellWidth={grid[i][j].w}
              cellHeight={grid[i][j].h}
              gridWidth={width}
              gridHeight={height}
              pointerIsDragging={dragging}
              pointerActionDirection={dragActivating}
              onDown={(active) => {
                setDragActivating(active);
                setDragging(true);
              }}
              onUp={() => {
                setDragging(false);
              }}
              active={grid[i][j].active}
              setActive={(v) => {
                setParticularActive(v, i, j);
              }}
            />
          );
        }
      }
    }
    return cells;
  };

  const cells = (grid.length > 0 && getCells(grid)) || [];
  return (
    <div className="flex-shrink-0 flex-grow-1 d-flex justify-content-between align-items-spread flex-column">
      <div className="d-flex align-items-center justify-content-between">
        <div className="w-100 p-1 flex-grow-1 btn border d-flex">
          <input
            className="flex-grow-1 "
            value={tempo}
            min={40}
            max={180}
            onChange={(e) => setTempo(parseInt(e.target.value))}
            type="range"
          ></input>
          <button
            onClick={() => {
              setTempo(108);
            }}
            className="flex-shrink-1 reset-tempo-button btn mx-3"
          >
            <i className="fa-xl align-middle fa-solid fa-clock"></i>
            &nbsp; {tempo}
          </button>
        </div>

        <div className="w-100 flex-shrink-1 align-middle d-flex flex-column align-items-center">
          <button
            className={`btn play-button btn-success rounded-circle`}
            onClick={async () => {
              if (!drumkit.current)
                drumkit.current = new DrumMachine(new AudioContext(), {
                  instrument: "TR-808",
                  volume: 127,
                });
              if (!strings.current)
                strings.current = new Soundfont(new AudioContext(), {
                  instrument: "string_ensemble_1",
                  volume: 85,
                });
              if (!marimba.current)
                marimba.current = new Soundfont(new AudioContext(), {
                  instrument: "marimba",
                });
              await drumkit.current.load;
              await marimba.current.load;
              await strings.current.load;
              if (cued) setCursor(-1);
              setCued(!cued);
            }}
            aria-label={`${cued ? "pause" : "play"} button`}
          >
            <i
              className={`fa-xl align-middle fa-solid fa-${
                cued ? "pause" : "play"
              }`}
            ></i>
          </button>
        </div>
        <div className="w-100 flex-grow-1 d-flex flex-column align-items-end">
          <button
            className="text-right btn btn-danger"
            onClick={async () => {
              setGrid(await getNewGrid(grid, width, height, true));
            }}
          >
            <i className="fa-xl align-middle fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
      <div className="border-cell d-flex flex-shrink-1 flex-grow-1 align-items-spread"></div>
      <div className="d-flex flex-shrink-1 flex-grow-1 align-items-spread">
        <div className="border-cell flex-shrink-1 flex-grow-1"></div>
        <div ref={ref} className="w-100 stage flex-shrink-1 flex-grow-1">
          <svg
            width={width}
            height={height}
            className="drop-shadow"
            onTouchMove={async (e) => {
              e.stopPropagation();
              const coords = await getCellCoordsFromTouchEvent(grid, e);
              if (coords === null) return;
              const { i, j } = coords;
              if (getActive(i, j) !== dragActivating) {
                setParticularActive(dragActivating, i, j);
              }
            }}
            onTouchStart={async (e) => {
              e.stopPropagation();
              const coords = await getCellCoordsFromTouchEvent(grid, e);
              if (coords === null) return;
              const { i, j } = coords;
              setDragging(true);
              setParticularActive(!getActive(i, j), i, j);
              setDragActivating(!getActive(i, j));
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              if (e.touches.length === 0) setDragging(false);
            }}
            onMouseLeave={() => {
              setDragging(false);
            }}
            onTouchCancel={() => {
              setDragging(false);
            }}
          >
            <style>
              {`
                @keyframes opacity {
                  0% {opacity: 0} 
                  100% {opacity: 1}
                }

                @keyframes some-opacity {
                  0% {opacity: 0} 
                  100% {opacity: 0.4}
                }

                @keyframes no-opacity {
                  0% {opacity: 0.4} 
                  100% {opacity: 0}
                }
              `}
            </style>
            <g>
              <rect
                rx={width * 0.005}
                fill="#ffffff"
                width={width}
                height={height}
              />
              <g>{cells}</g>
            </g>
          </svg>
        </div>
        <div className="border-cell flex-shrink-1 flex-grow-1"></div>
      </div>
    </div>
  );
};

export default Tenorion;

const starterPattern = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
  [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
];

const hasTouch = () => {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
};

const initialActivation = (i: number, j: number, starter: boolean): boolean => {
  if (!starter) return false;
  return starterPattern[j][i] === 1;
};
