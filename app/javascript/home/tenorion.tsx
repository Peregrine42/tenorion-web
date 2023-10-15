import React, { useEffect, useState, JSX, useRef } from "react";
import { ResizeObserver } from "@juggle/resize-observer";
import useMeasure from "react-use-measure";
import _ from "lodash";
import { DrumMachine, Soundfont } from "smplr";

type Grid = { active: boolean; x: number; y: number; w: number; h: number }[][];

function hasTouch() {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

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

function getStarterActivation(i: number, j: number, starter: boolean) {
  if (!starter) return false;
  return starterPattern[j][i] === 1;
}

const notes = [
  {
    value: "kick/bd0000",
    instrument: 0,
    playing: 0,
    current: (v: number) => {},
  },
  { value: "1", instrument: 0, playing: 0, current: (v: number) => {} },
  { value: "clap/cp", instrument: 0, playing: 0, current: (v: number) => {} },
  {
    value: "hihat-close/ch",
    instrument: 0,
    playing: 0,
    current: (v: number) => {},
  },
  {
    value: "hihat-open/oh10",
    instrument: 0,
    playing: 0,
    current: (v: number) => {},
  },
  { value: "C4", instrument: 1, playing: 0, current: (v: number) => {} },
  { value: "D4", instrument: 1, playing: 0, current: (v: number) => {} },
  { value: "E4", instrument: 1, playing: 0, current: (v: number) => {} },
  { value: "G4", instrument: 1, playing: 0, current: (v: number) => {} },
  { value: "A4", instrument: 1, playing: 0, current: (v: number) => {} },
  { value: "C5", instrument: 1, playing: 0, current: (v: number) => {} },
  { value: "C4", instrument: 2, playing: 0, current: (v: number) => {} },
  { value: "D4", instrument: 2, playing: 0, current: (v: number) => {} },
  { value: "E4", instrument: 2, playing: 0, current: (v: number) => {} },
  { value: "G4", instrument: 2, playing: 0, current: (v: number) => {} },
  { value: "A4", instrument: 2, playing: 0, current: (v: number) => {} },
];
function lookupPitch(j: number) {
  return notes[15 - j];
}

const updateGrid = (
  existingGrid: Grid,
  width: number,
  height: number,
  clear = false,
  starter = false
) => {
  const grid: Grid = [];
  for (let i = 0; i < 16; i += 1) {
    grid.push([]);
    for (let j = 0; j < 16; j += 1) {
      const x = (width / 16) * i;
      const y = (height / 16) * j;
      const w = width / 16;
      const h = height / 16;
      const active =
        existingGrid[i]?.[j]?.active || getStarterActivation(i, j, starter);
      grid[i].push({
        x,
        y,
        w,
        h,
        active: clear ? false : active,
      });
    }
  }

  return grid;
};

function hintPlaying(r: number, g: number, b: number, playing: boolean) {
  if (playing) {
    r += 0;
    g += 10;
    b += 30;
  }
  return `rgb(${r},${g},${b})`;
}

function colorFrom(i: number, j: number, playing: boolean) {
  if (i % 4 === 0) return hintPlaying(206, 161, 252, playing);
  return hintPlaying(217, 196, 237, playing);
}

function getCellCoords(grid: Grid, e: React.TouchEvent<SVGSVGElement>) {
  const parent = (e.target as HTMLElement).parentElement?.parentElement;
  if (!parent) return {};
  const bb = parent.getBoundingClientRect();
  const { x, y } = bb;

  let offsetX = e.changedTouches[0].clientX - x;
  let offsetY = e.changedTouches[0].clientY - y;

  for (let i = 0; i < 16; i += 1) {
    for (let j = 0; j < 16; j += 1) {
      const w = grid[i][j].w;
      const h = grid[i][j].h;
      const x = grid[i][j].x;
      const y = grid[i][j].y;
      if (offsetX > x && offsetX < x + w && offsetY > y && offsetY < y + h) {
        return {
          i,
          j,
        };
      }
    }
  }
  return {};
}

const TenorionCell = ({
  playing,
  i,
  j,
  width,
  height,
  dragging,
  actionDirection,
  onDown,
  onUp,
  active,
  setActive,
  x,
  y,
  w,
  h,
}: {
  playing: boolean;
  i: number;
  j: number;
  width: number;
  height: number;
  dragging: boolean;
  actionDirection: boolean;
  onDown: (active: boolean) => void;
  onUp: () => void;
  active: boolean;
  setActive: (v: boolean) => void;
  x: number;
  y: number;
  w: number;
  h: number;
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
        fill={colorFrom(i, j, playing)}
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
      setGrid(updateGrid(grid, newWidth, newHeight, false, true));
    }
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
              playing={cursor === i}
              key={`${i}-${j}`}
              i={i}
              j={j}
              width={width}
              height={height}
              dragging={dragging}
              actionDirection={dragActivating}
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
              x={grid[i][j].x}
              y={grid[i][j].y}
              w={grid[i][j].w}
              h={grid[i][j].h}
            />
          );
        }
      }
    }
    return cells;
  };

  const cells = getCells(grid);
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
                  volume: 40,
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
            onClick={() => {
              setGrid(updateGrid(grid, width, height, true));
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
            onTouchMove={(e) => {
              e.stopPropagation();
              const { i, j } = getCellCoords(grid, e);
              if (i === undefined || j === undefined) return;
              if (getActive(i, j) !== dragActivating)
                setParticularActive(dragActivating, i, j);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              const { i, j } = getCellCoords(grid, e);
              if (i === undefined || j === undefined) return;
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
