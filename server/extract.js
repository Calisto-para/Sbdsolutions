import zlib from "node:zlib";

/* Text extraction for the knowledge base. PDFs are read with pdf-parse; DOCX
   files are unzipped and their document.xml is stripped of markup; TXT files
   are read as they are. Nothing is stored until readable text was found, so a
   scanned PDF can never look like an empty, "saved" document. */

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const EXTENSIONS = [
  { kind: "pdf", pattern: /\.pdf$/i, mime: "application/pdf" },
  { kind: "docx", pattern: /\.docx$/i, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { kind: "txt", pattern: /\.(txt|text|md|csv)$/i, mime: "text/plain" },
];

export function documentKind(filename = "", mimetype = "") {
  const name = String(filename || "");
  const type = String(mimetype || "").toLowerCase();
  const byName = EXTENSIONS.find((entry) => entry.pattern.test(name));
  if (byName) return byName.kind;
  if (type === "application/pdf") return "pdf";
  if (type.includes("wordprocessingml")) return "docx";
  if (type.startsWith("text/")) return "txt";
  return "";
}

export function isSupportedDocument(filename, mimetype) {
  return Boolean(documentKind(filename, mimetype));
}

function tidy(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    /* pdf-parse marks pages with "-- 1 of 1 --"; those markers are noise. */
    .split("\n")
    .filter((line) => !/^--?\s*\d+\s*(?:of|\/)\s*\d+\s*--?$/.test(line.trim()))
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function pdfText(buffer) {
  const pdfModule = await import("pdf-parse");
  if (pdfModule.PDFParse) {
    const parser = new pdfModule.PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result.text || "";
    } finally {
      await parser.destroy?.();
    }
  }
  const parse = pdfModule.default || pdfModule;
  const result = await parse(buffer);
  return result.text || "";
}

/* DOCX is a ZIP archive. Read the central directory, inflate the one entry we
   need, then turn the WordprocessingML into plain text. */
function readZipEntry(buffer, wanted) {
  let endOfCentralDirectory = -1;
  const stop = Math.max(0, buffer.length - 22 - 65535);
  for (let i = buffer.length - 22; i >= stop; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      endOfCentralDirectory = i;
      break;
    }
  }
  if (endOfCentralDirectory < 0) throw new Error("not a zip archive");

  const entries = buffer.readUInt16LE(endOfCentralDirectory + 10);
  let offset = buffer.readUInt32LE(endOfCentralDirectory + 16);

  for (let index = 0; index < entries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    if (name === wanted) {
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const data = buffer.subarray(start, start + compressedSize);
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data);
      throw new Error("unsupported zip compression");
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("document.xml was not found in the DOCX file");
}

function docxText(buffer) {
  const xml = readZipEntry(buffer, "word/document.xml").toString("utf8");
  return xml
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tr[^>]*>/g, "")
    .replace(/<\/w:tc>/g, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\|/g, "|");
}

/* Returns the readable text of an uploaded file, or throws an error carrying a
   code the route turns into a clear message for the customer. */
export async function extractDocument(buffer, filename, mimetype) {
  const kind = documentKind(filename, mimetype);
  if (!kind) {
    const error = new Error("Only PDF, DOCX and TXT files can be uploaded.");
    error.code = "UNSUPPORTED_DOCUMENT";
    throw error;
  }

  let raw = "";
  try {
    if (kind === "pdf") raw = await pdfText(buffer);
    else if (kind === "docx") raw = docxText(buffer);
    else raw = buffer.toString("utf8");
  } catch (error) {
    const locked = /password|encrypt/i.test(error.message || "");
    const wrapped = new Error(
      locked
        ? "That PDF is password-protected, so its text cannot be read. Remove the password and upload it again."
        : `That ${kind.toUpperCase()} file could not be read. It may be damaged or in an unusual format — try exporting it again, or paste the information in manually.`
    );
    wrapped.code = locked ? "DOCUMENT_LOCKED" : "DOCUMENT_UNREADABLE";
    wrapped.cause = error;
    throw wrapped;
  }

  const text = tidy(raw);
  const visibleCharacters = text.replace(/\s/g, "").length;
  if (visibleCharacters < 8) {
    const error = new Error(
      kind === "pdf"
        ? "This PDF has no text layer — it is a scan or a photo, so there is nothing to learn from. Export it as a text PDF, or type the information under Business information instead."
        : "There is not enough readable text in that file. Add the information manually instead."
    );
    error.code = "DOCUMENT_NO_TEXT";
    throw error;
  }

  return { kind, text };
}

/* Break a document into passages so retrieval can hand the assistant only the
   parts that answer the visitor's question, instead of truncating the file. */
export function chunkDocument(text, { size = 1400 } = {}) {
  const clean = tidy(text);
  if (!clean) return [];
  const paragraphs = clean.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks = [];
  let current = "";

  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > size) {
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if ((current + " " + sentence).trim().length > size) {
          push();
          current = sentence.length > size ? sentence.slice(0, size) : sentence;
        } else {
          current = current ? `${current} ${sentence}` : sentence;
        }
      }
      continue;
    }
    if (current && current.length + paragraph.length + 1 > size) push();
    current = current ? `${current}\n${paragraph}` : paragraph;
  }
  push();

  return chunks.map((chunk, index) => ({ index, text: chunk }));
}

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "our", "with", "have", "has", "had",
  "was", "were", "this", "that", "these", "those", "from", "what", "when", "where", "which", "who",
  "why", "how", "can", "could", "would", "should", "does", "did", "about", "there", "their", "them",
  "will", "shall", "may", "might", "must", "any", "all", "some", "into", "than", "then", "also",
  "please", "tell", "give", "much", "many", "cost", "costs", "price", "prices", "want", "need",
  "hello", "hi", "hey", "thanks", "thank", "know", "like", "get", "got", "make", "made",
]);

function questionTerms(question) {
  const words = String(question || "")
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9'$€£%-]{1,}/g) || [];
  return [...new Set(words.map((word) => word.replace(/[-']+$/, "")).filter((word) => word.length > 2 && !STOPWORDS.has(word)))];
}

/* Score passages by how many of the question's terms they contain and keep the
   best ones within a character budget. With no question, the document is taken
   in its original order. */
export function rankChunks(chunks, question, budget = 12000, limit = 10) {
  if (!chunks.length) return [];
  const terms = questionTerms(question);

  if (!terms.length) {
    const picked = [];
    let used = 0;
    for (const chunk of chunks) {
      if (used + chunk.text.length > budget) break;
      picked.push(chunk);
      used += chunk.text.length;
      if (picked.length >= limit) break;
    }
    return picked;
  }

  const scored = chunks.map((chunk) => {
    const haystack = chunk.text.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (haystack.includes(term)) score += term.length > 5 ? 2 : 1;
    }
    /* A passage that names a currency amount is more likely to answer a price
       question than one that merely repeats the word "price". */
    if (/([$€£]|\bngn\b|\busd\b|\bgbp\b)\s?\d/.test(haystack)) score += 1;
    return { ...chunk, score };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const picked = [];
  let used = 0;
  for (const chunk of scored) {
    if (picked.length && chunk.score === 0) break;
    if (used + chunk.text.length > budget) continue;
    picked.push(chunk);
    used += chunk.text.length;
    if (picked.length >= limit) break;
  }
  if (!picked.length) picked.push(scored[0]);
  return picked.sort((a, b) => a.index - b.index);
}
