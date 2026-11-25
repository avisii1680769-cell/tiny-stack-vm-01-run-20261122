import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function run(p: Uint8Array, input: Uint8Array): { out: Uint8Array; code: number } {
  const D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256), out = new Uint8Array(65536);
  let sp = 0, csp = 0, olen = 0, ip = 0, pc = 0, steps = 0;
  for (;;) {
    if (steps === 1e6) return { out: out.slice(0, olen), code: 10 };
    if (pc < 0 || pc >= p.length) return { out: out.slice(0, olen), code: 9 };
    const op = p[pc];
    let imm = 0, valid = true;
    if (op === 1) imm = 1;
    else if (op === 2 || (op >= 0x30 && op <= 0x33)) imm = op === 2 ? 4 : 2;
    else if (op === 0 || (op >= 3 && op <= 7) || (op >= 0x10 && op <= 0x1e) || (op >= 0x20 && op <= 0x22) || op === 0x34 || op === 0x40 || op === 0x41 || (op >= 0x50 && op <= 0x53)) valid = true;
    else valid = false;
    if (!valid) return { out: out.slice(0, olen), code: 5 };
    if (pc + imm >= p.length) return { out: out.slice(0, olen), code: 9 };
    steps++;
    const next = pc + 1 + imm;
    let pops = 0, pushes = 0;
    if (op === 3 || op === 0x50 || op === 0x51 || op === 0x53 || op === 0x31 || op === 0x32) pops = 1;
    else if (op === 4) { pops = 1; pushes = 2; }
    else if (op === 5) { pops = 2; pushes = 2; }
    else if (op === 6) { pops = 2; pushes = 3; }
    else if (op === 7) { pops = 3; pushes = 3; }
    else if ((op >= 0x10 && op <= 0x16) || (op >= 0x18 && op <= 0x1a) || (op >= 0x1c && op <= 0x1e) || (op >= 0x20 && op <= 0x22)) { pops = 2; pushes = 1; }
    else if (op === 0x17 || op === 0x1b || op === 0x40) { pops = 1; pushes = 1; }
    else if (op === 0x41) pops = 2;
    else if (op === 1 || op === 2 || op === 0x52) pushes = 1;
    if (sp < pops) return { out: out.slice(0, olen), code: 2 };
    if (sp - pops + pushes > 256) return { out: out.slice(0, olen), code: 3 };
    pc = next;
    switch (op) {
      case 0: return { out: out.slice(0, olen), code: 0 };
      case 1: D[sp++] = (p[next - 1] << 24) >> 24; break;
      case 2: D[sp++] = p[next - 4] | (p[next - 3] << 8) | (p[next - 2] << 16) | (p[next - 1] << 24); break;
      case 3: sp--; break;
      case 4: D[sp] = D[sp - 1]; sp++; break;
      case 5: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 6: D[sp] = D[sp - 2]; sp++; break;
      case 7: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 0x17: D[sp - 1] = -D[sp - 1] | 0; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        const b = D[sp - 1], a = D[sp - 2]; let r = 0;
        if (op === 0x10) r = a + b | 0;
        else if (op === 0x11) r = a - b | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) { if (!b) return { out: out.slice(0, olen), code: 4 }; r = a / b | 0; }
        else if (op === 0x14) { if (!b) return { out: out.slice(0, olen), code: 4 }; r = b === -1 ? 0 : a % b | 0; }
        else if (op === 0x15) { if (!b) return { out: out.slice(0, olen), code: 4 }; r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 0x16) { if (!b) return { out: out.slice(0, olen), code: 4 }; r = (a >>> 0) % (b >>> 0) | 0; }
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = a >>> (b & 31) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; D[sp++] = r; break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16;
        if (op === 0x30) pc = next + rel;
        else { const v = D[--sp]; if ((op === 0x31 && v === 0) || (op === 0x32 && v !== 0)) pc = next + rel; }
        break;
      }
      case 0x33:
        if (csp === 64) return { out: out.slice(0, olen), code: 7 };
        C[csp++] = next; pc = p[next - 2] | (p[next - 1] << 8); break;
      case 0x34: if (!csp) return { out: out.slice(0, olen), code: 8 }; pc = C[--csp]; break;
      case 0x40: { const a = D[sp - 1]; if (a < 0 || a > 255) return { out: out.slice(0, olen), code: 6 }; D[sp - 1] = M[a]; break; }
      case 0x41: { const a = D[sp - 1], v = D[sp - 2]; if (a < 0 || a > 255) return { out: out.slice(0, olen), code: 6 }; sp -= 2; M[a] = v; break; }
      case 0x50: {
        const s = String(D[sp - 1]); if (olen + s.length > 65536) return { out: out.slice(0, olen), code: 11 };
        sp--; for (let i = 0; i < s.length; i++) out[olen++] = s.charCodeAt(i); break;
      }
      case 0x51: if (olen === 65536) return { out: out.slice(0, olen), code: 11 }; out[olen++] = D[--sp] & 255; break;
      case 0x52: D[sp++] = ip < input.length ? input[ip++] : -1; break;
      case 0x53: return { out: out.slice(0, olen), code: D[--sp] & 255 };
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input', O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), `${r.code}\n`);
}
