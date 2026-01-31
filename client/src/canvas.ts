import type { DrawAction, User } from "./types";

export type Theme = "dark" | "light";

const THEME_COLORS: Record<
  Theme,
  { bg: string; grid: string; cursorLabel: string; cursorLabelStroke: string }
> = {
  dark: {
    bg: "#2d2d2d",
    grid: "rgba(255,255,255,0.04)",
    cursorLabel: "#e0e0e0",
    cursorLabelStroke: "#1a1a1a",
  },
  light: {
    bg: "#f5f5f5",
    grid: "rgba(0,0,0,0.06)",
    cursorLabel: "#1a1a1a",
    cursorLabelStroke: "#ffffff",
  },
};

export class CanvasManager {
  main: CanvasRenderingContext2D;
  temp: CanvasRenderingContext2D;
  w: number;
  h: number;
  private theme: Theme;
  private bg: string;
  private grid: string;
  private cursorLabel: string;
  private cursorLabelStroke: string;

  constructor(
    mainCanvas: HTMLCanvasElement,
    tempCanvas: HTMLCanvasElement,
    w = window.innerWidth,
    h = window.innerHeight,
    theme: Theme = "dark",
  ) {
    this.main = mainCanvas.getContext("2d")!;
    this.temp = tempCanvas.getContext("2d")!;
    this.w = w;
    this.h = h;
    this.theme = theme;
    const c = THEME_COLORS[theme];
    this.bg = c.bg;
    this.grid = c.grid;
    this.cursorLabel = c.cursorLabel;
    this.cursorLabelStroke = c.cursorLabelStroke;

    [mainCanvas, tempCanvas].forEach((c) => {
      c.width = this.w;
      c.height = this.h;
    });

    this.main.fillStyle = this.bg;
    this.main.fillRect(0, 0, this.w, this.h);
    this.drawGrid(this.main, 24, this.grid);

    this.main.lineCap = this.temp.lineCap = "round";
    this.main.lineJoin = this.temp.lineJoin = "round";
  }

  /** Set theme and redraw background/grid; caller should call drawHistory(history) after. */
  setTheme(theme: Theme) {
    if (this.theme === theme) return;
    this.theme = theme;
    const c = THEME_COLORS[theme];
    this.bg = c.bg;
    this.grid = c.grid;
    this.cursorLabel = c.cursorLabel;
    this.cursorLabelStroke = c.cursorLabelStroke;
  }

  /** Resize canvas to match container; call drawHistory(history) after. */
  resize(w: number, h: number) {
    if (w <= 0 || h <= 0) return;
    this.w = w;
    this.h = h;
    const mainCanvas = this.main.canvas as HTMLCanvasElement;
    const tempCanvas = this.temp.canvas as HTMLCanvasElement;
    [mainCanvas, tempCanvas].forEach((c) => {
      c.width = this.w;
      c.height = this.h;
    });
    this.main.lineCap = this.temp.lineCap = "round";
    this.main.lineJoin = this.temp.lineJoin = "round";
    this.main.fillStyle = this.bg;
    this.main.fillRect(0, 0, this.w, this.h);
    this.drawGrid(this.main, 24, this.grid);
  }

  private drawGrid(ctx: CanvasRenderingContext2D, step: number, stroke: string) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    for (let x = 0; x <= this.w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.h);
      ctx.stroke();
    }
    for (let y = 0; y <= this.h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.w, y);
      ctx.stroke();
    }
  }

  clearTemp() {
    this.temp.clearRect(0, 0, this.w, this.h);
  }

  clearAll() {
    this.main.clearRect(0, 0, this.w, this.h);
    this.temp.clearRect(0, 0, this.w, this.h);
  }

  // ---------- MASTER DRAW ----------
  drawAction(ctx: CanvasRenderingContext2D, a: DrawAction) {
    ctx.save();

    if (a.tool === "eraser") {
      const isTemp = ctx === this.temp;
      if (isTemp) {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = this.bg;
      } else {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      }
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = a.color;
    }

    ctx.lineWidth = a.width;

    switch (a.tool) {
      case "brush":
      case "eraser":
        this.drawBrush(ctx, a);
        break;

      case "line":
        this.drawLine(ctx, a);
        break;

      case "rect":
        this.drawRect(ctx, a, false);
        break;

      case "circle":
        this.drawCircle(ctx, a);
        break;

      case "fill":
        if (a.points.length > 0) {
          this.doFloodFill(ctx, Math.floor(a.points[0].x), Math.floor(a.points[0].y), a.color);
        }
        break;

      case "arrow":
        this.drawArrow(ctx, a);
        break;

      case "star":
        this.drawStar(ctx, a);
        break;

      case "triangle":
        this.drawTriangle(ctx, a);
        break;

      case "text":
        if (a.points.length > 0 && a.text) {
          ctx.fillStyle = a.color;
          ctx.font = `${Math.max(12, a.width * 4)}px system-ui, sans-serif`;
          ctx.fillText(a.text, a.points[0].x, a.points[0].y);
        }
        break;

      case "image":
        if (a.points.length > 0 && a.imageData) {
          this.drawImageAction(ctx, a);
        }
        break;
    }

    ctx.restore();
  }

  private drawArrow(ctx: CanvasRenderingContext2D, a: DrawAction) {
    if (a.points.length < 2) return;
    const [p1, p2] = a.points;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const headLen = Math.min(15, len * 0.3);
    const ax = p2.x - ux * headLen + uy * headLen * 0.4;
    const ay = p2.y - uy * headLen - ux * headLen * 0.4;
    const bx = p2.x - ux * headLen - uy * headLen * 0.4;
    const by = p2.y - uy * headLen + ux * headLen * 0.4;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.moveTo(ax, ay);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  private drawStar(ctx: CanvasRenderingContext2D, a: DrawAction) {
    if (a.points.length < 2) return;
    const [p1, p2] = a.points;
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const outer = Math.hypot(p2.x - cx, p2.y - cy) || 1;
    const inner = outer * 0.4;
    const rays = 5;
    ctx.beginPath();
    for (let i = 0; i < rays * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const angle = (Math.PI * 2 * i) / (rays * 2) - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  private drawTriangle(ctx: CanvasRenderingContext2D, a: DrawAction) {
    if (a.points.length < 2) return;
    const [p1, p2] = a.points;
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const w = Math.abs(p2.x - p1.x) || 20;
    const h = Math.abs(p2.y - p1.y) || 20;
    ctx.beginPath();
    ctx.moveTo(cx, cy - h / 2);
    ctx.lineTo(cx - w / 2, cy + h / 2);
    ctx.lineTo(cx + w / 2, cy + h / 2);
    ctx.closePath();
    ctx.stroke();
  }

  private imageCache = new Map<string, HTMLImageElement>();
  onImageLoaded?: () => void;

  private drawImageAction(ctx: CanvasRenderingContext2D, a: DrawAction) {
    if (!a.imageData || a.points.length === 0) return;
    const cached = this.imageCache.get(a.imageData);
    const p = a.points[0];
    const size = Math.max(50, a.width * 25);
    if (cached && cached.complete && cached.naturalWidth > 0) {
      const w = size;
      const h = size * (cached.naturalHeight / cached.naturalWidth);
      ctx.drawImage(cached, p.x, p.y, w, h);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      this.imageCache.set(a.imageData!, img);
      this.onImageLoaded?.();
    };
    img.src = a.imageData;
  }

  /** Parse hex color "#rrggbb" or "#rgb" to [r, g, b]. */
  private hexToRgb(hex: string): [number, number, number] {
    const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
      ?? hex.match(/^#?([a-f\d])([a-f\d])([a-f\d])$/i);
    if (!match) return [0, 0, 0];
    const u = match[1].length === 1 ? 17 : 1; // #f00 -> 0xff, #ff0000 -> 0xff
    return [
      parseInt(match[1], 16) * u,
      parseInt(match[2], 16) * u,
      parseInt(match[3], 16) * u,
    ];
  }

  /** Flood fill from (x, y) replacing same-color pixels with fillColor (hex). */
  private doFloodFill(ctx: CanvasRenderingContext2D, x: number, y: number, fillColorHex: string) {
    const w = this.w;
    const h = this.h;
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const idx = (y * w + x) * 4;
    const targetR = data[idx];
    const targetG = data[idx + 1];
    const targetB = data[idx + 2];
    const targetA = data[idx + 3];
    const [fillR, fillG, fillB] = this.hexToRgb(fillColorHex);
    const fillA = 255;
    if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) return;
    const stack: [number, number][] = [[x, y]];
    const visited = new Uint8Array(w * h);
    const tolerance = 32;
    const match = (i: number) =>
      Math.abs(data[i] - targetR) <= tolerance &&
      Math.abs(data[i + 1] - targetG) <= tolerance &&
      Math.abs(data[i + 2] - targetB) <= tolerance &&
      Math.abs(data[i + 3] - targetA) <= tolerance;
    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!;
      if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
      const i = (cy * w + cx) * 4;
      if (visited[cy * w + cx] || !match(i)) continue;
      visited[cy * w + cx] = 1;
      data[i] = fillR;
      data[i + 1] = fillG;
      data[i + 2] = fillB;
      data[i + 3] = fillA;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    ctx.putImageData(imageData, 0, 0);
  }

  /** Apply fill on main canvas at (x, y) with color. Call drawHistory(history) after. */
  applyFill(x: number, y: number, color: string) {
    this.doFloodFill(this.main, Math.floor(x), Math.floor(y), color);
  }

  // ---------- TOOLS ----------
  /** Smooth continuous path: quadraticCurveTo through points (no jagged lines). */
  private drawBrush(ctx: CanvasRenderingContext2D, a: DrawAction) {
    if (a.points.length < 2) return;
    const pts = a.points;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      ctx.quadraticCurveTo(prev.x, prev.y, curr.x, curr.y);
    }
    ctx.stroke();
  }

  private drawLine(ctx: CanvasRenderingContext2D, a: DrawAction) {
    if (a.points.length < 2) return;
    const [p1, p2] = a.points;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  private drawRect(
    ctx: CanvasRenderingContext2D,
    a: DrawAction,
    square: boolean,
  ) {
    if (a.points.length < 2) return;
    const [p1, p2] = a.points;

    let w = p2.x - p1.x;
    let h = p2.y - p1.y;

    if (square) {
      const size = Math.min(Math.abs(w), Math.abs(h));
      w = Math.sign(w) * size;
      h = Math.sign(h) * size;
    }

    ctx.strokeRect(p1.x, p1.y, w, h);
  }

  private drawCircle(ctx: CanvasRenderingContext2D, a: DrawAction) {
    if (a.points.length < 2) return;
    const [p1, p2] = a.points;

    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const r = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ---------- PUBLIC ----------
  drawHistory(history: DrawAction[]) {
    this.main.clearRect(0, 0, this.w, this.h);
    this.main.fillStyle = this.bg;
    this.main.fillRect(0, 0, this.w, this.h);
    this.drawGrid(this.main, 24, this.grid);
    history.forEach((a) => this.drawAction(this.main, a));
  }

  drawActive(active: Map<string, DrawAction>) {
    this.clearTemp();
    active.forEach((a) => this.drawAction(this.temp, a));
  }

  drawCursors(users: User[]) {
    users.forEach((u) => {
      if (!u.cursor) return;
      // Cursor dot
      this.temp.fillStyle = u.color;
      this.temp.beginPath();
      this.temp.arc(u.cursor.x, u.cursor.y, 5, 0, Math.PI * 2);
      this.temp.fill();

      // Drawing indicator ring
      if (u.isDrawing) {
        this.temp.strokeStyle = u.color;
        this.temp.lineWidth = 2;
        this.temp.beginPath();
        this.temp.arc(u.cursor.x, u.cursor.y, 9, 0, Math.PI * 2);
        this.temp.stroke();
      }

      // Username label
      this.temp.font = "12px system-ui";
      this.temp.fillStyle = this.cursorLabel;
      this.temp.strokeStyle = this.cursorLabelStroke;
      this.temp.lineWidth = 3;
      this.temp.strokeText(u.username, u.cursor.x + 12, u.cursor.y - 12);
      this.temp.fillText(u.username, u.cursor.x + 12, u.cursor.y - 12);
    });
  }
}
