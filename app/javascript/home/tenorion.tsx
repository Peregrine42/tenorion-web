import React, { useEffect, useState, useRef, useCallback } from "react";
import { ResizeObserver } from "@juggle/resize-observer";
if (!window.ResizeObserver) {
  window.ResizeObserver = ResizeObserver;
}
import { useMeasure, useWindowSize } from "@react-hookz/web";
import _ from "lodash";

import useObserver = require("pojo-observer");

import {
  ClockFill,
  PauseFill,
  PlayFill,
  TrashFill,
} from "react-bootstrap-icons";

import { forRange } from "./utils";
import { Pitch, pendingInstruments } from "./pitch";
import { starterPattern } from "./starterPattern";
import { Sequencer } from "./sequencer";
import { Reverb, connect as toneConnect, Compressor, Gain } from "tone";
const basePitchesCount = 16;
const baseBeatsCount = 16;
const baseTempo = 108;

type GridCell = { x: number; y: number; w: number; h: number };
type Grid = GridCell[][];
type CellCoord = { row: number; column: number } | null;

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

const sequencer = new Sequencer();

const colorFor = (i: number, j: number, playing: boolean): string => {
  let r = 217;
  let g = 196;
  let b = 237;

  if (i % 4 === 0) {
    r = 206;
    g = 161;
    b = 252;
  }

  if (j > 4 && j < 11) r -= 20;

  return hintUnderCursor(r, g, b, playing);
};

type CellData = {
  isUnderCursor: boolean;
  key: string;
  i: number;
  j: number;
  cellX: number;
  cellY: number;
  cellWidth: number;
  cellHeight: number;
  pointerDragging: boolean;
  pointerActionActivating: boolean;
  active: boolean;
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
  pointerDragging,
  pointerActionActivating,
  onDown,
  onUp,
  active,
  setActive,
  isUnderCursor,
}: {
  i: number;
  j: number;
  cellX: number;
  cellY: number;
  cellWidth: number;
  cellHeight: number;
  pointerDragging: boolean;
  pointerActionActivating: boolean;
  onDown: (active: boolean) => void;
  onUp: () => void;
  active: boolean | undefined;
  setActive: (v: boolean) => void;
  isUnderCursor: boolean;
}) => {
  const [firstActive, setFirstActive] = useState(active);

  useEffect(() => {
    if (!firstActive && active) setFirstActive(true);
  }, [active, firstActive]);

  const entryDelay = i * j * 0.001;

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
        rx={0.005}
        fill={colorFor(i, j, isUnderCursor)}
        x={x + 1}
        y={y + 1}
        width={w * 0.96}
        height={h * 0.96}
      />
      <rect
        x={x}
        y={y}
        rx={0.0005}
        width={w * 0.96}
        height={h * 0.96}
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
  const { width: windowWidth, height: windowHeight } = useWindowSize();
  const [gridDims, gridRef] = useMeasure<SVGSVGElement>();
  const [dragging, setDragging] = useState(false);
  const pointerDraggingRef = useRef<boolean>(dragging);
  const [dragActivating, setDragActivating] = useState(false);
  const [uiTempo, setUiTempo] = useState<number>(0);

  let width: null | number = null;
  let height: null | number = null;
  if (gridDims) {
    ({ width, height } = gridDims);
  }

  const [cells, setCells] = useState<CellData[][]>([]);
  useObserver.default(sequencer);

  // handles resizing of the viewport, and therefore the grid
  useEffect(() => {
    resizeGrid().catch((e) => console.error(e));
  }, [
    sequencer.getActivations(),
    width,
    height,
    sequencer.isSetUp(),
    sequencer.getCursor(),
    windowWidth,
    windowHeight,
    dragging,
  ]);

  useEffect(() => {
    pointerDraggingRef.current = dragging;
  }, [dragging]);

  useEffect(() => {
    setUiTempo(sequencer.getTempo())
  }, [sequencer.getTempo()])



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

  const onSpacebar = useCallback(async (e: Event) => {
    return await onPlay(e as unknown as Event);
  }, []);

  const setStarterGridActivations = (acts: boolean[][]) => {
    starterPattern.forEach((row, i) => {
      row.forEach((_, j) => {
        acts[i][j] = starterPattern[j][i] === 1;
      });
    });
  };

  const setInitialActivations = (acts: boolean[][], s: string | null) => {
    const bools: boolean[][] = s ? JSON.parse(s) : null;

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

  const clearGridActivations = useCallback(async () => {
    const g: boolean[][] = [];
    await forRange(0, sequencer.getTotalSubBeats(), async (i) => {
      const current: boolean[] = [];
      g.push(current);
      await forRange(0, sequencer.getTotalPitches(), async (j) => {
        current.push(false);
      });
    });
    return g;
  }, [sequencer.getTotalSubBeats(), sequencer.getTotalPitches()]);

  const keyHandler = useCallback(async (e: KeyboardEvent) => {
    if (e.key === " ") {
      onSpacebar(e as unknown as Event).catch((e) => console.error(e));
    }
  }, []);

  // handles initial setup (from Local Storage), and setting up keyboard shortcuts
  const initialSetup = useCallback(async () => {
    if (!sequencer.isSetUp()) {
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
      setInitialActivations(acts, gridString);

      await sequencer.setup(baseBeatsCount, pendingInstruments, acts);

      const tempoString = localStorage.getItem("tempo");
      const newTempo = parseInt(tempoString || `${baseTempo}`);
      sequencer.setTempo(newTempo);
    }
  }, [sequencer.isSetUp()]);

  useEffect(() => {
    initialSetup();

    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener("keydown", keyHandler);
    };
  }, []);

  const preventScrollOnDrag = useCallback(
    (e: TouchEvent) => {
      if (pointerDraggingRef.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    [pointerDraggingRef.current]
  );

  useEffect(() => {
    document.addEventListener("touchmove", preventScrollOnDrag, {
      passive: false,
    });
  }, []);

  const stopAllNotesImmediately = async () => {
    await sequencer.stopPlayingPitchesNow();
  };

  const resizeGrid = useCallback(async () => {
    if (windowWidth && windowHeight) {
      const newMaxWidth = windowWidth * 0.85;
      const newMaxHeight = windowHeight * 0.85;

      let newWidth = newMaxHeight;
      let newHeight = newMaxHeight;
      if (newMaxWidth < newMaxHeight) {
        newWidth = newMaxWidth;
        newHeight = newMaxWidth;
      }

      if (sequencer.isSetUp()) {
        setCells(getCells(await setupGridDims(newWidth, newHeight)));
      }
    }
  }, [
    width,
    height,
    sequencer.isSetUp(),
    sequencer.getCursor(),
    windowWidth,
    windowHeight,
    dragging,
  ]);

  const getActive = useCallback(
    (i: number, j: number) => {
      return sequencer.getActivations()[i][j].active;
    },
    [sequencer.getActivations()]
  );

  const setActivation = useCallback(
    (
      activated: boolean,
      row: number,
      column: number,
      opts: { store?: boolean } = { store: true }
    ) => {
      sequencer.toggleActivation(
        sequencer.getActivations()[row][column],
        activated
      );
      const newActs =
        sequencer.getActivations().map((c) => c.map((r) => r.active)) || [];
      if (opts?.store)
        localStorage.setItem("grid", toActivationsString(newActs));
    },
    [sequencer.getActivations()]
  );

  const getCells = useCallback(
    (grid: Grid) => {
      const cells: CellData[][] = [];

      for (let row = 0; row < sequencer.getTotalPitches(); row += 1) {
        const current: CellData[] = [];
        cells.push(current);
        for (
          let column = 0;
          column < sequencer.getTotalSubBeats();
          column += 1
        ) {
          current.push({
            i: row,
            j: column,
            active: sequencer.getActivations()[row][column].active,
            isUnderCursor: sequencer.getCursor() === row,
            key: `${row}-${column}`,
            cellX: grid[row][column].x,
            cellY: grid[row][column].y,
            cellWidth: grid[row][column].w,
            cellHeight: grid[row][column].h,
            pointerDragging: dragging,
            pointerActionActivating: dragActivating,
          });
        }
      }

      return cells;
    },
    [
      sequencer.getActivations(),
      width,
      height,
      sequencer.getTotalPitches(),
      sequencer.getTotalSubBeats(),
      sequencer.getCursor(),
      sequencer.getActivations(),
      windowWidth,
      windowHeight,
      dragging,
    ]
  );

  const setupGridDims = useCallback(
    async (overrideWidth?: number, overrideHeight?: number): Promise<Grid> => {
      const grid: Grid = [];

      const w = overrideWidth || width;
      const h = overrideHeight || height;

      if (w && h) {
        const pitchesCount = sequencer.getTotalPitches() || basePitchesCount;
        const beatsCount = sequencer.getTotalSubBeats() || baseBeatsCount;

        await forRange(0, beatsCount, async (row) => {
          const current: GridCell[] = [];
          grid.push(current);
          return await forRange(0, pitchesCount, async (column) => {
            const x = (w / beatsCount) * row;
            const y = (h / pitchesCount) * column;
            const wid = w / beatsCount;
            const hei = h / pitchesCount;

            current.push({
              x,
              y,
              w: wid,
              h: hei,
            });
          });
        });
      }

      return grid;
    },
    [sequencer.getTotalPitches(), sequencer.getTotalSubBeats(), width, height]
  );

  const onPlay = useCallback(
    async (e: Event) => {
      (e.target as HTMLButtonElement).blur();
      await sequencer.toggle()
    },
    [sequencer.isPlaying(), sequencer.isConnected()]
  );

  return (
    <>
      <div className="header d-flex">
        <div
          onClick={(e) => (e.target as HTMLDivElement).blur()}
          className="flex-shrink-1 flex-grow-0 btn border d-flex"
        >
          <input
            style={{ maxWidth: "70px" }}
            value={uiTempo}
            min={40}
            max={180}
            onChange={(e) => {
              const newTempo = parseInt(e.target.value);
              setUiTempo(newTempo)
              sequencer.setTempo(newTempo);
              localStorage.setItem("tempo", newTempo.toString());
            }}
            type="range"
          ></input>
          <button
            onClick={(e) => {
              e.nativeEvent.stopImmediatePropagation();

              (e.target as HTMLButtonElement).blur();
              sequencer.setTempo(baseTempo);
              localStorage.setItem("tempo", baseTempo.toString());
            }}
            className="flex-shrink-1 reset-tempo-button btn"
          >
            <span>
              <span style={{ fontSize: "1.3rem" }}>
                <ClockFill />
              </span>
              &nbsp; {sequencer.getTempo()} bpm
            </span>
          </button>
        </div>

        <div className="w-100 flex-shrink-1 align-middle d-flex flex-column align-items-center justify-content-center">
          <button
            className={`btn play-button btn-success rounded-circle d-flex align-items-center justify-content-center`}
            onClick={useCallback(async (e: unknown) => {
              onPlay(e as unknown as Event).catch((e) => console.error(e));
            }, [])}
            aria-label={`${sequencer.isPlaying() ? "pause" : "play"} button`}
          >
            {(() => {
              if (sequencer.isPlaying()) return <PauseFill size="50" />;
              else return <PlayFill size="50" />;
            })()}
          </button>
        </div>
        <div className="justify-content-center w-100 flex-grow-1 d-flex flex-column align-items-end">
          <button
            className="text-right btn btn-danger reset-button"
            onClick={async (e) => {
              (e.target as HTMLButtonElement).blur();
              await stopAllNotesImmediately();
              sequencer.clearAllActivations();
              localStorage.setItem("grid", "");
            }}
          >
            <TrashFill />
          </button>
        </div>
      </div>
      <div className="divider"></div>
      <div className="center">
        <svg
          ref={gridRef}
          style={{
            border: `2px solid white`,
            borderRadius: `${(windowWidth || 0 * 0.85) * 0.005}px`,
          }}
          className="ar-1-1 drop-shadow"
          onTouchMove={useCallback(
            async (e: React.TouchEvent<SVGSVGElement>) => {
              const grid = await setupGridDims();
              const coords = await getCellCoordsFromTouchEvent(grid, e);
              if (coords === null) return;
              const { row, column } = coords;
              if (getActive(row, column) !== dragActivating) {
                setActivation(dragActivating, row, column);
              }
            },
            [setupGridDims, dragActivating, setActivation, getActive, dragging]
          )}
          onTouchStart={useCallback(
            async (e: React.TouchEvent<SVGSVGElement>) => {
              const grid = await setupGridDims();
              console.log(grid, width, height);
              const coords = await getCellCoordsFromTouchEvent(grid, e);
              if (coords === null) return;
              const { row, column } = coords;
              const newActive = !getActive(row, column);
              setDragging(true);
              setActivation(newActive, row, column);
              setDragActivating(newActive);
            },
            [
              setupGridDims,
              dragActivating,
              setActivation,
              setDragActivating,
              getActive,
              dragging,
            ]
          )}
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
            {_.flatten(
              cells.map((c) => {
                return c.map((r: CellData) => {
                  const { i: row, j: column } = r;
                  return (
                    <TenorionCell
                      {...r}
                      onDown={(activated) => {
                        setDragActivating(activated);
                        setDragging(true);
                      }}
                      onUp={() => {
                        setDragging(false);
                      }}
                      setActive={(activated) => {
                        setActivation(activated, row, column);
                      }}
                    />
                  );
                });
              })
            )}
          </g>
        </svg>
      </div>
      <div className="divider"></div>
    </>
  );
};

const hasTouch = () => {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
};

export default Tenorion;
