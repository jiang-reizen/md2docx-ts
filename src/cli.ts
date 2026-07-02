#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseMarkdown } from "./parser.js";
import { writeDocx } from "./renderer.js";
import { createDefaultStyle, loadStyleFromFile, type DocxStyle } from "./style.js";

export interface CliOptions {
  input: string;
  output: string;
  style?: string;
  help: boolean;
}

const helpText = `Usage:
  md2docx [input.md] [output.docx]
  md2docx --input input.md --output output.docx --style style.conf

Options:
  -i, --input <path>    Markdown input path
  -o, --output <path>   DOCX output path
  -s, --style <path>    Optional style config path
  -h, --help            Show this help

Defaults:
  input:  sample/complex.md
  output: output/complex.docx
  style:  sample/style.conf if it exists, otherwise built-in defaults`;

export function parseCliArgs(args: string[]): CliOptions {
  const values: Partial<Record<"input" | "output" | "style", string>> = {};
  const seen = new Set<"input" | "output" | "style">();
  const positional: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "-h" || arg === "--help") return { input: "", output: "", help: true };

    const longEquals = /^--(input|output|style)=(.+)$/.exec(arg);
    if (longEquals) {
      setValue(values, seen, longEquals[1] as "input" | "output" | "style", longEquals[2]);
      continue;
    }

    if (arg === "--input" || arg === "--output" || arg === "--style" || arg === "-i" || arg === "-o" || arg === "-s") {
      const key = flagKey(arg);
      const value = args[++index];
      if (!value || value.startsWith("-")) throw new Error(`md2docx cli: missing value for ${arg}`);
      setValue(values, seen, key, value);
      continue;
    }

    if (arg.startsWith("-")) throw new Error(`md2docx cli: unknown option: ${arg}`);
    positional.push(arg);
  }

  if (positional.length > 2) throw new Error("md2docx cli: too many positional arguments");
  if (positional[0]) setValue(values, seen, "input", positional[0]);
  if (positional[1]) setValue(values, seen, "output", positional[1]);

  const input = values.input ?? "sample/complex.md";
  return {
    input,
    output: values.output ?? (values.input && !positional[1] ? replaceExtension(input, ".docx") : "output/complex.docx"),
    style: values.style ?? (existsSync("sample/style.conf") ? "sample/style.conf" : undefined),
    help: false,
  };
}

export async function runCli(args = process.argv.slice(2)): Promise<void> {
  const options = parseCliArgs(args);
  if (options.help) {
    console.log(helpText);
    return;
  }

  const style = loadStyle(options.style);
  const document = parseMarkdown(readFileSync(options.input, "utf8"));
  await writeDocx(document, style, options.output);
  console.log(`created ${options.output}`);
}

function loadStyle(path: string | undefined): DocxStyle {
  return path ? loadStyleFromFile(path) : createDefaultStyle();
}

function setValue(
  values: Partial<Record<"input" | "output" | "style", string>>,
  seen: Set<"input" | "output" | "style">,
  key: "input" | "output" | "style",
  value: string,
): void {
  if (seen.has(key)) throw new Error(`md2docx cli: duplicate ${key}`);
  seen.add(key);
  values[key] = value;
}

function flagKey(flag: string): "input" | "output" | "style" {
  if (flag === "--input" || flag === "-i") return "input";
  if (flag === "--output" || flag === "-o") return "output";
  return "style";
}

function replaceExtension(path: string, extension: string): string {
  const old = extname(path);
  return old ? `${path.slice(0, -old.length)}${extension}` : `${path}${extension}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
