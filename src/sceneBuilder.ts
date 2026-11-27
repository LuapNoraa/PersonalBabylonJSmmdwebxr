// Keep the loader and runtime side effects required by BPMX and BVMD assets.
import "@babylonjs/core/Loading/loadingScreen";
import "@babylonjs/core/Helpers/sceneHelpers";
import "babylon-mmd/esm/Loader/Optimized/bpmxLoader";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeCameraAnimation";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation";
import "@babylonjs/loaders";

import { AdvancedDynamicTexture, Control, TextBlock } from "@babylonjs/gui/2D";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import type { BpmxLoader } from "babylon-mmd/esm/Loader/Optimized/bpmxLoader";
import { BvmdLoader } from "babylon-mmd/esm/Loader/Optimized/bvmdLoader";
import { StreamAudioPlayer } from "babylon-mmd/esm/Runtime/Audio/streamAudioPlayer";
import { MmdCamera } from "babylon-mmd/esm/Runtime/mmdCamera";
import type { MmdMesh } from "babylon-mmd/esm/Runtime/mmdMesh";
import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { MmdPlayerControl } from "babylon-mmd/esm/Runtime/Util/mmdPlayerControl";

import type { ISceneBuilder } from "./baseRuntime";

export class SceneBuilder implements ISceneBuilder {
    public async build(_canvas: HTMLCanvasElement, engine: AbstractEngine): Promise<Scene> {
        const bpmxLoader = SceneLoader.GetPluginForExtension(".bpmx") as BpmxLoader;
        bpmxLoader.loggingEnabled = false;

        const scene = new Scene(engine);
        // A solid black clear is inexpensive on Quest and is replaced by transparent
        // clearing while the immersive AR session is active.
        scene.clearColor = new Color4(0, 0, 0, 1);

        const mmdRoot = new TransformNode("mmdRoot", scene);
        mmdRoot.position.z = 20;

        // Keep the animated MMD camera for the authored dance camera motion.
        const mmdCamera = new MmdCamera("mmdCamera", new Vector3(0, 10, 0), scene);
        mmdCamera.maxZ = 300;
        mmdCamera.minZ = 1;
        mmdCamera.parent = mmdRoot;

        // Retain a simple fallback camera for the non-XR preview and double-click switch.
        const camera = new ArcRotateCamera("arcRotateCamera", 0, 0, 45, new Vector3(0, 10, 1), scene);
        camera.maxZ = 1000;
        camera.minZ = 0.1;
        camera.setPosition(new Vector3(0, 10, -45));
        camera.attachControl(_canvas, false);
        camera.inertia = 0.8;
        camera.speed = 4;

        const hemisphericLight = new HemisphericLight("HemisphericLight", new Vector3(0, 1, 0), scene);
        hemisphericLight.intensity = 0.9;
        hemisphericLight.specular = new Color3(0, 0, 0);
        hemisphericLight.groundColor = new Color3(0.6, 0.6, 0.6);

        // Physics is deliberately disabled for the Quest performance baseline.
        // Hair, skirt and cloth movement should be baked into the animation offline
        // before re-enabling a runtime physics backend.
        const mmdRuntime = new MmdRuntime(scene, null);
        mmdRuntime.loggingEnabled = false;
        mmdRuntime.register(scene);

        const audioPlayer = new StreamAudioPlayer(scene);
        audioPlayer.preservesPitch = false;
        audioPlayer.source = "res/private_test/motion/melancholy_night/melancholy_night.mp3";
        mmdRuntime.setAudioPlayer(audioPlayer);

        const mmdPlayerControl = new MmdPlayerControl(scene, mmdRuntime, audioPlayer);
        mmdPlayerControl.showPlayerControl();

        engine.displayLoadingUI();

        const loadingTexts: string[] = [];
        const updateLoadingText = (updateIndex: number, text: string): void => {
            loadingTexts[updateIndex] = text;
            engine.loadingUIText = "<br/><br/><br/><br/>" + loadingTexts.join("<br/><br/>");
        };

        const bvmdLoader = new BvmdLoader(scene);
        bvmdLoader.loggingEnabled = false;

        const motionPromise = bvmdLoader.loadAsync(
            "motion",
            "res/private_test/motion/melancholy_night/motion.bvmd",
            (event) => updateLoadingText(
                0,
                "Loading motion... " + event.loaded + "/" + event.total + " (" +
                    Math.floor((event.loaded * 100) / event.total) + "%)"
            )
        );

        const modelPromise = SceneLoader.ImportMeshAsync(
            undefined,
            "res/private_test/model/",
            "YYB Hatsune Miku_10th.bpmx",
            scene,
            (event) => updateLoadingText(
                1,
                "Loading model... " + event.loaded + "/" + event.total + " (" +
                    Math.floor((event.loaded * 100) / event.total) + "%)"
            )
        );

        const [mmdAnimation, { meshes: [modelMesh] }] = await Promise.all([motionPromise, modelPromise]);
        if (!((_mmdAnimation: unknown): _mmdAnimation is MmdAnimation => true)(mmdAnimation)) {
            throw new Error("The MMD motion could not be loaded.");
        }
        if (!((_mesh: unknown): _mesh is MmdMesh => true)(modelMesh)) {
            throw new Error("The MMD model could not be loaded.");
        }

        scene.onAfterRenderObservable.addOnce(() => engine.hideLoadingUI());

        mmdRuntime.setCamera(mmdCamera);
        mmdCamera.addAnimation(mmdAnimation);
        mmdCamera.setAnimation("motion");

        modelMesh.parent = mmdRoot;

        const mmdModel = mmdRuntime.createMmdModel(modelMesh, { buildPhysics: false });
        mmdModel.addAnimation(mmdAnimation);
        mmdModel.setAnimation("motion");
        // Preserve playback in the desktop preview; XR entry also re-syncs playback.
        mmdRuntime.playAnimation();

        // This scene has no picking-based gameplay. Avoid pointer picking, but keep
        // normal frustum culling and all animated bone/world-matrix updates intact.
        for (const mesh of modelMesh.metadata.meshes) {
            mesh.isPickable = false;
        }
        modelMesh.isPickable = false;
        scene.skipPointerMovePicking = true;
        scene.skipPointerDownPicking = true;
        scene.skipPointerUpPicking = true;

        // A second, UI-only camera keeps the existing credit overlay available.
        const guiCamera = new ArcRotateCamera(
            "GUICamera",
            Math.PI / 2 + Math.PI / 7,
            Math.PI / 2,
            100,
            new Vector3(0, 20, 0),
            scene
        );
        guiCamera.layerMask = 0x10000000;
        scene.activeCameras = [mmdCamera, guiCamera];

        // Switch between the authored MMD camera and the simple preview camera.
        let lastClickTime = -Infinity;
        _canvas.onclick = (): void => {
            const currentTime = performance.now();
            if (500 < currentTime - lastClickTime) {
                lastClickTime = currentTime;
                return;
            }
            lastClickTime = -Infinity;

            if (scene.activeCameras[0] === mmdCamera) {
                scene.activeCameras = [camera, guiCamera];
            } else {
                scene.activeCameras = [mmdCamera, guiCamera];
            }
        };

        // AR does not need teleportation, a shadow floor, or a reflection plane.
        const webXrExperience = await scene.createDefaultXRExperienceAsync({
            uiOptions: {
                sessionMode: "immersive-ar",
                referenceSpaceType: "local-floor"
            },
            disableTeleportation: true,
            disableNearInteraction: true,
            disableHandTracking: true
        });

        if (webXrExperience.baseExperience !== undefined) {
            const sessionManager = webXrExperience.baseExperience.sessionManager;
            sessionManager.worldScalingFactor = 15;

            sessionManager.onXRSessionInit.add((session) => {
                scene.clearColor = new Color4(0, 0, 0, 0);
                mmdRuntime.playAnimation();
                scene.activeCameras = [webXrExperience.baseExperience.camera, guiCamera];

                // Quest Browser commonly starts at 72Hz. Request 72Hz explicitly
                // when the WebXR session exposes the frame-rate control API.
                const xrSession = session as unknown as {
                    supportedFrameRates?: ArrayLike<number>;
                    updateTargetFrameRate?: (frameRate: number) => Promise<void>;
                };

                if (xrSession?.supportedFrameRates && xrSession.updateTargetFrameRate) {
                    const targetRate = Array.from(xrSession.supportedFrameRates)
                        .find((rate) => Math.abs(rate - 72) < 0.01);

                    if (targetRate !== undefined) {
                        void xrSession.updateTargetFrameRate(targetRate).catch((error: unknown) => {
                            console.warn("Unable to request 72Hz WebXR refresh rate.", error);
                        });
                    }
                }
            });

            sessionManager.onXRSessionEnded.add(() => {
                scene.clearColor = new Color4(0, 0, 0, 1);
                if (scene.activeCameras[0] === mmdCamera) {
                    scene.activeCameras = [camera, guiCamera];
                } else {
                    scene.activeCameras = [mmdCamera, guiCamera];
                }
            });
        }

        const advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI(
            "UI",
            true,
            scene,
            Texture.BILINEAR_SAMPLINGMODE,
            true
        );
        advancedTexture.layer!.layerMask = 0x10000000;

        const textblock = new TextBlock();
        textblock.widthInPixels = 500;
        textblock.heightInPixels = 150;
        textblock.left = 10;
        textblock.text = "メランコリ・ナイト / melancholy night feat.初音ミク\n\nMusic & Lyrics by higma\nMotion by ほうき堂\nModel: YYB Hatsune Miku 10th by YYB";
        textblock.fontSize = 20;
        textblock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        textblock.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        textblock.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        textblock.color = "black";
        advancedTexture.addControl(textblock);

        return scene;
    }
}
