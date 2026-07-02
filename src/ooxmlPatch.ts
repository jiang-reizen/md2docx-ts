import JSZip from "jszip";

export async function patchFootnotesXml(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file("word/footnotes.xml");
  if (!file) return buffer;

  const xml = await file.async("string");
  const patched = patchFootnotesXmlText(xml);
  if (patched === xml) return buffer;

  zip.file("word/footnotes.xml", patched);
  return zip.generateAsync({ type: "nodebuffer" });
}

export async function patchDocxXml(buffer: Buffer): Promise<Buffer> {
  const footnotePatched = await patchFootnotesXml(buffer);
  return patchNumberingIds(footnotePatched);
}

export async function patchNumberingIds(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const numberingFile = zip.file("word/numbering.xml");
  const documentFile = zip.file("word/document.xml");
  if (!numberingFile || !documentFile) return buffer;

  const numberingXml = await numberingFile.async("string");
  const abstractIds = [...numberingXml.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"/g)]
    .map((match) => Number(match[1]))
    .filter((id) => id > 1);
  if (abstractIds.length === 0) return buffer;

  const abstractMap = new Map<number, number>();
  abstractIds.forEach((id, index) => abstractMap.set(id, 10 + index));

  const numMap = new Map<number, number>();
  for (const match of numberingXml.matchAll(/<w:num\b[^>]*w:numId="(\d+)">[\s\S]*?<w:abstractNumId w:val="(\d+)"/g)) {
    const numId = Number(match[1]);
    const abstractId = Number(match[2]);
    if (abstractMap.has(abstractId)) numMap.set(numId, 20 + numMap.size);
  }

  let patchedNumbering = numberingXml
    .replace(/w:abstractNumId="(\d+)"/g, (whole, id: string) => {
      const next = abstractMap.get(Number(id));
      return next === undefined ? whole : `w:abstractNumId="${next}"`;
    })
    .replace(/<w:abstractNumId w:val="(\d+)"\/>/g, (whole, id: string) => {
      const next = abstractMap.get(Number(id));
      return next === undefined ? whole : `<w:abstractNumId w:val="${next}"/>`;
    })
    .replace(/w:numId="(\d+)"/g, (whole, id: string) => {
      const next = numMap.get(Number(id));
      return next === undefined ? whole : `w:numId="${next}"`;
    });

  const documentXml = await documentFile.async("string");
  const patchedDocument = documentXml.replace(/<w:numId w:val="(\d+)"\/>/g, (whole, id: string) => {
    const next = numMap.get(Number(id));
    return next === undefined ? whole : `<w:numId w:val="${next}"/>`;
  });

  if (patchedNumbering === numberingXml && patchedDocument === documentXml) return buffer;
  zip.file("word/numbering.xml", patchedNumbering);
  zip.file("word/document.xml", patchedDocument);
  return zip.generateAsync({ type: "nodebuffer" });
}

export function patchFootnotesXmlText(xml: string): string {
  return xml.replace(/<w:footnote\b([^>]*)>([\s\S]*?)<\/w:footnote>/g, (whole, attrs: string, body: string) => {
    const id = Number(/w:id="(-?\d+)"/.exec(attrs)?.[1]);
    if (!Number.isFinite(id) || id <= 0) return whole;

    const run = /<w:r\b[\s\S]*?<\/w:r>/.exec(body);
    if (!run || run[0].includes("<w:footnoteRef")) return whole;

    const text = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/.exec(run[0])?.[1] ?? "";
    const isMarker = text === String(id) || text === `${id} `;
    if (!isMarker || !/<w:vertAlign\b[^>]*w:val="superscript"/.test(run[0])) return whole;

    const marker =
      '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>' +
      '<w:r><w:t xml:space="preserve"> </w:t></w:r>';
    return `<w:footnote${attrs}>${body.slice(0, run.index)}${marker}${body.slice(run.index + run[0].length)}</w:footnote>`;
  });
}
