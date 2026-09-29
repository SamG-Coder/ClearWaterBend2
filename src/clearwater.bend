# SPDX-License-Identifier: MIT
# Clearwater, ported from SamG-Coder/clearwater, revision 1de10a3.
# All definitions below are ordinary checked Bend 2. No foreign effects.
import Base

type V3 is Data:
  V3{x: F32, y: F32, z: F32}

type V4 is Data:
  V4{x: F32, y: F32, z: F32, w: F32}

# An immutable binary field allows independent render tasks to read the ocean.
# This is a user-defined datatype, not an extension to Bend's Array API.
type Field is Data:
  Leaf{value: V4}
  Branch{left: Field, right: Field}

def select(-T: Type, c: Bool, a: Unit -> T, b: Unit -> T) -> T:
  match c:
    case True{}: a(Unit{})
    case False{}: b(Unit{})

def pick(c: Bool, a: F32, b: F32) -> F32:
  match c:
    case True{}: a
    case False{}: b

def word(c: Bool, a: U32, b: U32) -> U32:
  match c:
    case True{}: a
    case False{}: b

def sat(x: F32) -> F32:
  F32.clamp(x, 0.0, 1.0)

def square(+x: F32) -> F32:
  (x * x : F32)

def frac(+x: F32) -> F32:
  (x - F32.floor(x) : F32)

def mix(+a: F32, b: F32, t: F32) -> F32:
  (a + (b - a) * t : F32)

def smooth(+a: F32, b: F32, x: F32) -> F32:
  +t = sat(((x - a) / (b - a) : F32))
  (t * t * (3.0 - 2.0 * t) : F32)

def V3.add(a: V3, b: V3) -> V3:
  V3{x, y, z} = a
  V3{u, v, w} = b
  V3{(x + u : F32), (y + v : F32), (z + w : F32)}

def V3.sub(a: V3, b: V3) -> V3:
  V3{x, y, z} = a
  V3{u, v, w} = b
  V3{(x - u : F32), (y - v : F32), (z - w : F32)}

def V3.scale(a: V3, +s: F32) -> V3:
  V3{x, y, z} = a
  V3{(x * s : F32), (y * s : F32), (z * s : F32)}

def V3.mul(a: V3, b: V3) -> V3:
  V3{x, y, z} = a
  V3{u, v, w} = b
  V3{(x * u : F32), (y * v : F32), (z * w : F32)}

def V3.dot(a: V3, b: V3) -> F32:
  V3{x, y, z} = a
  V3{u, v, w} = b
  (x * u + y * v + z * w : F32)

def V3.norm(+a: V3) -> V3:
  V3.scale(a, (1.0 / F32.sqrt(F32.max(V3.dot(a, a), 0.00000001)) : F32))

def V3.mix(a: V3, b: V3, +t: F32) -> V3:
  V3.add(V3.scale(a, (1.0 - t : F32)), V3.scale(b, t))

def V4.mix(a: V4, b: V4, +t: F32) -> V4:
  V4{x, y, z, w} = a
  V4{r, s, u, v} = b
  V4{mix(x, r, t), mix(y, s, t), mix(z, u, t), mix(w, v, t)}

def hashU(+x: U32) -> U32:
  +a = ((x .^. (x >> 16n)) * 2146121005 : U32)
  +b = ((a .^. (a >> 15n)) * 2221713035 : U32)
  (b .^. (b >> 16n) : U32)

def random(x: U32) -> F32:
  ((U32.to_f32((hashU(x) .&. 16777215 : U32)) + 1.0) / 16777217.0 : F32)

def lengthL(+c: U32) -> F32:
  pick(U32.is_eq(c, 0), 4.6, pick(U32.is_eq(c, 1), 37.0, 293.0))

def frequency(+x: U32, +n: U32, c: U32) -> F32:
  +q = U32.to_f32(x)
  (6.283185307 * pick((x < n / 2 : U32), q, (q - U32.to_f32(n) : F32)) / lengthL(c) : F32)

def density(+k: F32, +kx: F32, +kz: F32, +c: U32) -> F32:
  select(F32, (k > 0.00001 : F32), u =>
    +peak = pick(U32.is_eq(c, 0), 0.62, pick(U32.is_eq(c, 1), 7.0, 65.0))
    +kp = (6.283185307 / peak : F32)
    +lk = F32.log((k / kp : F32))
    bump = F32.exp((F32.neg(0.5) * lk * lk / (0.36 * 0.36) : F32))
    tail = (0.035 * F32.exp((0.0 - kp * kp / (k * k) : F32)) * F32.exp((0.0 - k * k / (kp * kp * 180.0) : F32)) : F32)
    swell = (0.35 * F32.exp((F32.neg(0.5) * square((F32.log((k / (kp * 0.3875) : F32)) / 0.3 : F32)) : F32)) : F32)
    +dir = ((kx * 0.8 + kz * 0.6) / k : F32)
    ((bump + tail + swell) * (0.3 + 0.7 * dir * dir) * pick((dir < 0.0 : F32), 0.35, 1.0) / (k * k * k * k) : F32),
    u => 0.0)

def seed_cell(+id: U32, +n: U32, +c: U32, seed: U32) -> V4:
  +kx = frequency((id % n : U32), n, c)
  +kz = frequency((id / n : U32), n, c)
  +k = F32.sqrt((kx * kx + kz * kz : F32))
  +h = (c * n * n + id + seed * 19391 : U32)
  +radius = F32.sqrt((F32.neg(2.0) * F32.log(random((h * 2 + 1 : U32))) : F32))
  +angle = (6.283185307 * random((h * 2 + 2 : U32)) : F32)
  +amp = F32.sqrt((density(k, kx, kz, c) * 0.5 : F32))
  V4{(radius * F32.cos(angle) * amp : F32), (radius * F32.sin(angle) * amp : F32), 0.0, 0.0}

def seed_field(d: Nat, +start: U32, +n: U32, +c: U32, +seed: U32) -> Field:
  match d:
    case 0n: Leaf{seed_cell(start, n, c, seed)}
    case 1n+ +p:
      left right = seed_field(p, start, n, c, seed) seed_field(p, (start + (1 << p) : U32), n, c, seed)
      Branch{left, right}

def field_get(f: Field, +i: U32, +size: U32) -> V4:
  match f:
    case Leaf{value}: value
    case Branch{left, right}:
      +half = (size / 2 : U32)
      select(V4, (i < half : U32), u => field_get(left, i, half), u => field_get(right, (i - half : U32), half))

def spectrum_energy(f: Field, +start: U32, +size: U32, +n: U32, +c: U32) -> F32:
  match f:
    case Leaf{v}:
      V4{+re, +im, z, w} = v
      +kx = frequency((start % n : U32), n, c)
      +kz = frequency((start / n : U32), n, c)
      (2.0 * (kx * kx + kz * kz) * (re * re + im * im) : F32)
    case Branch{a, b}:
      +half = (size / 2 : U32)
      x y = spectrum_energy(a, start, half, n, c) spectrum_energy(b, (start + half : U32), half, n, c)
      (x + y : F32)

def spectrum_scale(f: Field, +n: U32, +c: U32) -> F32:
  sum = spectrum_energy(f, 0, (n * n : U32), n, c)
  (pick(U32.is_eq(c, 0), 0.078, pick(U32.is_eq(c, 1), 0.047, 0.021)) / F32.sqrt(F32.max(sum, 0.0000000001)) : F32)

def evolve_values(a: V4, b: V4, +x: U32, +z: U32, +n: U32, +c: U32, scale: F32, +time: F32, +sea: F32, depth: F32) -> V4:
  V4{+ar, +ai, az, aw} = a
  V4{+br, +bi, bz, bw} = b
  +kx = frequency(x, n, c)
  +kz = frequency(z, n, c)
  +k = F32.sqrt((kx * kx + kz * kz : F32))
  +kd = F32.min(20.0, (k * depth : F32))
  +ex = F32.exp((F32.neg(2.0) * kd : F32))
  omega = F32.sqrt(((9.81 * k + 0.000074 * k * k * k) * (1.0 - ex) / (1.0 + ex) : F32))
  +angle = (omega * time : F32)
  +co = F32.cos(angle)
  +si = F32.sin(angle)
  +s = (scale * sea : F32)
  +re = (((ar + br) * co - (ai + bi) * si) * s : F32)
  +im = (((ar - br) * si + (ai - bi) * co) * s : F32)
  +dx = pick(U32.is_eq(x, (n / 2 : U32)), 0.0, kx)
  +dz = pick(U32.is_eq(z, (n / 2 : U32)), 0.0, kz)
  chop = (pick(U32.is_eq(c, 0), 0.18, pick(U32.is_eq(c, 1), 1.15, 0.75)) / F32.max(1.0, sea) : F32)
  +cross = ((0.0 - dx * dz) / F32.sqrt(F32.max((dx * dx + dz * dz : F32), 0.00000001)) * chop : F32)
  V4{((1.0 - dx) * re : F32), ((1.0 - dx) * im : F32), (0.0 - dz * im - cross * im : F32), (dz * re + cross * re : F32)}

def evolve_cell(+seed: Field, +id: U32, +n: U32, +c: U32, scale: F32, +time: F32, sea: F32, depth: F32) -> V4:
  +x = (id % n : U32)
  +z = (id / n : U32)
  +j = (((n - z) % n) * n + (n - x) % n : U32)
  evolve_values(field_get(seed, id, (n * n : U32)), field_get(seed, j, (n * n : U32)), x, z, n, c, scale, time, sea, depth)

def evolve_field(d: Nat, +start: U32, +seed: Field, +n: U32, +c: U32, +scale: F32, +time: F32, +sea: F32, +depth: F32) -> Field:
  match d:
    case 0n: Leaf{evolve_cell(seed, start, n, c, scale, time, sea, depth)}
    case 1n+ +p:
      a b = evolve_field(p, start, seed, n, c, scale, time, sea, depth) evolve_field(p, (start + (1 << p) : U32), seed, n, c, scale, time, sea, depth)
      Branch{a, b}

def butterfly(a: V4, b: V4, +angle: F32, +sgn: F32) -> V4:
  V4{ax, ay, az, aw} = a
  V4{+bx, +by, +bz, +bw} = b
  +co = F32.cos(angle)
  +si = F32.sin(angle)
  V4{(ax + sgn * (co * bx - si * by) : F32), (ay + sgn * (si * bx + co * by) : F32), (az + sgn * (co * bz - si * bw) : F32), (aw + sgn * (si * bz + co * bw) : F32)}

def fft_cell(+input: Field, +id: U32, +n: U32, +p: U32, +axis: U32, sign: F32) -> V4:
  +x = (id % n : U32)
  +z = (id / n : U32)
  +j = word(U32.is_eq(axis, 0), x, z)
  +k = (j .&. (p - 1) : U32)
  +i = ((j - (j .&. (2 * p - 1))) / 2 + k : U32)
  +ia = word(U32.is_eq(axis, 0), (z * n + i : U32), (i * n + x : U32))
  ib = (ia + word(U32.is_eq(axis, 0), (n / 2 : U32), (n * n / 2 : U32)) : U32)
  +angle = (sign * 3.14159265359 * U32.to_f32(k) / U32.to_f32(p) : F32)
  +sgn = pick(U32.is_eq((j .&. p : U32), 0), 1.0, F32.neg(1.0))
  butterfly(field_get(input, ia, (n * n : U32)), field_get(input, ib, (n * n : U32)), angle, sgn)

def fft_pass(d: Nat, +start: U32, +input: Field, +n: U32, +p: U32, +axis: U32, +sign: F32) -> Field:
  match d:
    case 0n: Leaf{fft_cell(input, start, n, p, axis, sign)}
    case 1n+ +q:
      a b = fft_pass(q, start, input, n, p, axis, sign) fft_pass(q, (start + (1 << q) : U32), input, n, p, axis, sign)
      Branch{a, b}

def fft_axis(steps: Nat, +d: Nat, input: Field, +n: U32, +p: U32, +axis: U32, +sign: F32) -> Field:
  match steps:
    case 0n: input
    case 1n+q:
      next = fft_pass(d, 0, input, n, p, axis, sign)
      fft_axis(q, d, next, n, (p * 2 : U32), axis, sign)

def fft2(+log: Nat, input: Field, sign: F32) -> Field:
  +n = (1 << log : U32)
  +d = (log + log : Nat)
  +s = sign
  rows = fft_axis(log, d, input, n, 1, 0, s)
  fft_axis(log, d, rows, n, 1, 1, s)

def vx(a: V3) -> F32:
  V3{x, y, z} = a
  x

def vy(a: V3) -> F32:
  V3{x, y, z} = a
  y

def vz(a: V3) -> F32:
  V3{x, y, z} = a
  z

def height(a: V4) -> F32:
  V4{x, y, z, w} = a
  x

def V3.exp(a: V3) -> V3:
  V3{x, y, z} = a
  V3{F32.exp(x), F32.exp(y), F32.exp(z)}

def V3.refract(+d: V3, +n: V3, +eta: F32) -> V3:
  +c = V3.dot(n, d)
  V3.sub(V3.scale(d, eta), V3.scale(n, (eta * c + F32.sqrt(F32.max(0.0, (1.0 - eta * eta * (1.0 - c * c) : F32))) : F32)))

def signed_word(+x: F32) -> U32:
  select(U32, (x < 0.0 : F32), u => (0 - F32.to_u32(F32.neg(x)) : U32), u => F32.to_u32(x))

def hash(x: F32, z: F32) -> F32:
  random((signed_word(x) * 1973 + signed_word(z) * 9277 + 89173 : U32))

def noise(+x: F32, +z: F32) -> F32:
  +ix = F32.floor(x)
  +iz = F32.floor(z)
  +fx = frac(x)
  +fz = frac(z)
  +u = (fx * fx * (3.0 - 2.0 * fx) : F32)
  +w = (fz * fz * (3.0 - 2.0 * fz) : F32)
  mix(mix(hash(ix, iz), hash((ix + 1.0 : F32), iz), u), mix(hash(ix, (iz + 1.0 : F32)), hash((ix + 1.0 : F32), (iz + 1.0 : F32)), u), w)

def fbm(+x: F32, +z: F32) -> F32:
  (0.55 * noise(x, z) + 0.28 * noise((x * 2.03 + 17.1 : F32), (z * 2.03 + 17.1 : F32)) + 0.12 * noise((x * 4.12 : F32), (z * 4.12 : F32)) + 0.05 * noise((x * 8.36 : F32), (z * 8.36 : F32)) : F32)

def sample4(+field: Field, +x: F32, +z: F32, +n: U32) -> V4:
  +ix = (signed_word(F32.floor(x)) .&. (n - 1) : U32)
  +iz = (signed_word(F32.floor(z)) .&. (n - 1) : U32)
  +jx = ((ix + 1) .&. (n - 1) : U32)
  +jz = ((iz + 1) .&. (n - 1) : U32)
  +size = (n * n : U32)
  V4.mix(V4.mix(field_get(field, (iz * n + ix : U32), size), field_get(field, (iz * n + jx : U32), size), frac(x)), V4.mix(field_get(field, (jz * n + ix : U32), size), field_get(field, (jz * n + jx : U32), size), frac(x)), frac(z))

type Ocean is Data:
  Ocean{detail: Field, wind: Field, swell: Field, size: U32}

def chop_values(a: V4, b: V4, +kx: F32, +kz: F32, +c: U32, sea: F32) -> V4:
  V4{ar, ai, az, aw} = a
  V4{br, bi, bz, bw} = b
  +re = ((ar + br) * 0.5 : F32)
  +im = ((ai - bi) * 0.5 : F32)
  +inv = (pick(U32.is_eq(c, 0), 0.18, pick(U32.is_eq(c, 1), 1.15, 0.75)) / (F32.sqrt(F32.max((kx * kx + kz * kz : F32), 0.00001)) * F32.max(1.0, sea)) : F32)
  +xx = ((0.0 - kx * kx) * inv * 6.283185307 / lengthL(c) : F32)
  +zz = ((0.0 - kz * kz) * inv * 6.283185307 / lengthL(c) : F32)
  V4{((0.0 - kx * im - kz * re) * inv : F32), ((kx * re - kz * im) * inv : F32), (xx * re - zz * im : F32), (xx * im + zz * re : F32)}

def chop_cell(+input: Field, +id: U32, +n: U32, c: U32, sea: F32) -> V4:
  +x = (id % n : U32)
  +z = (id / n : U32)
  opposite = (((n - z) % n) * n + (n - x) % n : U32)
  kx = pick(U32.is_eq(x, (n / 2 : U32)), 0.0, pick((x < n / 2 : U32), U32.to_f32(x), (U32.to_f32(x) - U32.to_f32(n) : F32)))
  kz = pick(U32.is_eq(z, (n / 2 : U32)), 0.0, pick((z < n / 2 : U32), U32.to_f32(z), (U32.to_f32(z) - U32.to_f32(n) : F32)))
  chop_values(field_get(input, id, (n * n : U32)), field_get(input, opposite, (n * n : U32)), kx, kz, c, sea)

def chop_field(d: Nat, +start: U32, +input: Field, +n: U32, +c: U32, +sea: F32) -> Field:
  match d:
    case 0n: Leaf{chop_cell(input, start, n, c, sea)}
    case 1n+ +p:
      a b = chop_field(p, start, input, n, c, sea) chop_field(p, (start + (1 << p) : U32), input, n, c, sea)
      Branch{a, b}

def displace_values(a: V4, +x: F32, +z: F32, +scale: F32) -> V3:
  V4{dx, dz, xx, zz} = a
  V3{(x - F32.clamp((dx * scale : F32), F32.neg(6.0), 6.0) : F32), 0.0, (z - F32.clamp((dz * scale : F32), F32.neg(6.0), 6.0) : F32)}

def inverse_map(steps: Nat, +disp: Field, +x: F32, +z: F32, +n: U32, +scale: F32, q: V3) -> V3:
  match steps:
    case 0n: q
    case 1n+p:
      V3{qx, qy, qz} = q
      next = displace_values(sample4(disp, qx, qz, n), x, z, scale)
      inverse_map(p, disp, x, z, n, scale, next)

def resolve_values(h: V4, d: V4) -> V4:
  V4{height, +hx, +hz, +cross} = h
  V4{dx, dz, dxx, dzz} = d
  +xx = (1.0 + dxx : F32)
  +zz = (1.0 + dzz : F32)
  +inv = (1.0 / F32.max(0.45, (xx * zz - cross * cross : F32)) : F32)
  +nx = F32.clamp(((zz * hx - cross * hz) * inv : F32), F32.neg(1.8), 1.8)
  +nz = F32.clamp(((xx * hz - cross * hx) * inv : F32), F32.neg(1.8), 1.8)
  V4{height, nx, nz, (nx * nx + nz * nz : F32)}

def resolve_at(q: V3, input: Field, disp: Field, +n: U32) -> V4:
  V3{+x, y, +z} = q
  resolve_values(sample4(input, x, z, n), sample4(disp, x, z, n))

def resolve_field(d: Nat, +start: U32, +input: Field, +disp: Field, +n: U32, +c: U32) -> Field:
  match d:
    case 0n:
      +x = U32.to_f32((start % n : U32))
      +z = U32.to_f32((start / n : U32))
      q = inverse_map(3n, disp, x, z, n, (U32.to_f32(n) / lengthL(c) : F32), V3{x, 0.0, z})
      Leaf{resolve_at(q, input, disp, n)}
    case 1n+ +p:
      a b = resolve_field(p, start, input, disp, n, c) resolve_field(p, (start + (1 << p) : U32), input, disp, n, c)
      Branch{a, b}

def cascade(+log: Nat, +c: U32, seed: U32, +time: F32, sea: F32, depth: F32) -> Field:
  +n = (1 << log : U32)
  +d = (log + log : Nat)
  +initial = seed_field(d, 0, n, c, seed)
  scale = spectrum_scale(initial, n, c)
  +energy = sea
  +evolved = evolve_field(d, 0, initial, n, c, scale, time, energy, depth)
  chopped = chop_field(d, 0, evolved, n, c, energy)
  surface disp = fft2(log, evolved, 1.0) fft2(log, chopped, 1.0)
  resolve_field(d, 0, surface, disp, n, c)

def ocean(+log: Nat, +seed: U32, +time: F32, +sea: F32, +depth: F32) -> Ocean:
  a b = cascade(log, 0, seed, time, sea, depth) cascade(log, 1, seed, time, sea, depth)
  c = cascade(log, 2, seed, time, sea, depth)
  Ocean{a, b, c, (1 << log : U32)}

def combine_water(a: V4, b: V4, c: V4, +distance: F32) -> V4:
  V4{ax, +ay, +az, aw} = a
  V4{bx, by, bz, bw} = b
  V4{cx, cy, cz, cw} = c
  +fade = (1.0 / (1.0 + distance * 0.018) : F32)
  +windfade = (1.0 / (1.0 + square((distance * 0.003 : F32))) : F32)
  V4{(ax + bx + cx : F32), (ay * fade + by * windfade + cy : F32), (az * fade + bz * windfade + cz : F32), (F32.max(0.0, (aw - ay * ay - az * az : F32)) + 0.006 * (1.0 - fade) + 0.022 * (1.0 - windfade) : F32)}

def water(o: Ocean, +x: F32, +z: F32, distance: F32) -> V4:
  Ocean{a, b, c, +n} = o
  +nf = U32.to_f32(n)
  combine_water(sample4(a, (x * nf / 4.6 : F32), (z * nf / 4.6 : F32), n), sample4(b, (x * nf / 37.0 : F32), (z * nf / 37.0 : F32), n), sample4(c, (x * nf / 293.0 : F32), (z * nf / 293.0 : F32), n), distance)

def fresnel(ci: F32) -> F32:
  +c = sat(ci)
  +ct = F32.sqrt((1.0 - (1.0 - c * c) / (1.3335 * 1.3335) : F32))
  +rs = ((c - 1.3335 * ct) / (c + 1.3335 * ct) : F32)
  +rp = ((1.3335 * c - ct) / (1.3335 * c + ct) : F32)
  (0.5 * (rs * rs + rp * rp) : F32)

def sky(+d: V3) -> V3:
  +mu = F32.max(0.0, V3.dot(d, V3{0.08959, 0.51504, F32.neg(0.85247)}))
  +e = vy(d)
  base = V3.mix(V3{0.66, 0.78, 0.9}, V3{0.11, 0.27, 0.62}, F32.pow(sat(e), 0.42))
  col = V3.add(base, V3.scale(V3{1.0, 0.86, 0.66}, (0.22 * F32.pow(mu, 6.0) + 0.3 * F32.pow(mu, 64.0) + 1.6 * F32.pow(mu, 2400.0) : F32)))
  +a = F32.atan2(vz(d), vx(d))
  +ridge = (0.04 + 0.016 * F32.sin((a * 2.0 + 0.7 : F32)) + 0.011 * F32.sin((a * 5.0 + 2.1 : F32)) + 0.006 * F32.sin((a * 11.0 + 0.3 : F32)) + 0.003 * F32.sin((a * 23.0 + 1.7 : F32)) + 0.002 * F32.sin((a * 41.0 + 2.0 : F32)) : F32)
  +tex = fbm((a * 420.0 : F32), (e * 420.0 : F32))
  cliff = (smooth(0.42, 0.18, (e / F32.max(ridge, 0.001) + 0.25 * (tex - 0.5) : F32)) * smooth(0.35, 0.75, noise((a * 18.0 : F32), 1.0)) : F32)
  land = V3.mix(V3.scale(V3{0.045, 0.070, 0.042}, (0.6 + 0.8 * tex : F32)), V3.scale(V3{0.30, 0.28, 0.23}, (0.55 + 0.7 * tex : F32)), cliff)
  V3.mix(col, V3.mix(land, V3{0.6072, 0.7176, 0.828}, 0.48), smooth((ridge + 0.0009 : F32), (ridge - 0.0009 : F32), e))

type Camera is Data:
  Camera{x: F32, y: F32, z: F32, yaw: F32, pitch: F32, depth: F32, exposure: F32}

def camera_origin(c: Camera) -> V3:
  Camera{x, y, z, yaw, pitch, depth, exposure} = c
  V3{x, y, z}

def ray(c: Camera, +sx: F32, +sy: F32, aspect: F32) -> V3:
  Camera{x, y, z, +yaw, +pitch, depth, exposure} = c
  +cy = F32.cos(yaw)
  +sn = F32.sin(yaw)
  +cp = F32.cos(pitch)
  +sp = F32.sin(pitch)
  +forward = {V3{(sn * cp : F32), sp, (0.0 - cy * cp : F32)} : V3}
  right = {V3{cy, 0.0, sn} : V3}
  up = {V3{(0.0 - sn * sp : F32), cp, (cy * sp : F32)} : V3}
  V3.norm(V3.add(forward, V3.add(V3.scale(right, (sx * aspect * 0.62487 : F32)), V3.scale(up, (sy * 0.62487 : F32)))))

def intersect(steps: Nat, +o: Ocean, +origin: V3, +d: V3, +t: F32) -> F32:
  match steps:
    case 0n: t
    case 1n+p:
      +pos = V3.add(origin, V3.scale(d, t))
      h = height(water(o, vx(pos), vz(pos), t))
      next = mix(t, ((h - vy(origin)) / vy(d) : F32), 0.7)
      intersect(p, o, origin, d, next)

def water_normal(a: V4) -> V3:
  V4{x, y, z, w} = a
  V3.norm(V3{F32.neg(y), 1.0, F32.neg(z)})

def water_variance(a: V4) -> F32:
  V4{x, y, z, w} = a
  w

def floor_depth(+x: F32, +z: F32, depth: F32) -> F32:
  (depth + 0.12 * (noise((x * 0.22 : F32), (z * 0.22 : F32)) - 0.5) + 0.06 * (noise((x * 0.9 + 7.0 : F32), (z * 0.9 + 7.0 : F32)) - 0.5) : F32)

def floor_intersect(steps: Nat, +p: V3, +tr: V3, +depth: F32, +dist: F32) -> F32:
  match steps:
    case 0n: F32.max(0.0, dist)
    case 1n+q:
      +fp = V3.add(p, V3.scale(tr, dist))
      next = ((0.0 - floor_depth(vx(fp), vz(fp), depth) - vy(p)) / vy(tr) : F32)
      floor_intersect(q, p, tr, depth, next)

def stone_mix(a: V4, b: V4, f: F32, footprint: F32) -> V3:
  V4{+ax, +ay, +az, aw} = a
  V4{+bx, +by, +bz, bw} = b
  m = smooth(0.2, 0.8, (f - 0.1 * (ax + ay + az - bx - by - bz) : F32))
  V3.mix(V3.mix(V3{ax, ay, az}, V3{bx, by, bz}, m), V3{0.20, 0.18, 0.14}, smooth(0.015, 0.16, footprint))

def stone(+pebbles: Field, +x: F32, +z: F32, footprint: F32, +size: U32) -> V3:
  +k = (noise((x * 0.85 : F32), (z * 0.85 : F32)) * 8.0 : F32)
  +ia = F32.floor(k)
  +nf = U32.to_f32(size)
  +u = (x / 0.78 * nf : F32)
  +w = (z / 0.78 * nf : F32)
  a = sample4(pebbles, (u + F32.sin((3.0 * ia : F32)) * nf : F32), (w + F32.sin((7.0 * ia : F32)) * nf : F32), size)
  b = sample4(pebbles, (u + F32.sin((3.0 * (ia + 1.0) : F32)) * nf : F32), (w + F32.sin((7.0 * (ia + 1.0) : F32)) * nf : F32), size)
  stone_mix(a, b, frac(k), footprint)

def albedo(+pebbles: Field, +size: U32, +fp: V3, footprint: F32) -> V3:
  +x = vx(fp)
  +z = vz(fp)
  alb = stone(pebbles, x, z, footprint, size)
  zone = fbm((x * 0.16 + 3.0 : F32), (z * 0.16 + 3.0 : F32))
  sand = smooth(0.64, 0.8, zone)
  marks = (0.5 + 0.5 * F32.sin(((x * 0.93 + z * 0.37) * 16.0 + 3.0 * noise((x * 0.8 : F32), (z * 0.8 : F32)) : F32)) : F32)
  blend = V3.mix(alb, V3.scale(V3{0.36, 0.30, 0.19}, (0.82 + 0.1 * marks : F32)), sand)
  big = (0.65 * noise((x * 0.45 : F32), (z * 0.45 : F32)) + 0.35 * noise((x * 1.3 + 3.1 : F32), (z * 1.3 + 3.1 : F32)) : F32)
  +a = V3.scale(blend, mix(0.62, 1.22, big))
  adjusted = V3.mix(V3{0.30, 0.29, 0.27}, V3{F32.pow(vx(a), 1.2), F32.pow(vy(a), 1.2), F32.pow(vz(a), 1.2)}, 0.72)
  V3.mul(V3.scale(adjusted, 0.6), V3{1.1, 1.0, 0.86})

def shade_under(+p: V3, +tr: V3, +depth: F32, pebbles: Field, size: U32, footprint: F32) -> V3:
  +dist = floor_intersect(3n, p, tr, depth, ((0.0 - depth - vy(p)) / vy(tr) : F32))
  +fp = V3.add(p, V3.scale(tr, dist))
  +dh = F32.max(0.05, (vy(p) - vy(fp) : F32))
  alb = albedo(pebbles, size, fp, footprint)
  +sun = {V3{0.08959, 0.51504, F32.neg(0.85247)} : V3}
  +sunT = V3.refract(V3.scale(sun, F32.neg(1.0)), V3{0.0, 1.0, 0.0}, (1.0 / 1.3335 : F32))
  +sig = {V3{0.428, 0.126, 0.156} : V3}
  +ts = (1.0 - fresnel(0.51504) : F32)
  esun = V3.mul(V3.scale(V3{6.0, 5.4, 4.44}, (ts * (0.0 - vy(sunT)) : F32)), V3.exp(V3.scale(sig, (dh / vy(sunT) : F32))))
  esky = V3.mul(V3{0.4285, 0.4838, 0.5391}, V3.exp(V3.scale(V3{0.4112, 0.0948, 0.1152}, (0.0 - dh * 1.25 : F32))))
  lfloor = V3.mul(V3.scale(alb, (1.0 / 3.14159265 : F32)), V3.add(esun, esky))
  +tv = V3.exp(V3.scale(sig, F32.neg(dist)))
  cosS = V3.dot(sunT, V3.scale(tr, F32.neg(1.0)))
  ph = (0.36 / (12.5663706 * F32.pow((1.64 - 1.6 * cosS : F32), 1.5)) : F32)
  lmid = V3.add(V3.mul(V3.scale(V3{6.0, 5.4, 4.44}, (ts * (ph + 0.02) : F32)), V3.exp(V3.scale(sig, (dh * 0.5 / vy(sunT) : F32)))), V3.mul(V3{0.0341, 0.0385, 0.0429}, V3.exp(V3.scale(V3{0.4, 0.074, 0.088}, (0.0 - dh * 0.6 : F32)))))
  lin = V3.scale(V3.mul(V3.mul(V3{(0.028 / 0.428 : F32), (0.052 / 0.126 : F32), (0.068 / 0.156 : F32)}, lmid), V3.sub(V3{1.0, 1.0, 1.0}, tv)), 3.2)
  V3.add(V3.mul(lfloor, tv), lin)

def shade_water(+o: Ocean, +origin: V3, +d: V3, depth: F32, pebbles: Field, size: U32, image_height: F32) -> V3:
  +t = intersect(5n, o, origin, d, ((0.0 - vy(origin)) / vy(d) : F32))
  +p = V3.add(origin, V3.scale(d, t))
  +a = water(o, vx(p), vz(p), t)
  +n0 = water_normal(a)
  +v = V3.scale(d, F32.neg(1.0))
  +nv0 = V3.dot(n0, v)
  +n = V3.norm(V3.add(n0, V3.scale(v, F32.max(0.0, (0.02 - nv0 : F32)))))
  +nv = F32.max(0.02, V3.dot(n, v))
  +f = fresnel(nv)
  +rr = V3.sub(d, V3.scale(n, (2.0 * V3.dot(d, n) : F32)))
  reflection = V3.scale(sky(V3{vx(rr), F32.abs(vy(rr)), vz(rr)}), 1.25)
  +sun = {V3{0.08959, 0.51504, F32.neg(0.85247)} : V3}
  +h = V3.norm(V3.add(v, sun))
  +nh = F32.max(0.0, V3.dot(n, h))
  +nl = F32.max(0.0, V3.dot(n, sun))
  +a2 = (0.00012 + 1.2 * water_variance(a) + 0.000025 * t : F32)
  +c2 = F32.max((nh * nh : F32), 0.0001)
  tan2 = ((1.0 - c2) / c2 : F32)
  dist = (F32.exp((0.0 - tan2 / a2 : F32)) / (3.14159265 * a2 * c2 * c2) : F32)
  vis = (0.5 / (nl * F32.sqrt((nv * nv * (1.0 - a2) + a2 : F32)) + nv * F32.sqrt((nl * nl * (1.0 - a2) + a2 : F32)) + 0.00001) : F32)
  spec = V3.scale(V3{6.0, 5.4, 4.44}, F32.min(12000.0, (dist * vis * fresnel(V3.dot(h, v)) * nl : F32)))
  tr = V3.refract(d, n, (1.0 / 1.3335 : F32))
  under = shade_under(p, tr, depth, pebbles, size, (t / image_height * 1.2 : F32))
  col = V3.add(V3.add(V3.scale(reflection, f), V3.scale(under, (1.0 - f : F32))), spec)
  V3.mix(col, V3{0.57, 0.6745, 0.779}, ((1.0 - F32.exp((0.0 - t * 0.004 : F32))) * 0.8 : F32))

def tone(+x: F32) -> F32:
  F32.pow(sat(((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14) : F32)), (1.0 / 2.2 : F32))

def pack(a: V3, +exposure: F32) -> U32:
  V3{x, y, z} = a
  r = F32.to_u32((tone((x * exposure : F32)) * 255.0 + 0.5 : F32))
  g = F32.to_u32((tone((y * exposure : F32)) * 255.0 + 0.5 : F32))
  b = F32.to_u32((tone((z * exposure : F32)) * 255.0 + 0.5 : F32))
  (r .|. (g << 8n) .|. (b << 16n) .|. 4278190080 : U32)

def pixel_camera(c: Camera, +o: Ocean, pebbles: Field, size: U32, +d: V3, h: F32) -> U32:
  Camera{x, y, z, yaw, pitch, depth, exposure} = c
  +col = select(V3, (vy(d) < 0.0015 : F32), u => shade_water(o, V3{x, y, z}, V3.norm(V3{vx(d), F32.min(vy(d), F32.neg(0.0015)), vz(d)}), depth, pebbles, size, h), u => sky(d))
  mu = V3.dot(d, V3{0.08959, 0.51504, F32.neg(0.85247)})
  pack(V3.add(col, V3.scale(V3{6.0, 5.4, 4.44}, (18.0 * smooth(0.99996, 0.999985, mu) : F32))), exposure)

def pixel(+c: Camera, o: Ocean, pebbles: Field, size: U32, x: U32, y: U32, +w: U32, +h: U32) -> U32:
  sx = (2.0 * (U32.to_f32(x) + 0.5) / U32.to_f32(w) - 1.0 : F32)
  sy = (1.0 - 2.0 * (U32.to_f32(y) + 0.5) / U32.to_f32(h) : F32)
  pixel_camera(c, o, pebbles, size, ray(c, sx, sy, (U32.to_f32(w) / U32.to_f32(h) : F32)), U32.to_f32(h))

# A balanced image tree is supported directly by Bend's CUDA runtime.
def image_rgb(+rgba: U32) -> U32:
  (((rgba .&. 255) << 16n) .|. (rgba .&. 65280) .|. ((rgba >> 16n) .&. 255) : U32)

def image(d: Nat, +x: U32, +y: U32, +span: U32, +c: Camera, +o: Ocean, +pebbles: Field, +size: U32, +resolution: U32) -> Image:
  match d:
    case 0n: Pix{image_rgb(pixel(c, o, pebbles, size, x, y, resolution, resolution))}
    case 1n+ +p:
      +half = (span / 2 : U32)
      a b = image(p, x, y, half, c, o, pebbles, size, resolution) image(p, (x + half : U32), y, half, c, o, pebbles, size, resolution)
      e f = image(p, x, (y + half : U32), half, c, o, pebbles, size, resolution) image(p, (x + half : U32), (y + half : U32), half, c, o, pebbles, size, resolution)
      Qua{a, b, e, f}

type Frame is Data:
  Pixel{rgba: U32}
  Pixels{left: Frame, right: Frame}

def render_frame(d: Nat, +start: U32, +w: U32, +h: U32, +c: Camera, +o: Ocean, +pebbles: Field, +size: U32) -> Frame:
  match d:
    case 0n:
      Pixel{select(U32, (start < w * h : U32), u => pixel(c, o, pebbles, size, (start % w : U32), (start / w : U32), w, h), u => 4278190080)}
    case 1n+ +q:
      a b = render_frame(q, start, w, h, c, o, pebbles, size) render_frame(q, (start + (1 << q) : U32), w, h, c, o, pebbles, size)
      Pixels{a, b}

def render_scene(d: Nat, +resolution: U32) -> Image:
  o = ocean(5n, 42, 4.0, 1.0, 1.8)
  camera = {Camera{0.0, 1.55, 0.0, 0.0, F32.neg(0.24), 1.8, 1.0} : Camera}
  image(d, 0, 0, resolution, camera, o, Leaf{V4{0.3, 0.27, 0.2, 1.0}}, 1, resolution)

def showcase() -> Image:
  render_scene!(7n, 128)

def main() -> Image:
  showcase!()
