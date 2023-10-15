import React, { useEffect, useState, JSX, useRef } from "react";
import { ResizeObserver } from "@juggle/resize-observer";
import useMeasure from "react-use-measure";
import _ from "lodash";
import { DrumMachine, Soundfont } from "smplr";
import { forRange } from "./utils";
import { Pitch, drumkitTr808, lookupPitch, marimba, strings } from "./pitch";
import { starterPattern } from "./starterPattern";

const basePitchesCount = 16;
const baseBeatsCount = 16;
const basePartsPerBeat = 0.25;

type Grid = { active: boolean; x: number; y: number; w: number; h: number }[][];
type CellCoord = { i: number; j: number } | null;

const inSecs = (tempo: number, dur: number) => {
  return (60 / (tempo / basePartsPerBeat)) * dur;
};

const getNewGrid = async (
  previousGrid: Grid,
  overallWidth: number,
  overallHeight: number,
  clear = false,
  isStarter = false
): Promise<Grid> => {
  const pitchesCount = previousGrid?.[0]?.length || basePitchesCount;
  const beatsCount = previousGrid.length || baseBeatsCount;

  const grid: Grid = [];
  await forRange(0, beatsCount, async () => {
    const column = [];
    grid.push(column);
  });

  await forRange(0, beatsCount, async (row) => {
    return await forRange(0, pitchesCount, async (column) => {
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

  let target: { row: number; column: number } | null = null;
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
  const [firstActive, setFirstActive] = useState(false);

  useEffect(() => {
    if (!firstActive && active) setFirstActive(true);
  }, [active, firstActive]);

  const entryDelay = i * j * 0.002;
  const pitchesCount = grid[i].length;
  const beatsCount = grid.length;

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
        !hasTouch() && pointerDragging && setActive(pointerActionActivating);
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

const getDuration = (i: number, j: number, pitch: Pitch, grid: Grid) => {
  if (pitch.playing) {
    return 0;
  }
  if (!pitch.join) {
    return 1;
  }
  const row = grid.map((columns) => columns[j]);
  // console.log(row);
  const remainingAhead = row.slice(i);
  // console.log(remainingAhead);
  const stopIndex = remainingAhead.findIndex((c) => !c.active);
  // console.log(remainingAhead, stopIndex)
  const noteLength = remainingAhead.slice(0, stopIndex).length;
  let extraStopIndex = 0;
  if (stopIndex === -1) {
    const remainingBehind = row.slice(0, i);
    extraStopIndex = remainingBehind.findIndex((c) => !c.active);
    if (extraStopIndex === -1) extraStopIndex = i;
  }

  const totalLength = noteLength + extraStopIndex;
  console.log({ totalLength });
  return totalLength;
};

const stopAllNotesImmediately = async (grid: Grid) => {
  await forRange(0, grid[0]?.length || 0, async (row) => {
    const p = lookupPitch(row);
    p.current?.(0);
    p.playing = 0;
  });
};

const Tenorion = ({}: {}) => {
  const [loading, setLoading] = useState(false);

  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [ref, bounds] = useMeasure({ polyfill: ResizeObserver });

  const [pointerDragging, setDragging] = useState(false);
  const [pointerActionActivating, setDragActivating] = useState(false);

  const [grid, setGrid] = useState<Grid>([]);
  const [cursor, setCursor] = useState(-1);
  const [lastCursor, setLastCursor] = useState(-1);

  const [tempo, setTempo] = useState(100);
  const [cued, setCued] = useState(false);
  const [tempoIntervalId, setTempoIntervalId] = useState<number | undefined>();

  const drumkitInstrument = useRef<DrumMachine>();
  const stringsInstrument = useRef<Soundfont>();
  const marimbaInstrument = useRef<Soundfont>();

  // handles cueing the start and stop of the music
  // also resets the music when the tempo is changed
  useEffect(() => {
    (async () => {
      await cueStop();
      await cueStart(tempo);
    })().catch((e) => console.error(e));
  }, [cued, tempo]);

  // handles playing the activated notes at the cursor
  useEffect(() => {
    playActivatedNotes();
  }, [cursor]);

  // handles resizing of the viewport, and therefore the grid
  useEffect(() => {
    resizeGrid().catch((e) => console.error(e));
  }, [bounds, setWidth, setHeight]);

  const cueStart = async (tempoOverride?: number) => {
    if (cued) {
      await stopAllNotesImmediately(grid);
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

        if (cell.active) {
          const instrument = (() => {
            if (pitch.instrument === drumkitTr808) return drumkitInstrument;
            if (pitch.instrument === strings) return stringsInstrument;
            if (pitch.instrument === marimba) return marimbaInstrument;
          })();
          const dur = getDuration(cursor, row, pitch, grid);
          if (dur > 0) {
            console.log("hit");

            const secs = inSecs(tempo, dur);
            const loopableSecs = secs > 3 ? 3 : secs;
            pitch.current = instrument?.current?.start({
              duration: loopableSecs,
              velocity: 80,
              note: pitch.value,
            });
            pitch.playing = dur;
            pitch.originalLength = dur;
          } else if (
            inSecs(tempo, pitch.originalLength - pitch.playing) > 2.5 &&
            inSecs(tempo, pitch.originalLength) > 2.5
          ) {
            const secs = inSecs(tempo, pitch.playing);
            const loopableSecs = secs > 3 ? 3 : secs;
            pitch.current = instrument?.current?.start({
              duration: loopableSecs,
              velocity: 80,
              note: pitch.value,
            });
            pitch.playing = dur;
            pitch.originalLength = dur;
            console.log("continue!");
          }
        }

        if (pitch.playing > 0) {
          pitch.playing -= 1;
        }
      }
    }
  };

  const resizeGrid = async () => {
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
  };

  const getActive = (i: number, j: number) => {
    return grid[i][j].active;
  };

  const setParticularActivation = (
    activated: boolean,
    row: number,
    column: number
  ) => {
    const newGrid = _.cloneDeep(grid);
    newGrid[row][column].active = activated;
    setGrid(newGrid);
  };

  const getCells = (grid: Grid) => {
    const cells: JSX.Element[][] = [];

    if (!width || !height) return cells;

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
            gridWidth={width}
            gridHeight={height}
            pointerDragging={pointerDragging}
            pointerActionActivating={pointerActionActivating}
            onDown={(activated) => {
              setDragActivating(activated);
              setDragging(true);
            }}
            onUp={() => {
              setDragging(false);
            }}
            active={grid[row][column].active}
            setActive={(activated) => {
              setParticularActivation(activated, row, column);
            }}
            grid={grid}
          />
        );
      }
    }

    return cells;
  };

  const cells = (() => {
    if (grid.length > 0) return getCells(grid);
    else return [];
  })();

  const getPlayIcon = (cued: boolean, loading: boolean) => {
    if (loading) return "spinner spin"
    else if (cued) return "pause"
    else return "play" 
  }

  return (
    <div className="flex-shrink-0 flex-grow-1 d-flex justify-content-between align-items-spread flex-column">
      <div className="d-flex align-items-center justify-content-between">
        <div className="w-100 p-1 flex-grow-1 btn border d-flex">
          <input
            className="flex-grow-1 "
            value={tempo}
            min={40}
            max={180}
            onChange={(e) => {
              setTempo(parseInt(e.target.value));
            }}
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
              if (!drumkitInstrument.current)
                drumkitInstrument.current = new DrumMachine(
                  new AudioContext(),
                  {
                    instrument: "TR-808",
                    volume: 127,
                  }
                );
              if (!stringsInstrument.current)
                stringsInstrument.current = new Soundfont(new AudioContext(), {
                  instrument: "string_ensemble_1",
                  volume: 85,
                });
              if (!marimbaInstrument.current)
                marimbaInstrument.current = new Soundfont(new AudioContext(), {
                  instrument: "marimba",
                });
              setLoading(true);
              await drumkitInstrument.current.load;
              await marimbaInstrument.current.load;
              await stringsInstrument.current.load;
              setLoading(false);
              if (cued) setCursor(-1);
              setCued(!cued);
            }}
            aria-label={`${cued ? "pause" : "play"} button`}
          >
            <i
              className={`fa-xl align-middle fa-solid fa-${
                getPlayIcon(cued, loading)
              }`}
            ></i>
          </button>
        </div>
        <div className="w-100 flex-grow-1 d-flex flex-column align-items-end">
          <button
            className="text-right btn btn-danger"
            onClick={async () => {
              await stopAllNotesImmediately(grid);
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
              if (getActive(i, j) !== pointerActionActivating) {
                setParticularActivation(pointerActionActivating, i, j);
              }
            }}
            onTouchStart={async (e) => {
              e.stopPropagation();
              const coords = await getCellCoordsFromTouchEvent(grid, e);
              if (coords === null) return;
              const { i, j } = coords;
              setDragging(true);
              setParticularActivation(!getActive(i, j), i, j);
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

const hasTouch = () => {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
};

const initialActivation = (
  row: number,
  column: number,
  starter: boolean
): boolean => {
  if (!starter) return false;
  return starterPattern[column][row] === 1;
};

export default Tenorion;
