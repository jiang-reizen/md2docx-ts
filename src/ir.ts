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

/**
 * *内部工具*
 *
 * 创建一个空的脚注引用池。引用池负责维护 Markdown 脚注 key 到内部数字 id 的映射，
 * 以及每个脚注 id 对应的定义内容。
 *
 * @returns 空引用池
 */
export function createReferencePool(): ReferencePool {
  return { idsByKey: new Map(), definitions: [], nextId: 0 };
}

/**
 * *内部工具*
 *
 * 创建一个空文档 IR。parser 会以这个对象为起点，逐步填充 blocks 和脚注引用池。
 *
 * @returns 空文档 IR
 */
export function createEmptyDocument(): Document {
  return { blocks: [], referencePool: createReferencePool() };
}

/**
 * *内部工具*
 *
 * 获取脚注 key 对应的内部 id；如果 key 首次出现，则分配一个从 0 开始递增的新 id。
 * 这个 id 只用于内部关联正文引用和脚注定义，不等同于 Word 最终显示的脚注编号。
 *
 * @param pool 脚注引用池
 * @param key Markdown 脚注 key
 * @returns 内部脚注 id
 */
export function getOrCreateReferenceId(pool: ReferencePool, key: string): number {
  const known = pool.idsByKey.get(key);
  if (known !== undefined) return known;

  const id = pool.nextId++;
  pool.idsByKey.set(key, id);
  pool.definitions[id] = undefined;
  return id;
}

/**
 * *内部工具*
 *
 * 写入一个脚注定义。如果同一个 key 已经写入过定义，会抛出错误以保持 Markdown
 * 脚注定义唯一。
 *
 * @param pool 脚注引用池
 * @param key Markdown 脚注 key
 * @param content 脚注定义对应的行内 IR
 * @returns 该 key 对应的内部脚注 id
 */
export function defineReference(pool: ReferencePool, key: string, content: InlineNodes): number {
  const id = getOrCreateReferenceId(pool, key);
  if (pool.definitions[id] !== undefined) {
    throw new Error(`md2docx parser: duplicate footnote definition: ${key}`);
  }
  pool.definitions[id] = content;
  return id;
}
