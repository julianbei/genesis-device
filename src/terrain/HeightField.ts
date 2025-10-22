export class HeightField {
  readonly size: number; // N x N
  readonly data: Float32Array;

  constructor(size: number, fill = 0) {
    this.size = size;
    this.data = new Float32Array(size * size);
    if (fill !== 0) this.data.fill(fill);
  }

  get(x: number, y: number): number {
    const N = this.size;
    x = Math.min(N - 1, Math.max(0, x));
    y = Math.min(N - 1, Math.max(0, y));
    return this.data[y * N + x];
  }

  set(x: number, y: number, v: number) {
    this.data[y * this.size + x] = v;
  }

  clone(): HeightField {
    const h = new HeightField(this.size);
    h.data.set(this.data);
    return h;
  }

  resampleTo(newSize: number): HeightField {
    if (newSize === this.size) return this.clone();
    const out = new HeightField(newSize);
    const N = this.size, M = newSize;
    for (let j = 0; j < M; j++) {
      const v = (j * (N - 1)) / (M - 1);
      const y0 = Math.floor(v), y1 = Math.min(N - 1, y0 + 1);
      const fy = v - y0;
      for (let i = 0; i < M; i++) {
        const u = (i * (N - 1)) / (M - 1);
        const x0 = Math.floor(u), x1 = Math.min(N - 1, x0 + 1);
        const fx = u - x0;
        const h00 = this.get(x0, y0), h10 = this.get(x1, y0);
        const h01 = this.get(x0, y1), h11 = this.get(x1, y1);
        const a = h00 * (1 - fx) + h10 * fx;
        const b = h01 * (1 - fx) + h11 * fx;
        out.set(i, j, a * (1 - fy) + b * fy);
      }
    }
    return out;
  }
}
