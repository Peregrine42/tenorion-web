import React, { useEffect, useState, JSX } from "react";
import { ResizeObserver } from "@juggle/resize-observer";
import useMeasure from "react-use-measure";
import _ from "lodash";

type Grid = { active: boolean; x: number; y: number; w: number; h: number }[][];

function hasTouch() {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
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

function hintActive(r: number, g: number, b: number, active: boolean) {
  if (active) {
    r -= 80;
    g -= 80;
    b -= 80;
  }
  return `rgb(${r},${g},${b})`;
}

function colorFrom(i: number, j: number, active: boolean) {
  if (i % 4 === 0) return hintActive(206, 161, 252, active);
  return hintActive(217, 196, 237, active);
}

function getCellCoords(grid: Grid, e: React.TouchEvent<SVGSVGElement>) {
  const parent = (e.target as HTMLElement).parentElement?.parentElement;
  console.log(parent);
  if (!parent) return {};
  const bb = parent.getBoundingClientRect();
  const { x, y } = bb;

  let offsetX = e.changedTouches[0].clientX - x;
  let offsetY = e.changedTouches[0].clientY - y;

  console.log(offsetX);

  for (let i = 0; i < 16; i += 1) {
    for (let j = 0; j < 16; j += 1) {
      const w = grid[i][j].w;
      const h = grid[i][j].h;
      const x = grid[i][j].x;
      const y = grid[i][j].y;
      if (offsetX > x && offsetX < x + w && offsetY > y && offsetY < y + h) {
        console.log({ x, y, i, j });
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
        fill={colorFrom(i, j, false)}
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
  const [cursor, setCursor] = useState(0);

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
