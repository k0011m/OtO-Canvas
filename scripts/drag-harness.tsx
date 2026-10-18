import React from "react";
import {createRoot} from "react-dom/client";
import {PerformanceCanvas} from "../src/visuals/PerformanceCanvas";
import {WORLDS} from "../src/types/project";
createRoot(document.getElementById("root")!).render(<PerformanceCanvas shapes={[{id:"one",kind:"circle",position:{x:.4,y:.4},size:.15,rotation:0,colorId:"sun",patternId:"circle-1",zIndex:0}]} theme={WORLDS.bounce} beat={8} section="middle" reducedMotion={true} lowPower={true} onConduct={()=>{}} />);
