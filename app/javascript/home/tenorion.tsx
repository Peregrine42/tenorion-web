import React, { useEffect, useState, JSX, useRef } from "react";
import { ResizeObserver } from "@juggle/resize-observer";
import useMeasure from "react-use-measure";
import _ from "lodash";
import { DrumMachine, Reverb, Soundfont } from "smplr";

import { forRange } from "./utils";
import { Pitch, drumkitTr808, lookupPitch, marimba, strings } from "./pitch";
import { starterPattern } from "./starterPattern";

const basePitchesCount = 16;
const baseBeatsCount = 16;
const basePartsPerBeat = 0.25;
const baseTempo = 108;

type GridCell = { x: number; y: number; w: number; h: number };
type Grid = GridCell[][];
type CellCoord = { row: number; column: number } | null;

const inSecs = (tempo: number, dur: number) => {
  return (60 / (tempo / basePartsPerBeat)) * dur;
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
  const pitchesCount = grid.length;
  const beatsCount = grid[0]?.length || 0;
  if (beatsCount === 0 || pitchesCount === 0) {
    throw new Error("Uninitialized grid!");
  }

  const parent = (e.target as HTMLElement).parentElement?.parentElement;
  if (!parent) return null;
  const bb = parent.getBoundingClientRect();
  const { x, y } = bb;

  let offsetX = e.changedTouches[0].clientX - x;
  let offsetY = e.changedTouches[0].clientY - y;

  let target: CellCoord | null = null;
  await forRange(0, beatsCount, async (row) => {
    return await forRange(0, pitchesCount, async (column) => {
      const w = grid[row][column].w;
      const h = grid[row][column].h;
      const x = grid[row][column].x;
      const y = grid[row][column].y;
      if (pointWithinCell(w, h, x, y, offsetX, offsetY)) {
        target = { row, column };
        return true;
      }
    });
  });
  return target;
};

const TenorionCell = ({
  i,
  j,
  cellX: x,
  cellY: y,
  cellWidth: w,
  cellHeight: h,
  gridWidth: width,
  gridHeight: height,
  pointerDragging,
  pointerActionActivating,
  onDown,
  onUp,
  active,
  setActive,
  isUnderCursor,
  grid,
}: {
  i: number;
  j: number;
  cellX: number;
  cellY: number;
  cellWidth: number;
  cellHeight: number;
  gridWidth: number;
  gridHeight: number;
  pointerDragging: boolean;
  pointerActionActivating: boolean;
  onDown: (active: boolean) => void;
  onUp: () => void;
  active: boolean;
  setActive: (v: boolean) => void;
  isUnderCursor: boolean;
  grid: Grid;
}) => {
  const [firstActive, setFirstActive] = useState(active);

  useEffect(() => {
    if (!firstActive && active) setFirstActive(true);
  }, [active, firstActive]);

  const entryDelay = i * j * 0.002;
  const pitchesCount = grid[i].length;
  const beatsCount = grid.length;

  return (
    <g
      onMouseDown={(e: React.MouseEvent) => {
        if (hasTouch()) return;
        onDown(!active);
        setActive(!active);
      }}
      onMouseOver={(e) => {
        !hasTouch() && pointerDragging && setActive(pointerActionActivating);
      }}
      onMouseUp={() => !hasTouch() && onUp()}
    >
      <rect
        style={{
          animation: "0.4s opacity forwards",
          animationDelay: `${entryDelay}s`,
          touchAction: "none",
        }}
        opacity="0"
        className="cell"
        rx={width * 0.005}
        fill={colorFor(i, j, isUnderCursor)}
        x={x + 0.02 * (width / beatsCount)}
        y={y + 0.02 * (height / pitchesCount)}
        width={w * 0.94}
        height={h * 0.94}
      />
      <rect
        x={x + 0.02 * (width / beatsCount)}
        y={y + 0.02 * (height / pitchesCount)}
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
  pitch: Pitch,
  activations: boolean[][]
) => {
  if (pitch.playing) {
    return 0;
  }
  if (!pitch.join) {
    return 1;
  }
  const row = activations.map((columns) => columns[j]);
  const remainingAhead = row.slice(i);
  const stopIndex = remainingAhead.findIndex((c) => !c);
  const noteLength = remainingAhead.slice(0, stopIndex).length;

  let extraStopIndex = 0;
  if (stopIndex === -1) {
    const remainingBehind = row.slice(0, i);
    extraStopIndex = remainingBehind.findIndex((c) => !c);
    if (extraStopIndex === -1) extraStopIndex = i;
  }

  const totalLength = noteLength + extraStopIndex;
  return totalLength;
};

const stopAllNotesImmediately = async (grid: Grid) => {
  await forRange(0, grid[0]?.length || 0, async (row) => {
    const p = lookupPitch(row);
    p.current?.forEach((f) => f(0));
    p.playing = 0;
  });
};

const Tenorion = ({}: {}) => {
  const [loading, setLoading] = useState(false);

  const [overallWidth, setOverallWidth] = useState(0);
  const [overallHeight, setOverallHeight] = useState(0);
  const [ref, bounds] = useMeasure({ polyfill: ResizeObserver });

  const [pointerDragging, setDragging] = useState(false);
  const pointerDraggingRef = useRef<boolean>(pointerDragging);
  const [pointerActionActivating, setDragActivating] = useState(false);

  const [grid, setGrid] = useState<Grid>([]);
  const [activations, setActivations] = useState<boolean[][]>([]);
  const [cursor, setCursor] = useState(-1);
  const [lastCursor, setLastCursor] = useState(-1);

  const [tempo, setTempo] = useState(baseTempo);
  const [cued, setCued] = useState(false);
  const [tempoIntervalId, setTempoIntervalId] = useState<number | undefined>();

  const drumkitInstrument = useRef<DrumMachine>();
  const stringsInstrument = useRef<Soundfont>();
  const marimbaInstrument = useRef<Soundfont>();
  const reverb = useRef<Reverb>();

  // handles cueing the start and stop of the music
  // also resets the music when the tempo is changed
  useEffect(() => {
    (async () => {
      await cueStop();
      await cueStart(cued, tempo);
    })().catch((e) => console.error(e));
  }, [cued, tempo]);

  // handles playing the activated notes at the cursor
  useEffect(() => {
    playActivatedNotes();
  }, [cursor]);

  // handles resizing of the viewport, and therefore the grid
  useEffect(() => {
    resizeGrid(grid).catch((e) => console.error(e));
  }, [bounds]);

  useEffect(() => {
    pointerDraggingRef.current = pointerDragging;
  }, [pointerDragging]);

  const toActivationsString = (activations: boolean[][]): string => {
    const acts: boolean[][] = [];
    activations.forEach((row) => {
      const c: boolean[] = [];
      acts.push(c);
      row.forEach((col, j) => {
        c.push(col);
      });
    });

    return JSON.stringify(acts);
  };

  const onSpacebar = () => {
    setCued((c) => !c);
  };

  const setStarterGridActivations = (acts: boolean[][]) => {
    starterPattern.forEach((row, i) => {
      row.forEach((_, j) => {
        acts[i][j] = starterPattern[j][i] === 1;
      });
    });
  };

  const setInitialActivations = (acts: boolean[][], s: string | null) => {
    const bools = s ? JSON.parse(s) : null;

    if (bools) {
      bools.forEach((row, i) => {
        row.forEach((_, j) => {
          acts[i][j] = bools[i][j];
        });
      });
    } else {
      setStarterGridActivations(acts);
    }
  };

  const clearGridActivations = async () => {
    const g: boolean[][] = [];
    await forRange(0, baseBeatsCount, async (i) => {
      const current: boolean[] = [];
      g.push(current);
      await forRange(0, basePitchesCount, async (j) => {
        current.push(false);
      });
    });
    return g;
  };

  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === " ") onSpacebar();
  };

  // handles grid setup (from Local Storage), and setting up keyboard shortcuts
  useEffect(() => {
    (async () => {
      const tempoString = localStorage.getItem("tempo");
      const newTempo = parseInt(tempoString || `${baseTempo}`);
      setTempo(newTempo);

      const gridString = localStorage.getItem("grid");
      const acts = await (async () => {
        const a: boolean[][] = [];
        await forRange(0, baseBeatsCount, async () => {
          const current: boolean[] = [];
          a.push(current);
          await forRange(0, basePitchesCount, async () => {
            current.push(false);
          });
        });
        return a;
      })();

      setupGridDims(overallWidth, overallHeight);
      setInitialActivations(acts, gridString);
      setActivations(acts);
    })();

    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener("keydown", keyHandler);
    };
  }, []);

  const preventScrollOnDrag = (e: TouchEvent) => {
    if (pointerDraggingRef.current) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };

  useEffect(() => {
    document.addEventListener("touchmove", preventScrollOnDrag, {
      passive: false,
    });
  }, []);

  const cueStart = async (cued: boolean, tempoOverride?: number) => {
    if (cued) {
      await stopAllNotesImmediately(grid);

      const context = new AudioContext();

      if (!context) throw new Error("Could not get AudioContext!");
      if (!reverb.current) reverb.current = new Reverb(context);

      if (!drumkitInstrument.current) {
        drumkitInstrument.current = new DrumMachine(context, {
          instrument: "TR-808",
          volume: 127,
        });

        drumkitInstrument.current.output.addEffect(
          "reverb",
          reverb.current,
          0.07
        );
      }

      if (!stringsInstrument.current) {
        stringsInstrument.current = new Soundfont(context, {
          instrument: "tremolo_strings",
          volume: 85,
        });

        stringsInstrument.current.output.addEffect(
          "reverb",
          reverb.current,
          0.5
        );
      }

      if (!marimbaInstrument.current) {
        marimbaInstrument.current = new Soundfont(context, {
          instrument: "marimba",
        });

        marimbaInstrument.current.output.addEffect(
          "reverb",
          reverb.current,
          0.3
        );
      }

      setLoading(true);
      await drumkitInstrument.current.load;
      await stringsInstrument.current.load;
      await marimbaInstrument.current.load;
      setLoading(false);
      setCursor(-1);

      const id = setInterval(() => {
        setCursor((v) => {
          v = v + 1;
          if (v > grid.length - 1) v = 0;
          return v;
        });
      }, (60 * 1000) / ((tempoOverride || tempo) / basePartsPerBeat));
      setTempoIntervalId(id);
    }
  };

  const cueStop = async () => {
    await stopAllNotesImmediately(grid);
    clearInterval(tempoIntervalId);
    setTempoIntervalId(undefined);
  };

  const playActivatedNotes = () => {
    if (cursor > -1 && lastCursor !== cursor) {
      setLastCursor(cursor);
      for (let row = 0; row < grid[cursor].length; row += 1) {
        const cell = grid[cursor][row];
        const pitch = lookupPitch(row);
        const acting = activations[cursor][row];

        if (acting) {
          const instrument = (() => {
            if (pitch.instrument === drumkitTr808) return drumkitInstrument;
            if (pitch.instrument === strings) return stringsInstrument;
            if (pitch.instrument === marimba) return marimbaInstrument;
          })();
          const dur = getDuration(cursor, row, pitch, activations);
          if (
            dur > 0 ||
            (inSecs(tempo, pitch.originalLength - pitch.playing) > 2.5 &&
              inSecs(tempo, pitch.originalLength) > 2.5)
          ) {
            const secs = inSecs(tempo, dur);
            const loopableSecs = secs > 3 ? 3 : secs;
            pitch.current = [];

            const noteEnd = instrument?.current?.start({
              duration: loopableSecs,
              velocity: 80,
              note: pitch.value,
            });

            if (noteEnd) pitch.current.push(noteEnd);

            if (pitch.doubleUp) {
              const extraNote =
                pitch.value[0] + (parseInt(pitch.value.slice(1)) + 1);
              const extraNoteEnd = instrument?.current?.start({
                duration: loopableSecs,
                velocity: 80,
                note: extraNote,
              });

              if (extraNoteEnd) pitch.current.push(extraNoteEnd);
            }
            pitch.playing = dur;
            pitch.originalLength = dur;
          }
        }

        if (pitch.playing > 0) {
          pitch.playing -= 1;
        }
      }
    }
  };

  const resizeGrid = async (grid: Grid) => {
    if (bounds.width > 0 && bounds.height > 0) {
      const newMaxWidth = bounds.width * 0.9;
      const newMaxHeight = bounds.height * 0.9;

      let newWidth = newMaxHeight;
      let newHeight = newMaxHeight;
      if (newMaxWidth < newMaxHeight) {
        newWidth = newMaxWidth;
        newHeight = newMaxWidth;
      }

      setOverallWidth(newWidth);
      setOverallHeight(newHeight);
      await setupGridDims(newWidth, newHeight);
    }
  };

  const getActive = (i: number, j: number, activations: boolean[][]) => {
    return activations[i][j];
  };

  const setParticularActivation = (
    activations: boolean[][],
    activated: boolean,
    row: number,
    column: number,
    opts?: { store?: boolean }
  ) => {
    const newActs = _.cloneDeep(activations);
    newActs[row][column] = activated;
    setActivations(newActs);
    if (opts?.store) localStorage.setItem("grid", toActivationsString(newActs));
  };

  const getCells = (grid: Grid, activations: boolean[][]) => {
    const cells: JSX.Element[][] = [];

    if (!overallWidth || !overallHeight) return cells;

    for (let row = 0; row < grid.length; row += 1) {
      const current: JSX.Element[] = [];
      cells.push(current);
      for (let column = 0; column < grid[row].length; column += 1) {
        current.push(
          <TenorionCell
            isUnderCursor={cursor === row}
            key={`${row}-${column}`}
            i={row}
            j={column}
            cellX={grid[row][column].x}
            cellY={grid[row][column].y}
            cellWidth={grid[row][column].w}
            cellHeight={grid[row][column].h}
            gridWidth={overallWidth}
            gridHeight={overallHeight}
            pointerDragging={pointerDragging}
            pointerActionActivating={pointerActionActivating}
            onDown={(activated) => {
              setDragActivating(activated);
              setDragging(true);
            }}
            onUp={() => {
              setDragging(false);
            }}
            active={activations[row][column]}
            setActive={(activated) => {
              setParticularActivation(activations, activated, row, column, {
                store: true,
              });
            }}
            grid={grid}
          />
        );
      }
    }

    return cells;
  };

  const setupGridDims = async (
    overallWidth: number,
    overallHeight: number
  ): Promise<void> => {
    const pitchesCount = basePitchesCount;
    const beatsCount = baseBeatsCount;

    const grid: Grid = [];
    await forRange(0, beatsCount, async (row) => {
      const current: GridCell[] = [];
      grid.push(current);
      return await forRange(0, pitchesCount, async (column) => {
        const x = (overallWidth / beatsCount) * row;
        const y = (overallHeight / pitchesCount) * column;
        const w = overallWidth / beatsCount;
        const h = overallHeight / pitchesCount;

        current.push({
          x,
          y,
          w,
          h,
        });
      });
    });

    setGrid(grid);
  };

  const cells = (() => {
    if (grid.length > 0) return getCells(grid, activations);
    else return [];
  })();

  const getPlayIcon = (cued: boolean, loading: boolean) => {
    if (loading) return "spinner spin";
    else if (cued) return "pause";
    else return "play";
  };

  return (
    <div className="flex-shrink-0 flex-grow-1 d-flex justify-content-between align-items-spread flex-column">
      <div className="d-flex align-items-center justify-content-between">
        <div
          onClick={(e) => (e.target as HTMLDivElement).blur()}
          className="w-100 p-1 flex-grow-1 btn border d-flex"
        >
          <input
            className="flex-grow-1 "
            value={tempo}
            min={40}
            max={180}
            onChange={(e) => {
              const newTempo = parseInt(e.target.value);
              setTempo(newTempo);
              localStorage.setItem("tempo", newTempo.toString());
            }}
            type="range"
          ></input>
          <button
            onClick={(e) => {
              (e.target as HTMLButtonElement).blur();
              setTempo(108);
            }}
            className="flex-shrink-1 reset-tempo-button btn mx-3"
          >
            <i className="fa-xl align-middle fa-solid fa-clock"></i>
            &nbsp; {tempo} bpm
          </button>
        </div>

        <div className="w-100 flex-shrink-1 align-middle d-flex flex-column align-items-center">
          <button
            className={`btn play-button btn-success rounded-circle`}
            onClick={(e) => {
              (e.target as HTMLButtonElement).blur();
              const newCued = !cued;
              setCued(newCued);
              if (!newCued) setCursor(-1);
            }}
            aria-label={`${cued ? "pause" : "play"} button`}
          >
            <i
              className={`fa-xl align-middle fa-solid fa-${getPlayIcon(
                cued,
                loading
              )}`}
            ></i>
          </button>
        </div>
        <div className="w-100 flex-grow-1 d-flex flex-column align-items-end">
          <button
            className="text-right btn btn-danger"
            onClick={async (e) => {
              (e.target as HTMLButtonElement).blur();
              await stopAllNotesImmediately(grid);
              setActivations(await clearGridActivations());
              localStorage.setItem("grid", "");
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
            width={overallWidth}
            height={overallHeight}
            className="drop-shadow"
            onTouchMove={async (e) => {
              const coords = await getCellCoordsFromTouchEvent(grid, e);
              if (coords === null) return;
              const { row, column } = coords;
              if (
                getActive(row, column, activations) !== pointerActionActivating
              ) {
                setParticularActivation(
                  activations,
                  pointerActionActivating,
                  row,
                  column
                );
              }
            }}
            onTouchStart={async (e) => {
              const coords = await getCellCoordsFromTouchEvent(grid, e);
              if (coords === null) return;
              const { row, column } = coords;
              const newActive = !getActive(row, column, activations);
              setDragging(true);
              setParticularActivation(activations, newActive, row, column);
              setDragActivating(newActive);
            }}
            onTouchEnd={(e) => {
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
                rx={overallWidth * 0.005}
                fill="#ffffff"
                width={overallWidth}
                height={overallHeight}
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

const hasTouch = () => {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
};

export default Tenorion;
