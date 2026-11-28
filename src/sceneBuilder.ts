// for use loading screen, we need to import following module.
import "@babylonjs/core/Loading/loadingScreen";
// for use WebXR we need to import following two modules.
import "@babylonjs/core/Helpers/sceneHelpers";
import "@babylonjs/core/Materials/Node/Blocks";
// WebGPU-backed WebXR requires the WebXR Layers feature to be registered.
import "@babylonjs/core/XR/features/WebXRLayers.js";
// if your model has .tga texture, uncomment following line.
// import "@babylonjs/core/Materials/Textures/Loaders/tgaTextureLoader";
// for load .bpmx file, we need to import following module.
import "babylon-mmd/esm/Loader/Optimized/bpmxLoader";
// if you want to use .pmx file, uncomment following line.
// import "babylon-mmd/esm/Loader/pmxLoader";
// if you want to use .pmd file, uncomment following line.
// import "babylon-mmd/esm/Loader/pmdLoader";
// for play `MmdAnimation` we need to import following two modules.
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeCameraAnimation";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation";
import "@babylonjs/loaders";
import "babylon-mmd/esm/Loader/mmdModelLoader";

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { LoadAssetContainerAsync} from "@babylonjs/core/Loading/sceneLoader";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { RegisterColorCurves } from "@babylonjs/core/pure";
import { Scene } from "@babylonjs/core/scene";
import { WebXRFeatureName } from "@babylonjs/core/XR/webXRFeaturesManager";
import { WebXRSessionManager } from "@babylonjs/core/XR/webXRSessionManager";
// import { ShowInspector } from "@babylonjs/inspector";
import { GetMmdWasmInstance, MmdWasmInstanceTypeMR, MmdWasmRuntime } from "babylon-mmd";
import type { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import { MmdStandardMaterialBuilder } from "babylon-mmd/esm/Loader/mmdStandardMaterialBuilder";
import { BvmdLoader } from "babylon-mmd/esm/Loader/Optimized/bvmdLoader";
// import { SdefInjector } from "babylon-mmd/esm/Loader/sdefInjector";
import { StreamAudioPlayer } from "babylon-mmd/esm/Runtime/Audio/streamAudioPlayer";
import { MmdCamera } from "babylon-mmd/esm/Runtime/mmdCamera";
import type { MmdMesh } from "babylon-mmd/esm/Runtime/mmdMesh";
import { MmdStandardMaterialProxy } from
    "babylon-mmd/esm/Runtime/mmdStandardMaterialProxy";
import { MmdPlayerControl } from "babylon-mmd/esm/Runtime/Util/mmdPlayerControl";

import type { ISceneBuilder } from "./baseRuntime";
import { PerformanceProfiler } from "./performanceProfiler";
import {
    installWorldSpaceMmdSphereMap,
    type MmdSphereMapMode,
    setMmdSphereMapMode} from "./worldSpaceMmdSphereMap";

export class SceneBuilder implements ISceneBuilder {
    public async build(canvas: HTMLCanvasElement, engine: AbstractEngine): Promise<Scene> {
        // for apply SDEF on shadow, outline, depth rendering
        // SdefInjector.OverrideEngineCreateEffect(engine);

        RegisterColorCurves();

        const scene = new Scene(engine);
        scene.clearColor = new Color4(0.95, 0.95, 0.95, 1.0);
        (window as Window & { debugScene?: Scene }).debugScene = scene;

        // ShowInspector(scene);


        const mmdRoot = new TransformNode("mmdRoot", scene);
        mmdRoot.position.z = 2.5;

        // mmd camera for play mmd camera animation
        const mmdCamera = new MmdCamera("mmdCamera", new Vector3(0, 10, 0), scene);
        mmdCamera.maxZ = 300;
        mmdCamera.minZ = 1;
        mmdCamera.parent = mmdRoot;

        // optional manual orbit camera (kept for desktop preview; not active by default)
        const camera = new ArcRotateCamera("arcRotateCamera", 0, 0, 45, new Vector3(0, 10, 1), scene);
        camera.parent = mmdRoot;
        camera.maxZ = 1000;
        camera.minZ = 0.1;
        camera.setPosition(new Vector3(0, 10, -45));
        camera.attachControl(canvas, false);
        camera.inertia = 0.8;
        camera.speed = 4;

        const hemisphericLight = new HemisphericLight("HemisphericLight", new Vector3(0, 1, 0), scene);
        hemisphericLight.intensity = 0.4;
        hemisphericLight.specular = new Color3(0, 0, 0);
        hemisphericLight.groundColor = new Color3(1, 1, 1);

        const directionalLight = new DirectionalLight("DirectionalLight", new Vector3(0.5, -1, 1), scene);
        directionalLight.intensity = 0.6;
        directionalLight.shadowEnabled = false;

        // create mmd runtime (physics intentionally disabled for performance)
        const wasmInstance = await GetMmdWasmInstance(new MmdWasmInstanceTypeMR());
        const mmdRuntime = new MmdWasmRuntime(wasmInstance, scene);
        mmdRuntime.register(scene);

        // set audio player (XR entry music)
        const audioPlayer = new StreamAudioPlayer(scene);
        audioPlayer.preservesPitch = false;
        // you need to get this file by yourself from https://youtu.be/y__uZETTuL8
        audioPlayer.source = "res/private_test/motion/melancholy_night/melancholy_night.mp3";
        mmdRuntime.setAudioPlayer(audioPlayer);

        // create youtube like player control
        const mmdPlayerControl = new MmdPlayerControl(scene, mmdRuntime, audioPlayer);
        mmdPlayerControl.showPlayerControl();

        // show loading screen
        engine.displayLoadingUI();

        const loadingTexts: string[] = [];
        const updateLoadingText = (updateIndex: number, text: string): void => {
            loadingTexts[updateIndex] = text;
            engine.loadingUIText = "<br/><br/><br/><br/>" + loadingTexts.join("<br/><br/>");
        };

        const materialBuilder = new MmdStandardMaterialBuilder();
        materialBuilder.loadOutlineRenderingProperties = (): void => {};
        await installWorldSpaceMmdSphereMap(engine.isWebGPU);
        const promises: Promise<any>[] = [];

        // for load .bvmd file, we use BvmdLoader. if you want to load .vmd or .vpd file, use VmdLoader / VpdLoader
        const bvmdLoader = new BvmdLoader(scene);

        // you need to get this file by yourself from https://www.nicovideo.jp/watch/sm41164308
        promises.push(bvmdLoader.loadAsync("motion", "res/private_test/motion/melancholy_night/motion.bvmd",
            (event) => updateLoadingText(0, `Loading motion... ${event.loaded}/${event.total} (${Math.floor(event.loaded * 100 / event.total)}%)`))
        );

        promises.push(
            LoadAssetContainerAsync(
                "res/private_test/model/YYB Hatsune Miku_NT_1.0ver.bpmx",
                scene,
                {
                    onProgress: (event) => {
                        updateLoadingText(
                            1,
                            `Loading model... ${event.loaded}/${event.total} (${Math.floor(event.loaded * 100 / event.total)}%)`
                        );
                    },
                    pluginOptions: {
                        mmdmodel: {
                            materialBuilder
                        }
                    }
                }
            ).then((container) => {
                container.addAllToScene();
                return container;
            })
        );

        // wait for all promises. parallel loading is faster than sequential loading.
        const [mmdAnimation, { meshes: [modelMesh] }] = await Promise.all(promises);
        if (!((_mmdAnimation: any): _mmdAnimation is MmdAnimation => true)(mmdAnimation)) throw new Error("unreachable");
        if (!((_mesh: any): _mesh is MmdMesh => true)(modelMesh)) throw new Error("unreachable");

        // hide loading screen
        scene.onAfterRenderObservable.addOnce(() => engine.hideLoadingUI());

        const cameraAnimationHandle = mmdCamera.createRuntimeAnimation(mmdAnimation);
        mmdCamera.setRuntimeAnimation(cameraAnimationHandle);
        mmdRuntime.addAnimatable(mmdCamera);

        {
            modelMesh.parent = mmdRoot;

            const mmdModel = mmdRuntime.createMmdModel(modelMesh, {
                trimMetadata: false,
                buildPhysics: false,
                materialProxyConstructor: MmdStandardMaterialProxy
            });
            const modelAnimationHandle = mmdModel.createRuntimeAnimation(mmdAnimation);
            mmdModel.setRuntimeAnimation(modelAnimationHandle);

            // make sure directional light follow the model
            const bodyBone = mmdModel.runtimeBones.find((bone) => bone.name === "センター");
            const boneWorldMatrix = new Matrix();

            let frameCounter = 0;
            scene.onBeforeRenderObservable.add(() => {
                if ((frameCounter += 1) & 1) return;
                bodyBone!.getWorldMatrixToRef(boneWorldMatrix).multiplyToRef(modelMesh.getWorldMatrix(), boneWorldMatrix);
                boneWorldMatrix.getTranslationToRef(directionalLight.position);
                directionalLight.position.y -= 10;
            });
        }

        // optimize scene when all assets are loaded (unstable)
        scene.onAfterRenderObservable.addOnce(() => {
            scene.freezeMaterials();

            const meshes = scene.meshes;
            for (let i = 0, len = meshes.length; i < len; ++i) {
                const mesh = meshes[i];
                mesh.doNotSyncBoundingInfo = true;
                mesh.isPickable = false;
                mesh.alwaysSelectAsActiveMesh = true;
            }

            scene.skipPointerMovePicking = true;
            scene.skipPointerDownPicking = true;
            scene.skipPointerUpPicking = true;
            scene.skipFrustumClipping = true;
            scene.blockMaterialDirtyMechanism = true;
        });

        scene.activeCameras = [mmdCamera];

        let immersiveArActive = false;
        let activeView: "mmdCamera" | "camera" = "mmdCamera";

        let cameraToggleButton: HTMLButtonElement | null = null;
        let sphereMapSelect: HTMLSelectElement | null = null;

        // WebXR experience for AR
        const immersiveArSupported =
            await WebXRSessionManager.IsSessionSupportedAsync("immersive-ar");

        if (immersiveArSupported) {
            try {
                const webXrExperience = await scene.createDefaultXRExperienceAsync({
                    uiOptions: {
                        sessionMode: "immersive-ar",
                        referenceSpaceType: "local-floor"
                    },
                    outputCanvasOptions: {
                        canvasOptions: {
                            framebufferScaleFactor: 1,
                            antialias: true,
                            alpha: true,
                            depth: true,
                            stencil: false
                        }
                    }
                });

                console.info("[WebXR] Immersive AR initialized.");

                const featuresManager =
                    webXrExperience.baseExperience.featuresManager;

                // Enable XR Layers (required for the WebGPU XR path).
                featuresManager.enableFeature(WebXRFeatureName.LAYERS, "latest");

                const sessionManager =
                    webXrExperience.baseExperience.sessionManager;

                sessionManager.worldScalingFactor = 12.5;

                sessionManager.onXRSessionInit.add(() => {
                    immersiveArActive = true;
                    cameraToggleButton.hidden = true;
                    setMmdSphereMapMode("world-anchored");

                    scene.clearColor = new Color4(0, 0, 0, 0);

                    if (sessionManager.isFixedFoveationSupported) {
                        sessionManager.fixedFoveation = 1;
                    }

                    window.mmdProfiler = new PerformanceProfiler(scene);

                    mmdRuntime.playAnimation();

                    scene.activeCameras = [
                        webXrExperience.baseExperience.camera
                    ];
                });

                sessionManager.onXRSessionEnded.add(() => {

                    immersiveArActive = false;

                    cameraToggleButton.hidden = false;

                    scene.clearColor = new Color4(0.95, 0.95, 0.95, 1.0);
                    window.mmdProfiler?.exportCsv();
                    window.mmdProfiler?.dispose();

                    scene.activeCameras = [mmdCamera];
                });

            } catch (error) {
                console.warn(
                    "[WebXR] AR initialization failed; continuing without XR.",
                    error
                );
            }
        } else {
            console.info(
                "[WebXR] Immersive AR unavailable; continuing without XR."
            );
        }

        // Desktop camera selector
        cameraToggleButton = document.createElement("button");
        cameraToggleButton.textContent = activeView;
        cameraToggleButton.style.position = "fixed";
        cameraToggleButton.style.top = "10px";
        cameraToggleButton.style.right = "10px";
        cameraToggleButton.style.zIndex = "1000";
        cameraToggleButton.style.padding = "6px 10px";
        cameraToggleButton.style.background = "rgba(0, 0, 0, 0.2)";
        cameraToggleButton.style.color = "#fff";
        cameraToggleButton.style.border = "1px solid rgba(255,255,255,0.6)";
        cameraToggleButton.style.borderRadius = "4px";
        cameraToggleButton.style.cursor = "pointer";

        cameraToggleButton.addEventListener("click", () => {
            if (immersiveArActive) return;

            activeView =
                activeView === "mmdCamera" ? "camera" : "mmdCamera";

            scene.activeCameras = [
                activeView === "mmdCamera" ? mmdCamera : camera
            ];

            cameraToggleButton!.textContent = activeView;
        });

        document.body.appendChild(cameraToggleButton);

        // Sphere-map selector
        sphereMapSelect = document.createElement("select");
        sphereMapSelect.setAttribute("aria-label", "MMD sphere-map mode");

        sphereMapSelect.style.position = "fixed";
        sphereMapSelect.style.top = "48px";
        sphereMapSelect.style.right = "10px";
        sphereMapSelect.style.zIndex = "1000";
        sphereMapSelect.style.padding = "6px 8px";
        sphereMapSelect.style.background = "rgba(0, 0, 0, 0.75)";
        sphereMapSelect.style.color = "#fff";
        sphereMapSelect.style.border = "1px solid rgba(255,255,255,0.6)";
        sphereMapSelect.style.borderRadius = "4px";
        sphereMapSelect.style.cursor = "pointer";

        const sphereMapOptions: {
            value: MmdSphereMapMode;
            label: string;
        }[] = [
            {
                value: "camera-relative",
                label: "Camera-relative"
            },
            {
                value: "world-space normal mapping",
                label: "Sticker when Miku is not moving"
            },
            {
                value: "world-anchored",
                label: "World-anchored"
            }
        ];

        for (const optionData of sphereMapOptions) {
            const option = document.createElement("option");
            option.value = optionData.value;
            option.textContent = optionData.label;
            sphereMapSelect.appendChild(option);
        }

        sphereMapSelect.value = "world-space normal mapping";
        setMmdSphereMapMode("world-space normal mapping");

        sphereMapSelect.addEventListener("change", () => {
            const selectedMode =
                sphereMapSelect!.value as MmdSphereMapMode;

            setMmdSphereMapMode(selectedMode);

            console.info(
                `[SphereMap] Mode changed to: ${selectedMode}`
            );
        });

        document.body.appendChild(sphereMapSelect);

        return scene;
    }
}
