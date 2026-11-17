// From ascii.rest by bas3line, MIT licensed. See vendor/ascii-source/LICENSE.
export function cellWidth(code) {
    return code >= 0x1100 && (code <= 0x115f || code === 0x2329 || code === 0x232a || code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f || code >= 0xac00 && code <= 0xd7a3 || code >= 0xf900 && code <= 0xfaff || code >= 0xfe10 && code <= 0xfe19 || code >= 0xfe30 && code <= 0xfe6f || code >= 0xff00 && code <= 0xff60 || code >= 0xffe0 && code <= 0xffe6) ? 2 : 1;
}
