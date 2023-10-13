import React, { useEffect, useState, JSX, useRef } from "react";
import { ResizeObserver } from "@juggle/resize-observer";
import useMeasure from "react-use-measure";
import _ from "lodash";
import Soundfont from "soundfont-player";

type Grid = { active: boolean; x: number; y: number; w: number; h: number }[][];

function hasTouch() {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

const notes = [
  "C4",
  "D4",
  "E4",
  "G4",
  "A4",
  "C5",
  "D5",
  "E5",
  "G5",
  "A5",
  "C6",
  "D6",
  "E6",
  "G6",
  "A6",
  "C7",
];
function lookupNote(j) {
  return notes[15 - j];
}

const updateGrid = (existingGrid: Grid, width: number, height: number) => {
  const grid: Grid = [];
  for (let i = 0; i < 16; i += 1) {
    grid.push([]);
    for (let j = 0; j < 16; j += 1) {
      const x = (width / 16) * i;
      const y = (height / 16) * j;
      const w = width / 16;
      const h = height / 16;
      const active = existingGrid[i]?.[j]?.active || false;
      grid[i].push({
        x,
        y,
        w,
        h,
        active,
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
      if (intervalId !== undefined) clearInterval(intervalId);
    }
  }, [cued, tempo, setCursor]);

  useEffect(() => {
    if (cursor > -1 && lastCursor !== cursor) {
      setLastCursor(cursor);
      for (let j = 0; j < 16; j += 1) {
        const cell = grid[cursor][j];
        if (cell.active) marimba.current?.play(lookupNote(j));
      }
    }
  }, [grid, cursor, lastCursor]);

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
      setGrid(updateGrid(grid, newWidth, newHeight));
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
    <div className="flex-shrink-0 flex-grow-1 d-flex align-items-spread flex-column">
      <input
        value={tempo}
        min={40}
        max={160}
        onChange={(e) => setTempo(parseInt(e.target.value))}
        type="range"
      ></input>
      <input
        onClick={async () => {
          if (!marimba.current)
            marimba.current = await Soundfont.instrument(
              new AudioContext(),
              "marimba"
            );
          if (cued) setCursor(-1);
          setCued(!cued);
        }}
        value={cued ? "⏸" : "⏵"}
        type="button"
      ></input>
      <div className="border-cell d-flex flex-shrink-1 flex-grow-1 align-items-spread"></div>
      <div className="d-flex flex-shrink-1 flex-grow-1 align-items-spread">
        <div className="border-cell flex-shrink-1 flex-grow-1"></div>
        <div ref={ref} className="stage flex-shrink-1 flex-grow-1">
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
