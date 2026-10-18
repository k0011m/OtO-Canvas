import {describe,it,expect} from "vitest";
import {advanceFloatingPosition} from "../src/visuals/floatingMotion";
describe("floating motion",()=>{
  it("coasts and slows down",()=>{
    const b={x:.3,y:.4,vx:.5,vy:.2,lastMovedAt:0};
    advanceFloatingPosition(b,.1,.05,.05);
    expect(b.x).toBeGreaterThan(.3);expect(b.y).toBeGreaterThan(.4);
    expect(b.vx).toBeLessThan(.5);expect(b.vx).toBeGreaterThan(0);
  });
  it("reflects at all walls using shape radius",()=>{
    for(const [x,y,vx,vy] of [[.89,.5,2,0],[.11,.5,-2,0],[.5,.89,0,2],[.5,.11,0,-2]]){
      const b={x,y,vx,vy,lastMovedAt:0};
      advanceFloatingPosition(b,.1,.1,.1);
      expect(b.x).toBeGreaterThanOrEqual(.1);expect(b.x).toBeLessThanOrEqual(.9);
      expect(b.y).toBeGreaterThanOrEqual(.1);expect(b.y).toBeLessThanOrEqual(.9);
      if(vx)expect(b.vx*vx).toBeLessThan(0);
      if(vy)expect(b.vy*vy).toBeLessThan(0);
    }
  });
  it("keeps similar travel at 30 and 60 fps",()=>{
    const a={x:.3,y:.4,vx:.2,vy:.1,lastMovedAt:0},b={...a};
    for(let i=0;i<30;i++)advanceFloatingPosition(a,1/30,.05,.05);
    for(let i=0;i<60;i++)advanceFloatingPosition(b,1/60,.05,.05);
    expect(a.x).toBeCloseTo(b.x,6);expect(a.y).toBeCloseTo(b.y,6);
  });
});
