import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Scene } from "@babylonjs/core/scene";

export interface ISceneBuilder {
    build(canvas: HTMLCanvasElement, engine: AbstractEngine): Scene | Promise<Scene>;
}

export interface BaseRuntimeInitParams {
    canvas: HTMLCanvasElement;
    engine: AbstractEngine;
    sceneBuilder: ISceneBuilder;
}

export class BaseRuntime {
    private readonly _canvas: HTMLCanvasElement;
    private readonly _engine: AbstractEngine;
    private _scene: Scene;
    private _onTick: () => void;

    private constructor(params: BaseRuntimeInitParams) {
        this._canvas = params.canvas;
        this._engine = params.engine;

        this._scene = null!;
        this._onTick = null!;
    }

    public static async Create(params: BaseRuntimeInitParams): Promise<BaseRuntime> {
        const runtime = new BaseRuntime(params);
        runtime._scene = await runtime._initialize(params.sceneBuilder);
        runtime._onTick = runtime._makeOnTick();
        return runtime;
    }

    public run(): void {
        const engine = this._engine;

        window.addEventListener("resize", this._onResize);
        document.addEventListener("visibilitychange", this._onVisibilityChange);
        engine.runRenderLoop(this._onTick);
    }

    public dispose(): void {
        window.removeEventListener("resize", this._onResize);
        document.removeEventListener("visibilitychange", this._onVisibilityChange);
        this._engine.dispose();
    }

    private readonly _onResize = (): void => {
        this._engine.resize();
    };

    private readonly _onVisibilityChange = (): void => {
        // Pause the render loop while hidden to save GPU/battery/thermals.
        if (document.hidden) {
            this._engine.stopRenderLoop(this._onTick);
        } else {
            this._engine.runRenderLoop(this._onTick);
        }
    };

    private async _initialize(sceneBuilder: ISceneBuilder): Promise<Scene> {
        return await sceneBuilder.build(this._canvas, this._engine);
    }

    private _makeOnTick(): () => void {
        const scene = this._scene;
        return () => scene.render();
    }
}
