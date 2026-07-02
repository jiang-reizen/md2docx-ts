export type TextLanguage = "Chinese" | "English" | "Auto";

export interface Text {
  kind: "Text";
  content: string;
  bold: boolean;
  italic: boolean;
  language: TextLanguage;
}

export interface Reference {
  kind: "Reference";
  id: number;
}

export type Inline = Text | Reference;
export type InlineNodes = Inline[];

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface Heading {
  kind: "Heading";
  level: HeadingLevel;
  content: InlineNodes;
}

export interface Paragraph {
  kind: "Paragraph";
  content: InlineNodes;
}

export type ListKind = "Ordered" | "Unordered";

export interface ListItem {
  content: Block[];
}

export interface List {
  kind: "List";
  listKind: ListKind;
  items: ListItem[];
}

export type Block = Heading | Paragraph | List;

export interface ReferencePool {
  idsByKey: Map<string, number>;
  definitions: Array<InlineNodes | undefined>;
  nextId: number;
}

export interface Document {
  blocks: Block[];
  referencePool: ReferencePool;
}

export function createReferencePool(): ReferencePool {
  return { idsByKey: new Map(), definitions: [], nextId: 0 };
}

export function createEmptyDocument(): Document {
  return { blocks: [], referencePool: createReferencePool() };
}

export function getOrCreateReferenceId(pool: ReferencePool, key: string): number {
  const known = pool.idsByKey.get(key);
  if (known !== undefined) return known;

  const id = pool.nextId++;
  pool.idsByKey.set(key, id);
  pool.definitions[id] = undefined;
  return id;
}

export function defineReference(pool: ReferencePool, key: string, content: InlineNodes): number {
  const id = getOrCreateReferenceId(pool, key);
  if (pool.definitions[id] !== undefined) {
    throw new Error(`md2docx parser: duplicate footnote definition: ${key}`);
  }
  pool.definitions[id] = content;
  return id;
}
