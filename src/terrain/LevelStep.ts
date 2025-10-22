export interface LevelStepConfig {
  baseSize: number;   // e.g. 64
  steps: number;      // e.g. 4 -> 64,128,256,512
}

export function* levelSteps(cfg: LevelStepConfig): Generator<number> {
  let s = cfg.baseSize;
  for (let i = 0; i < cfg.steps; i++) {
    yield s;
    s *= 2;
  }
}
