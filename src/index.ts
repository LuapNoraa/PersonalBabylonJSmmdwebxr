import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { Engine } from "@babylonjs/core/Engines/engine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { WebXRSessionManager } from "@babylonjs/core/XR/webXRSessionManager";

import { BaseRuntime } from "./baseRuntime";
import { SceneBuilder } from "./sceneBuilder";



async function createRenderingEngine(canvas: HTMLCanvasElement): Promise<AbstractEngine> {
    let webGpuSupported = false;
    let immersiveArSupported = false;

    const FORCE_WEBGL = false;

    try {
        webGpuSupported = await WebGPUEngine.IsSupportedAsync;
    } catch (error) {
        console.warn("WebGPU capability detection failed.", error);
    }

    try {
        immersiveArSupported = await WebXRSessionManager.IsSessionSupportedAsync("immersive-ar");
    } catch (error) {
        console.warn("Immersive AR capability detection failed.", error);
    }

    // WebGPU support alone is not enough for this app: the AR session must also
    // expose the experimental XRGPUBinding projection-layer path.
    const webGpuXrSupported = WebXRSessionManager.IsWebGPUXRSupported;

    if (!FORCE_WEBGL && webGpuSupported && immersiveArSupported && webGpuXrSupported) {
        const engine = new WebGPUEngine(canvas, { xrCompatible: true });

        try {
            await engine.initAsync();
            console.info("Rendering backend: WebGPU (XR-compatible).");
            return engine;
        } catch (error) {
            engine.dispose();
            console.warn("WebGPU initialization failed; falling back to WebGL.", error);
        }
    } else {
        if (FORCE_WEBGL) {
            console.info("Rendering backend: WebGL (forced for A/B test).");
        } else {
            console.info("WebGPU XR is unavailable in this browser; using the WebGL XR backend.", {
                webGpuSupported,
                immersiveArSupported,
                webGpuXrSupported
            });
        }
    }

    return new Engine(canvas, false, {
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
}

async function startApplication(): Promise<void> {
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    document.body.appendChild(canvas);

    const engine = await createRenderingEngine(canvas);

    try {
        const runtime = await BaseRuntime.Create({
            canvas,
            engine,
            sceneBuilder: new SceneBuilder()
        });
        runtime.run();
    } catch (error) {
        engine.dispose();
        console.error("Failed to initialize the MMD WebXR scene.", error);

        const errorMessage = document.createElement("pre");
        errorMessage.style.whiteSpace = "pre-wrap";
        errorMessage.style.padding = "1rem";
        errorMessage.textContent = error instanceof Error ? error.message : String(error);
        document.body.appendChild(errorMessage);
    }
}

window.onload = (): void => {
    void startApplication();
};
