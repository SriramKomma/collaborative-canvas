export type Tool =
  | "brush"
  | "eraser"
  | "line"
  | "rect"
  | "circle"
  | "fill"
  | "arrow"
  | "star"
  | "triangle"
  | "text";

export interface Point {
  x: number;
  y: number;
}

export interface DrawAction {
  id: string;
  userId: string;
  tool: Tool;
  color: string;
  width: number;
  points: Point[];
  /** For text tool: the string to draw. */
  text?: string;
}

export interface User {
  id: string;
  username: string;
  color: string;
  cursor?: Point;
  isDrawing?: boolean;
}
