export { parseMarkdown } from "./parser.js";
export { buildDocx, writeDocx } from "./renderer.js";
export { createDefaultStyle, createStyleFile, loadStyleFromFile, serializeStyle, setStyleValue } from "./style.js";
export type { DocxStyle } from "./style.js";
export type {
  Block,
  Document,
  HeadingLevel,
  Inline,
  ListKind,
  ReferencePool,
  Text,
} from "./ir.js";
