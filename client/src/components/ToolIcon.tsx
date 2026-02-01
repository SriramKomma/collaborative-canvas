import type { ReactNode } from "react";
import type { Tool } from "../types";

const PenIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l7.586 7.586" />
  </svg>
);

const EraserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 20H7L3 16a2 2 0 0 1 0-2.83L13.17 3a2 2 0 0 1 2.83 0L21 7.17a2 2 0 0 1 0 2.83L16 15" />
    <path d="M18 13l-4-4" />
    <path d="M14 17l-4-4" />
  </svg>
);

const RectIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="1" />
  </svg>
);

const CircleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
  </svg>
);

const FillIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 4v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4" />
    <path d="M7 4l5-2 5 2" />
    <path d="M12 6v2" />
    <path d="M10 20l2-4" />
  </svg>
);

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const StarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15 9 22 9 17 14 18 22 12 18 6 22 7 14 2 9 9 9" />
  </svg>
);

const TriangleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4L4 20h16L12 4z" />
  </svg>
);

const TextIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7V4h16v3M9 20h6M12 4v16" />
  </svg>
);

const icons: Record<Tool, ReactNode> = {
  brush: <PenIcon />,
  eraser: <EraserIcon />,
  rect: <RectIcon />,
  circle: <CircleIcon />,
  line: <PenIcon />,
  fill: <FillIcon />,
  arrow: <ArrowIcon />,
  star: <StarIcon />,
  triangle: <TriangleIcon />,
  text: <TextIcon />,
};

const labels: Record<Tool, string> = {
  brush: "Brush",
  eraser: "Eraser",
  rect: "Rectangle",
  circle: "Circle",
  line: "Line",
  fill: "Fill",
  arrow: "Arrow",
  star: "Star",
  triangle: "Triangle",
  text: "Text",
};

export function ToolIcon({
  tool,
  active,
  onClick,
}: {
  tool: Tool;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`tool ${active ? "active" : ""}`}
      onClick={onClick}
      title={labels[tool]}
      aria-label={labels[tool]}
    >
      {icons[tool]}
    </button>
  );
}
