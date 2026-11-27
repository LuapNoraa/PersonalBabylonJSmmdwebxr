
import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

type PerfSample = {
    timestamp: string;
    fps: number;
    frameMs: number;
    p95FrameMs: number;
    missed72Percent: number;
    renderMs: number;
    animationMs: number;
    physicsMs: number;
    activeMeshMs: number;
    gpuMs: number | null;
    drawCalls: number;
    activeMeshes: number;
};

export class PerformanceProfiler {
    private readonly _scene: Scene;
    private readonly _sceneInstrumentation: SceneInstrumentation;
    private readonly _engineInstrumentation: EngineInstrumentation;
    private readonly _frameTimes: number[] = [];
    private readonly _samples: PerfSample[] = [];
    private _lastFrameTime = 0;
    private _lastReportTime = 0;
    private _observer: Observer<Scene> | undefined;

    public constructor(scene: Scene) {
        this._scene = scene;

        this._sceneInstrumentation = new SceneInstrumentation(scene);
        this._sceneInstrumentation.captureFrameTime = true;
        this._sceneInstrumentation.captureRenderTime = true;
        this._sceneInstrumentation.captureInterFrameTime = true;
        this._sceneInstrumentation.captureAnimationsTime = true;
        this._sceneInstrumentation.capturePhysicsTime = true;
        this._sceneInstrumentation.captureActiveMeshesEvaluationTime = true;

        this._engineInstrumentation = new EngineInstrumentation(scene.getEngine());
        this._engineInstrumentation.captureGPUFrameTime = true;

        this._observer = scene.onAfterRenderObservable.add(() => this._onFrame());

        scene.onDisposeObservable.addOnce(() => this.dispose());

        console.info("[Profiler] Started. Export with window.mmdProfiler.exportCsv()");
    }

    private _onFrame(): void {
        const now = performance.now();

        if (this._lastFrameTime !== 0) {
            this._frameTimes.push(now - this._lastFrameTime);
        }

        this._lastFrameTime = now;

        if (this._lastReportTime === 0) {
            this._lastReportTime = now;
            return;
        }

        if (now - this._lastReportTime < 1000) return;

        const frameTimes = this._frameTimes;
        const sorted = [...frameTimes].sort((a, b) => a - b);
        const p95Index = Math.min(
            sorted.length - 1,
            Math.floor(sorted.length * 0.95)
        );

        const missedFrames = frameTimes.filter((time) => time > 1000 / 72).length;
        const gpuNanoseconds = this._engineInstrumentation.gpuFrameTimeCounter.current;

        const sample: PerfSample = {
            timestamp: new Date().toISOString(),
            fps: this._scene.getEngine().getFps(),
            frameMs: this._sceneInstrumentation.frameTimeCounter.current,
            p95FrameMs: sorted.length > 0 ? sorted[p95Index] : 0,
            missed72Percent: frameTimes.length > 0
                ? missedFrames * 100 / frameTimes.length
                : 0,
            renderMs: this._sceneInstrumentation.renderTimeCounter.current,
            animationMs: this._sceneInstrumentation.animationsTimeCounter.current,
            physicsMs: this._sceneInstrumentation.physicsTimeCounter.current,
            activeMeshMs: this._sceneInstrumentation.activeMeshesEvaluationTimeCounter.current,
            gpuMs: gpuNanoseconds > 0 ? gpuNanoseconds / 1_000_000 : null,
            drawCalls: this._sceneInstrumentation.drawCallsCounter.current,
            activeMeshes: this._scene.getActiveMeshes().length
        };

        this._samples.push(sample);
        console.info("[Profiler]", sample);

        this._frameTimes.length = 0;
        this._lastReportTime = now;
    }

    public exportCsv(): void {
        const columns: (keyof PerfSample)[] = [
            "timestamp", "fps", "frameMs", "p95FrameMs",
            "missed72Percent", "renderMs", "animationMs",
            "physicsMs", "activeMeshMs", "gpuMs",
            "drawCalls", "activeMeshes"
        ];

        const lines = [
            columns.join(","),
            ...this._samples.map((sample) =>
                columns.map((key) => sample[key] ?? "").join(",")
            )
        ];

        const blob = new Blob([lines.join("\n")], {
            type: "text/csv;charset=utf-8"
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "quest3-performance.csv";
        link.click();
        URL.revokeObjectURL(url);

        console.info(`[Profiler] Exported ${this._samples.length} samples.`);
    }

    public dispose(): void {
        if (this._observer !== undefined) {
            this._scene.onAfterRenderObservable.remove(this._observer);
            this._observer = undefined;
        }

        this._sceneInstrumentation.dispose();
        this._engineInstrumentation.dispose();
    }
}

declare global {
    interface Window {
        mmdProfiler?: PerformanceProfiler;
    }
}
