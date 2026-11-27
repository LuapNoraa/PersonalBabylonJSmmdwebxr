import { Engine } from "@babylonjs/core/Engines/engine";

import { BaseRuntime } from "./baseRuntime";
import { SceneBuilder } from "./sceneBuilder";

window.onload = (): void => {
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    document.body.appendChild(canvas);

    const engine = new Engine(canvas, false, {
        preserveDrawingBuffer: false,
        stencil: false,
        antialias: false,
        alpha: false,
        premultipliedAlpha: false,
        powerPreference: "high-performance",
        doNotHandleTouchAction: true,
        doNotHandleContextLost: true,
        audioEngine: false
    }, false);

    void BaseRuntime.Create({
        canvas,
        engine,
        sceneBuilder: new SceneBuilder()
    }).then((runtime) => {
        runtime.run();
    }).catch((error: unknown) => {
        console.error("Failed to initialize the MMD WebXR scene.", error);
        const errorMessage = document.createElement("pre");
        errorMessage.style.whiteSpace = "pre-wrap";
        errorMessage.style.padding = "1rem";
        errorMessage.textContent = error instanceof Error ? error.message : String(error);
        document.body.appendChild(errorMessage);
    });
};
