# SPDX-License-Identifier: Apache-2.0
# Runtime arguments prevent the compiler folding all probes into a constant.
import Base

def mixword(x: U32) -> U32:
  (x * 1664525 + 1013904223 : U32)

def probe(+x: U32, +y: U32) -> U32:
  +a = (4294967295 - x : U32)
  +b = (y .&. 31 : U32)
  +q = (a / b : U32)
  +r = (a % b : U32)
  +first = mixword(x)
  +second = mixword(y)
  ((q .^. r .^. first .^. second .^. x) .&. 16777215 : U32)

def grid(d: Nat, +x: U32, +y: U32) -> Image:
  match d:
    case 0n: Pix{probe(x, y)}
    case 1n+ +p:
      +h = (1 << p : U32)
      a b = grid(p, x, y) grid(p, (x + h : U32), y)
      c e = grid(p, x, (y + h : U32)) grid(p, (x + h : U32), (y + h : U32))
      Qua{a, b, c, e}

def showcase() -> Image:
  grid!(7n, 0, 0)

def main() -> Image:
  showcase!()
