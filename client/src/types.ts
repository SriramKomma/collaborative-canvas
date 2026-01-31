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
  | "text"
  | "image";

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
  /** For image tool: data URL (e.g. image/png base64). */
  imageData?: string;
}

export interface User {
  id: string;
  username: string;
  color: string;
  cursor?: Point;
  isDrawing?: boolean;
}
