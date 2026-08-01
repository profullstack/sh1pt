const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (entity, code: string) => decodeCodePoint(entity, code, 10))
    .replace(/&#x([0-9a-f]+);/gi, (entity, code: string) => decodeCodePoint(entity, code, 16))
    .replace(/&([a-z]+);/gi, (entity, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? entity);
}

function decodeCodePoint(entity: string, value: string, radix: number): string {
  const codePoint = Number.parseInt(value, radix);
  if (!Number.isSafeInteger(codePoint) || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return entity;
  }
  return String.fromCodePoint(codePoint);
}
