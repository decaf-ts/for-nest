export function genStr(len: number): string {
  return Math.floor(Math.random() * 1e14)
    .toString()
    .slice(0, len)
    .padStart(len, "1");
}
