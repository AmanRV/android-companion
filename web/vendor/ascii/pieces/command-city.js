// From ascii.rest by bas3line, MIT licensed. See vendor/ascii-source/LICENSE.
export const meta = {
    name: "command city",
    category: "scenes",
    note: "a night city whose boulevards trace the command key in streetlight",
    cols: 200,
    rows: 100,
    cell: 1,
    fps: 15,
    ground: "#060607",
    palette: [
        "#101012",
        "#17171a",
        "#1f1f23",
        "#29292e",
        "#34343a",
        "#414148",
        "#505058",
        "#62626a",
        "#76767e",
        "#8c8c93",
        "#a4a4aa",
        "#bdbdc2",
        "#d6d6da",
        "#ececef",
        "#ffffff",
        "#3a2a1c",
        "#5a3c20",
        "#7e5224",
        "#a86a2a",
        "#cf8433",
        "#ee9e45",
        "#ffb860",
        "#ffcf88",
        "#ffe4b4",
        "#fff3dc",
        "#c9d3e6",
        "#8d99b0",
        "#ff7a3a",
        "#c0522a"
    ]
};
const W = 200, H = 100;
const DOTS = " ·•●";
const COVER = [
    0,
    0.3,
    0.6,
    1
];
const BAYER = [
    0,
    8,
    2,
    10,
    12,
    4,
    14,
    6,
    3,
    11,
    1,
    9,
    15,
    7,
    13,
    5
].map((v)=>v / 16 - 0.47);
const YH = -260, YM = 50, TILT = 1.5, VOFF = 6;
const CX = 100;
const LS = 1.9;
const DMAX = 9;
const INK = String.raw`

          00000000000000000000000000000000000000000000
      000000000000000000000000000000000000000000000000000
     000000000000000000000000000000000000000000000000000000
    00000000000000000000000000000000000000000000000000000000
   0000000000000000000000000000000000000000000000000000000000
  000000000000000000000000000000000000000000000000000000000000
  0000000000000000      0000000000000000      0000000000000000
  0000000000000    000    000000000000    000    0000000000000
  000000000000   0000000   0000000000   0000000   000000000000
  000000000000   0000000   000000000    0000000   000000000000
  0000000000000   000000   000000000    000000   0000000000000
  00000000000000                                00000000000000
  0000000000000000000000    00000000    0000000000000000000000
  0000000000000000000000   000000000    0000000000000000000000
  0000000000000000000000   000000000    0000000000000000000000
  0000000000000000000000   000000000    0000000000000000000000
  0000000000000000000000   000000000    0000000000000000000000
  000000000000000000                        000000000000000000
  00000000000000                                00000000000000
  000000000000    000000   000000000    000000   0000000000000
  000000000000   0000000   0000000000   0000000   000000000000
  000000000000    000000   0000000000   000000    000000000000
  0000000000000     00    000000000000    00    00000000000000
  0000000000000000     000000000000000000     0000000000000000
  00000000000000000000000000000000000000000000000000000000000
   0000000000000000000000000000000000000000000000000000000000
    00000000000000000000000000000000000000000000000000000000
     000000000000000000000000000000000000000000000000000000
       00000000000000000000000000000000000000000000000000
          00000000000000000000000000000000000000000000

`;
const LC = 64, LR = 32;
function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function noise(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    let x0 = xi, x1 = xi + 1;
    if (period) {
        x0 = (xi % period + period) % period;
        x1 = (x0 + 1) % period;
    }
    const a = hash(x0, yi), b = hash(x1, yi), c = hash(x0, yi + 1), d = hash(x1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, octaves, period) {
    let s = 0, n = 0, amp = 0.5, f = 1;
    for(let i = 0; i < octaves; i++){
        s += amp * noise(x * f, y * f, period * f);
        n += amp;
        amp *= 0.5;
        f *= 2;
    }
    return s / n;
}
const clamp = (v)=>v < 0 ? 0 : v > 1 ? 1 : v;
const smooth = (a, b, v)=>{
    const k = clamp((v - a) / (b - a));
    return k * k * (3 - 2 * k);
};
const hex = (s)=>[
        1,
        3,
        5
    ].map((i)=>parseInt(s.slice(i, i + 2), 16) / 255);
const scaleAt = (y)=>(y - YH) / (YM - YH);
const groundV = (y)=>TILT * (YM - YH) * (1 - (YM - YH) / (y - YH)) + VOFF;
export default function commandCity() {
    const P = meta.palette.map(hex);
    const N = W * H;
    const out = new Array(N);
    const lut = new Uint8Array(32768).fill(255);
    const nearest = (r, g, b)=>{
        const k = Math.min(31, r * 31.99 | 0) << 10 | Math.min(31, g * 31.99 | 0) << 5 | Math.min(31, b * 31.99 | 0);
        if (lut[k] !== 255) return lut[k];
        let best = 0, bd = 1e9;
        for(let i = 0; i < P.length; i++){
            const dr = P[i][0] - r, dg = P[i][1] - g, db = P[i][2] - b;
            const d = 0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db;
            if (d < bd) bd = d, best = i;
        }
        return lut[k] = best;
    };
    const grid = INK.slice(1, -1).split("\n").map((line)=>line.padEnd(LC));
    const ink = new Float32Array(LC * LR);
    const fill = new Float32Array(LC * LR);
    for(let r = 0; r < LR; r++){
        const line = grid[r] || "";
        const a = line.search(/\S/), b = line.trimEnd().length - 1;
        for(let c = 0; c < LC; c++){
            ink[r * LC + c] = line[c] && line[c] !== " " ? 1 : 0;
            fill[r * LC + c] = a >= 0 && c >= a && c <= b ? 1 : 0;
        }
    }
    const comp = new Int32Array(LC * LR).fill(-1);
    const parts = [];
    for(let s = 0; s < LC * LR; s++){
        if (!ink[s] || comp[s] >= 0) continue;
        const id = parts.length, part = {
            n: 0,
            c: 0,
            r: 0
        };
        const stack = [
            s
        ];
        comp[s] = id;
        while(stack.length){
            const q = stack.pop();
            const qc = q % LC, qr = q / LC | 0;
            part.n++, part.c += qc + 0.5, part.r += qr + 0.5;
            for (const [dc, dr] of [
                [
                    1,
                    0
                ],
                [
                    -1,
                    0
                ],
                [
                    0,
                    1
                ],
                [
                    0,
                    -1
                ]
            ]){
                const nc = qc + dc, nr = qr + dr;
                if (nc < 0 || nr < 0 || nc >= LC || nr >= LR) continue;
                const o = nr * LC + nc;
                if (ink[o] && comp[o] < 0) comp[o] = id, stack.push(o);
            }
        }
        part.c /= part.n, part.r /= part.n;
        parts.push(part);
    }
    parts.sort((a, b)=>b.n - a.n);
    const mid = parts[1];
    const LCX = mid.c, LCY = mid.r;
    const gx = (c)=>(c - LCX) * LS;
    const gy = (r)=>(r - LCY) * 2 * LS;
    const dots = parts.slice(2, 6).map((p)=>[
            gx(p.c),
            gy(p.r)
        ]);
    const sample = (g, u, v)=>{
        const c = u / LS + LCX - 0.5, r = v / (2 * LS) + LCY - 0.5;
        const ci = Math.floor(c), ri = Math.floor(r), fc = c - ci, fr = r - ri;
        const at = (cc, rr)=>cc < 0 || rr < 0 || cc >= LC || rr >= LR ? 0 : g[rr * LC + cc];
        const a = at(ci, ri), b = at(ci + 1, ri), cc = at(ci, ri + 1), d = at(ci + 1, ri + 1);
        return a + (b - a) * fc + (cc - a) * fr + (a - b - cc + d) * fc * fr;
    };
    const keyAt = (u, v)=>smooth(0.3, 0.7, sample(fill, u, v)) * (1 - smooth(0.3, 0.7, sample(ink, u, v)));
    const squareAt = (u, v)=>smooth(0.3, 0.7, sample(fill, u, v));
    let rsum = 0, rn = 0;
    for (const [du, dv] of dots){
        for (const dir of [
            -1,
            1
        ]){
            let a = -1, b = -1;
            for(let s = 0; s < 30; s += 0.1){
                const k = keyAt(du + dir * s, dv);
                if (k > 0.5 && a < 0) a = s;
                if (a >= 0 && k <= 0.5) {
                    b = s;
                    break;
                }
            }
            if (a >= 0 && b > a) rsum += (a + b) / 2, rn++;
        }
    }
    const RMID = rsum / rn;
    const left = Math.min(...dots.map((d)=>d[0])), right = Math.max(...dots.map((d)=>d[0]));
    const top = Math.min(...dots.map((d)=>d[1])), bottom = Math.max(...dots.map((d)=>d[1]));
    const barX = [
        left + RMID,
        right - RMID
    ], barY = [
        top + RMID,
        bottom - RMID
    ];
    const route = (u, v)=>{
        let bi = 0, bd = 1e9;
        for(let i = 0; i < 4; i++){
            const d = Math.hypot(u - dots[i][0], v - dots[i][1]);
            if (d < bd) bd = d, bi = i;
        }
        const [du, dv] = dots[bi];
        const inward = Math.sign(-du) === Math.sign(u - du) && Math.sign(-dv) === Math.sign(v - dv);
        if (!inward && bd < RMID * 1.9) return [
            Math.atan2(v - dv, u - du) * RMID + bi * 97,
            bd - RMID
        ];
        const hy = Math.min(Math.abs(v - barY[0]), Math.abs(v - barY[1]));
        const vx = Math.min(Math.abs(u - barX[0]), Math.abs(u - barX[1]));
        if (hy < vx) {
            const by = Math.abs(v - barY[0]) < Math.abs(v - barY[1]) ? barY[0] : barY[1];
            return [
                u + 300,
                v - by
            ];
        }
        const bx = Math.abs(u - barX[0]) < Math.abs(u - barX[1]) ? barX[0] : barX[1];
        return [
            v + 600,
            u - bx
        ];
    };
    const DR = 0.5, DU0 = -140, DV0 = -130, DW = 560, DH = 520;
    const dIn = new Float32Array(DW * DH), dOut = new Float32Array(DW * DH);
    for(let j = 0; j < DH; j++)for(let i = 0; i < DW; i++){
        const inside = squareAt(DU0 + (i + 0.5) * DR, DV0 + (j + 0.5) * DR) > 0.5;
        dIn[j * DW + i] = inside ? 1e4 : 0;
        dOut[j * DW + i] = inside ? 0 : 1e4;
    }
    for (const f of [
        dIn,
        dOut
    ]){
        const a = DR, b = DR * Math.SQRT2;
        for(let j = 0; j < DH; j++)for(let i = 0; i < DW; i++){
            const o = j * DW + i;
            if (i > 0) f[o] = Math.min(f[o], f[o - 1] + a);
            if (j > 0) {
                f[o] = Math.min(f[o], f[o - DW] + a);
                if (i > 0) f[o] = Math.min(f[o], f[o - DW - 1] + b);
                if (i < DW - 1) f[o] = Math.min(f[o], f[o - DW + 1] + b);
            }
        }
        for(let j = DH - 1; j >= 0; j--)for(let i = DW - 1; i >= 0; i--){
            const o = j * DW + i;
            if (i < DW - 1) f[o] = Math.min(f[o], f[o + 1] + a);
            if (j < DH - 1) {
                f[o] = Math.min(f[o], f[o + DW] + a);
                if (i < DW - 1) f[o] = Math.min(f[o], f[o + DW + 1] + b);
                if (i > 0) f[o] = Math.min(f[o], f[o + DW - 1] + b);
            }
        }
    }
    const edgeAt = (u, v)=>{
        const i = Math.max(0, Math.min(DW - 1, Math.floor((u - DU0) / DR)));
        const j = Math.max(0, Math.min(DH - 1, Math.floor((v - DV0) / DR)));
        const o = j * DW + i;
        return dOut[o] > 0 ? dOut[o] : -dIn[o];
    };
    const BLK = 9.5, ST = 1.6;
    const RING = 2.6, CANAL = 7;
    const gU = new Float32Array(N), gV = new Float32Array(N);
    const key = new Float32Array(N), sq = new Float32Array(N), edge = new Float32Array(N);
    const hgt = new Float32Array(N), lot = new Int32Array(N);
    for(let y = 0; y < H; y++){
        const s = scaleAt(y + 0.5), v = groundV(y + 0.5);
        for(let x = 0; x < W; x++){
            const k = y * W + x;
            const u = (x + 0.5 - CX) / s;
            gU[k] = u, gV[k] = v;
            key[k] = keyAt(u, v);
            const e = edgeAt(u, v);
            edge[k] = e;
            sq[k] = smooth(1, -1, e);
            if (key[k] > 0.08 || e > -RING - 0.8 && e < CANAL + 1.5) continue;
            const bu = Math.floor(u / BLK), bv = Math.floor(v / BLK);
            const fu = u - bu * BLK, fv = v - bv * BLK;
            if (fu < ST || fv < ST) continue;
            const split = hash(bu, bv) > 0.5;
            const lu = fu < (split ? BLK * 0.55 : BLK + 1) ? 0 : 1, lv = fv < BLK * 0.58 ? 0 : 1;
            const id = ((bu + 500) * 1000 + (bv + 500)) * 4 + lu * 2 + lv;
            if (split && Math.abs(fu - BLK * 0.55) < 0.35 || Math.abs(fv - BLK * 0.58) < 0.35) continue;
            const tall = hash(id, 7);
            const inside = e < 0;
            const units = inside ? 1.2 + 4.8 * tall * tall + (tall > 0.93 ? 4 : 0) : 0.8 + 3 * tall * tall;
            lot[k] = id;
            hgt[k] = units * 0.75 * s;
        }
    }
    for(let x = 0; x < W; x++){
        let rows = 99;
        for(let y = 0; y < H; y++){
            const k = y * W + x;
            if (key[k] > 0.35 || edge[k] > -RING && edge[k] < 0.4) rows = 0;
            else rows++;
            if (hgt[k] > rows - 0.6) hgt[k] = Math.max(0, rows - 0.6);
        }
    }
    const glow = new Float32Array(N), tmp = new Float32Array(N);
    glow.set(key);
    for(let pass = 0; pass < 3; pass++){
        for(let y = 0; y < H; y++)for(let x = 0; x < W; x++){
            let s = 0;
            for(let d = -3; d <= 3; d++)s += glow[y * W + Math.min(W - 1, Math.max(0, x + d))];
            tmp[y * W + x] = s / 7;
        }
        for(let y = 0; y < H; y++)for(let x = 0; x < W; x++){
            let s = 0;
            for(let d = -2; d <= 2; d++)s += tmp[Math.min(H - 1, Math.max(0, y + d)) * W + x];
            glow[y * W + x] = s / 5;
        }
    }
    const baseR = new Float32Array(N), baseG = new Float32Array(N), baseB = new Float32Array(N);
    const floors = new Float32Array(N);
    const inks = new Float32Array(N);
    const road = new Float32Array(N);
    const rP = new Float32Array(N), rL = new Float32Array(N);
    const water = new Float32Array(N);
    const blink = new Float32Array(N);
    for(let y = 0; y < H; y++){
        const s = scaleAt(y + 0.5);
        const far = smooth(26, 0, y) * 0.8;
        for(let x = 0; x < W; x++){
            const k = y * W + x;
            let hit = 0, at = k;
            for(let d = DMAX; d >= 1; d--){
                if (y + d >= H) continue;
                const j = (y + d) * W + x;
                if (hgt[j] >= d) {
                    hit = d;
                    at = j;
                    break;
                }
            }
            let cr = 0, cg = 0, cb = 0, floor = 0, ink = 1;
            const warm = key[k] > 0.08 && !hit ? 0 : glow[k] * 0.22;
            const dim = 0.25 + 0.75 * sq[at];
            if (hit) {
                const id = lot[at];
                const face = hgt[at] - hit >= 1;
                if (face) {
                    const z = Math.round(hit);
                    const lit = hash(id * 31 + x, z * 7 + 3);
                    const on = (x + (id & 1)) % 2 === 0 && lit > 0.5 - 0.2 * sq[at];
                    cr = 0.03, cg = 0.03, cb = 0.035;
                    ink = 0.45;
                    if (on) {
                        const b = (0.42 + 0.4 * hash(x * 3 + id, z)) * dim;
                        const cool = hash(id, 9) > 0.55;
                        cr += b * (cool ? 0.84 : 1), cg += b * (cool ? 0.88 : 0.84), cb += b * (cool ? 1 : 0.6);
                        ink = 0.7 + 0.3 * sq[at];
                        if (hash(x + id * 5, z * 13) > 0.9) blink[k] = 1;
                    }
                } else {
                    const tone = (0.17 + 0.15 * hash(id, 4)) * dim * (0.8 + 0.2 * Math.min(1, hgt[at] / 3));
                    cr = tone, cg = tone, cb = tone * 1.06;
                    ink = 0.42 + 0.18 * hash(id, 5);
                    if (hash(id, 11) > 0.88 && hash(x, y + id) > 0.8) cr = 0.8 * dim, cg = 0.8 * dim, cb = 0.86 * dim, ink = 1;
                }
            } else if (key[k] < 0.08 && edge[k] > -RING && edge[k] < 0.4) {
                const lamp = ((gU[k] + gV[k]) % 4 + 4) % 4 < 1.2 ? 1 : 0;
                const b = 0.55 + 0.45 * lamp;
                cr = b * 0.92, cg = b * 0.94, cb = b;
                ink = 0.8 + 0.2 * lamp;
                floor = 0.3;
            } else if (key[k] < 0.08 && edge[k] >= 0.4 && edge[k] < CANAL) {
                cr = 0.008, cg = 0.01, cb = 0.014;
                water[k] = 0.12 + 0.8 * Math.exp(-(edge[k] - 0.4) / 1.6);
                if (edge[k] > CANAL - 0.9 && hash(Math.round(gU[k] / 3), Math.round(gV[k] / 3)) > 0.5) cr = 0.7, cg = 0.52, cb = 0.3;
            } else if (key[k] > 0.08) {
                const kk = key[k];
                const [p, l] = route(gU[k], gV[k]);
                rP[k] = p, rL[k] = l;
                road[k] = kk;
                const kerb = smooth(0.95, 0.55, kk);
                const lamp = kerb * ((p % 4 + 4) % 4 < 1.4 ? 1 : 0.55);
                const b = (0.4 + 0.6 * lamp) * smooth(0.08, 0.45, kk);
                cr = b, cg = b * 0.66, cb = b * 0.32;
                floor = 0.55 * smooth(0.1, 0.5, kk);
            } else {
                const u = gU[k], v = gV[k];
                const fu = (u % BLK + BLK) % BLK, fv = (v % BLK + BLK) % BLK;
                const street = fu < ST || fv < ST;
                const base = (street ? 0.05 : 0.02) * dim;
                cr = base, cg = base, cb = base * 1.1;
                ink = 0.5;
                if (fu < ST && fv < ST && hash(Math.floor(u / BLK), Math.floor(v / BLK)) > 0.3) {
                    cr = 0.8 * dim, cg = 0.6 * dim, cb = 0.34 * dim, ink = 1;
                }
            }
            cr += warm * 0.9, cg += warm * 0.6, cb += warm * 0.3;
            if (warm > 0.02) ink = Math.min(1, ink + warm * 2);
            cr = cr * (1 - 0.6 * far) + 0.025 * far;
            cg = cg * (1 - 0.6 * far) + 0.025 * far;
            cb = cb * (1 - 0.6 * far) + 0.03 * far;
            baseR[k] = cr, baseG[k] = cg, baseB[k] = cb;
            floors[k] = floor * (0.6 + 0.4 * s);
            inks[k] = ink * (1 - 0.3 * far);
        }
    }
    const MW = 400;
    const mist = new Float32Array(MW * H);
    for(let y = 0; y < H; y++)for(let x = 0; x < MW; x++){
        const n = fbm(x * 0.016, y * 0.055, 4, MW * 0.016);
        const band = (0.5 + 0.5 * Math.sin(y * 0.09 + 0.6)) * (0.45 + 0.55 * smooth(10, 60, y));
        mist[y * MW + x] = smooth(0.45, 0.75, n) * band;
    }
    return (t, { color } = {})=>{
        const drift = t * 2.2;
        for(let y = 0; y < H; y++){
            for(let x = 0; x < W; x++){
                const k = y * W + x;
                let cr = baseR[k], cg = baseG[k], cb = baseB[k];
                let floor = floors[k], ink = inks[k];
                const rd = road[k];
                if (rd > 0.3) {
                    const l = rL[k], dir = l > 0 ? 1 : -1;
                    const lane = Math.floor(Math.abs(l) / 1.3);
                    const off = hash(lane, dir + 5) * 40;
                    const sp = 7 + 3 * hash(lane, dir + 9);
                    const ph = ((rP[k] - dir * t * sp + off) % 13 + 13) % 13;
                    const len = 7;
                    if (ph < len) {
                        const a = dir > 0 ? ph / len : 1 - ph / len;
                        const b = Math.min(1, a * a * 1.3) * smooth(0.3, 0.75, rd);
                        if (dir > 0) cr += (1 - cr) * b, cg += (0.97 - cg) * b, cb += (0.9 - cb) * b;
                        else cr += (1 - cr) * b, cg += (0.34 - cg) * b, cb += (0.2 - cb) * b;
                    }
                }
                if (water[k] > 0) {
                    const w = noise(gU[k] * 0.45 + t * 0.3, gV[k] * 1.2 - t * 0.8, 0);
                    const sh = smooth(0.58, 0.85, w) * water[k] * 0.75;
                    cr += sh * 0.9, cg += sh * 0.88, cb += sh * 0.84;
                }
                if (blink[k]) {
                    const on = Math.sin(t * 0.7 + x * 1.7 + y * 0.9) > -0.2 ? 1 : 0.15;
                    cr *= on, cg *= on, cb *= on;
                }
                const sx = x + drift, ix = Math.floor(sx), fx = sx - ix;
                const m0 = mist[y * MW + ix % MW], m1 = mist[y * MW + (ix + 1) % MW];
                const m = (m0 + (m1 - m0) * fx) * (0.36 - 0.18 * road[k]);
                if (m > 0.005) {
                    const lit = 0.2 + glow[k] * 0.6;
                    cr = cr * (1 - m) + m * (lit + 0.1), cg = cg * (1 - m) + m * (lit * 0.85 + 0.1), cb = cb * (1 - m) + m * (lit * 0.7 + 0.11);
                    floor += m * 0.3;
                    ink += (0.6 - ink) * m * 1.5;
                }
                const peak = Math.max(cr, cg, cb, 1e-4);
                const level = clamp(floor + (1 - floor) * Math.pow(peak, 0.85) * 0.95);
                const step = Math.max(0, Math.min(3, Math.round(level * 3 + BAYER[(y & 3) * 4 + (x & 3)])));
                out[k] = DOTS[step];
                if (color) {
                    const want = step ? Math.min(1, (level + 0.06) / COVER[step]) : 0;
                    const s = (0.3 + 0.7 * want) / peak * ink;
                    color[k] = nearest(clamp(cr * s), clamp(cg * s), clamp(cb * s));
                }
            }
        }
        const lines = [];
        for(let r = 0; r < H; r++)lines.push(out.slice(r * W, (r + 1) * W).join(""));
        return lines.join("\n");
    };
}
