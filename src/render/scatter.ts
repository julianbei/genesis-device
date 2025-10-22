import { MeshBuilder, Scene, Mesh } from "@babylonjs/core";
import { HeightField } from "../terrain/HeightField";

export function scatterTrees(scene: Scene, height: HeightField, count: number, worldSize=1000, heightMeters=800): Mesh {
  const base = MeshBuilder.CreateCylinder("tree", { height: 8, diameterTop: 0.1, diameterBottom: 0.6 }, scene);
  base.setEnabled(false);

  const inst = base.createInstance("trees");
  const N = height.size;
  let created = 0;
  for (let n=0;n<count;n++){
    const u = Math.random(), v = Math.random();
    const x = Math.floor(u*(N-1)), y = Math.floor(v*(N-1));
    const h = height.data[y*N+x];
    // avoid steep slopes (very naive)
    const dx = height.get(x+1,y)-height.get(x-1,y);
    const dy = height.get(x,y+1)-height.get(x,y-1);
    const slope = Math.sqrt(dx*dx+dy*dy);
    if (slope > 0.02) continue;

    const wx = (u-0.5) * worldSize;
    const wz = (v-0.5) * worldSize;
    const wy = h * heightMeters;
    const tree = base.createInstance("tree_"+created);
    tree.position.set(wx, wy, wz);
    tree.scaling.setAll(0.7 + Math.random()*0.6);
    created++;
    if (created >= count) break;
  }
  return inst;
}
