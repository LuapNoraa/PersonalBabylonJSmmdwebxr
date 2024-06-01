// for use loading screen, we need to import following module.
import "@babylonjs/core/Loading/loadingScreen";
// for cast shadow, we need to import following module.
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
// for use WebXR we need to import following two modules.
import "@babylonjs/core/Helpers/sceneHelpers";
import "@babylonjs/core/Materials/Node/Blocks";
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

import { ImageProcessingConfiguration, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, Texture, WebXRLayers, WebXRMeshDetector } from "@babylonjs/core";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { Scene } from "@babylonjs/core/scene";
import { AdvancedDynamicTexture, Control, TextBlock } from "@babylonjs/gui/2D";
import havokPhysics from "@babylonjs/havok";
import { Inspector } from "@babylonjs/inspector";
import { ShadowOnlyMaterial } from "@babylonjs/materials/shadowOnly/shadowOnlyMaterial";
import type { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import type { MmdStandardMaterialBuilder } from "babylon-mmd/esm/Loader/mmdStandardMaterialBuilder";
import type { BpmxLoader } from "babylon-mmd/esm/Loader/Optimized/bpmxLoader";
import { BvmdLoader } from "babylon-mmd/esm/Loader/Optimized/bvmdLoader";
import { SdefInjector } from "babylon-mmd/esm/Loader/sdefInjector";
// import { VmdLoader } from "babylon-mmd/esm/Loader/vmdLoader";
import { StreamAudioPlayer } from "babylon-mmd/esm/Runtime/Audio/streamAudioPlayer";
import { MmdCamera } from "babylon-mmd/esm/Runtime/mmdCamera";
import type { MmdMesh } from "babylon-mmd/esm/Runtime/mmdMesh";
import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { MmdPhysics } from "babylon-mmd/esm/Runtime/Physics/mmdPhysics";
import { MmdPlayerControl } from "babylon-mmd/esm/Runtime/Util/mmdPlayerControl";

import type { ISceneBuilder } from "./baseRuntime";


export class SceneBuilder implements ISceneBuilder {
    public async build(canvas: HTMLCanvasElement, engine: Engine): Promise<Scene> {
        // for apply SDEF on shadow, outline, depth rendering
        SdefInjector.OverrideEngineCreateEffect(engine);

        // get bpmx loader and set some configurations.
        const bpmxLoader = SceneLoader.GetPluginForExtension(".bpmx") as BpmxLoader;
        bpmxLoader.loggingEnabled = true;
        const materialBuilder = bpmxLoader.materialBuilder as MmdStandardMaterialBuilder;

        // if you want override texture loading, uncomment following lines.
        // materialBuilder.loadDiffuseTexture = (): void => { /* do nothing */ };
        // materialBuilder.loadSphereTexture = (): void => { /* do nothing */ };
        // materialBuilder.loadToonTexture = (): void => { /* do nothing */ };

        // if you need outline rendering, comment out following line.
        materialBuilder.loadOutlineRenderingProperties = (): void => { /* do nothing */ };

        const scene = new Scene(engine);
        scene.clearColor = new Color4(0.95, 0.95, 0.95, 1.0);

        const mmdRoot = new TransformNode("mmdRoot", scene);
        mmdRoot.position.z = 20;

        // mmd camera for play mmd camera animation
        const mmdCamera = new MmdCamera("mmdCamera", new Vector3(0, 10, 0), scene);
        mmdCamera.maxZ = 300;
        mmdCamera.minZ = 1;
        mmdCamera.parent = mmdRoot;

        const camera = new ArcRotateCamera("arcRotateCamera", 0, 0, 45, new Vector3(0, 10, 15), scene);
        camera.maxZ = 1000;
        camera.minZ = 0.1;
        // camera.setPosition(new Vector3(0, 10, -45));
        camera.attachControl(canvas, false);
        camera.inertia = 0.8;
        camera.speed = 4;

        // mmdCamera.viewport = new Viewport(0, 0, 1, 1);
        // camera.viewport = new Viewport(0.75, 0.75, 0.25, 0.25);
        // scene.activeCameras = [mmdCamera, camera];

        const hemisphericLight = new HemisphericLight("HemisphericLight", new Vector3(0, 1, 0), scene);
        hemisphericLight.intensity = 0.4;
        hemisphericLight.specular = new Color3(0, 0, 0);
        hemisphericLight.groundColor = new Color3(1, 1, 1);

        const directionalLight = new DirectionalLight("DirectionalLight", new Vector3(0.5, -1, 1), scene);
        directionalLight.intensity = 0.6;
        // set frustum size manually for optimize shadow rendering
        directionalLight.autoCalcShadowZBounds = false;
        directionalLight.autoUpdateExtends = false;
        directionalLight.shadowMaxZ = 20;
        directionalLight.shadowMinZ = -20;
        directionalLight.orthoTop = 18;
        directionalLight.orthoBottom = -3;
        directionalLight.orthoLeft = -10;
        directionalLight.orthoRight = 10;
        directionalLight.shadowOrthoScale = 0;

        const shadowGenerator = new ShadowGenerator(1024, directionalLight, true);
        shadowGenerator.usePercentageCloserFiltering = true;
        shadowGenerator.forceBackFacesOnly = true;
        shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
        shadowGenerator.frustumEdgeFalloff = 0.1;

        const ground = CreateGround("ground1", { width: 100, height: 100, subdivisions: 2, updatable: false }, scene);
        const shadowOnlyMaterial = ground.material = new ShadowOnlyMaterial("shadowOnly", scene);
        shadowOnlyMaterial.activeLight = directionalLight;
        shadowOnlyMaterial.alpha = 0.4;
        ground.receiveShadows = true;
        ground.parent = mmdRoot;

        // create mmd runtime with physics
        const mmdRuntime = new MmdRuntime(scene, new MmdPhysics(scene));
        // const mmdRuntime = new MmdRuntime(scene);
        mmdRuntime.loggingEnabled = true;
        mmdRuntime.register(scene);

        // set audio player
        const audioPlayer = new StreamAudioPlayer(scene);
        audioPlayer.preservesPitch = false;
        // you need to get this file by yourself from https://youtu.be/y__uZETTuL8
        audioPlayer.source = "res/private_test/motion/melancholy_night/melancholy_night.mp3";
        mmdRuntime.setAudioPlayer(audioPlayer);

        // play before loading. this will cause the audio to play first before all assets are loaded.
        // playing the audio first can help ease the user's patience
        // mmdRuntime.playAnimation();

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

        const promises: Promise<any>[] = [];

        // for load .bvmd file, we use BvmdLoader. if you want to load .vmd or .vpd file, use VmdLoader / VpdLoader
        const bvmdLoader = new BvmdLoader(scene);
        bvmdLoader.loggingEnabled = true;

        // you need to get this file by yourself from https://www.nicovideo.jp/watch/sm41164308
        promises.push(bvmdLoader.loadAsync("motion", "res/private_test/motion/melancholy_night/motion.bvmd",
            (event) => updateLoadingText(0, `Loading motion... ${event.loaded}/${event.total} (${Math.floor(event.loaded * 100 / event.total)}%)`))
        );

        // you need to get this file by yourself from https://www.deviantart.com/sanmuyyb/art/YYB-Hatsune-Miku-10th-DL-702119716
        promises.push(SceneLoader.ImportMeshAsync(
            undefined,
            "res/private_test/model/",
            "YYB Hatsune Miku_10th_v1.02_toonchange.bpmx",
            scene,
            (event) => updateLoadingText(1, `Loading model... ${event.loaded}/${event.total} (${Math.floor(event.loaded * 100 / event.total)}%)`),
            null,
            "importedmmdmodel"
        ));

        promises.push((async(): Promise<void> => {
            updateLoadingText(2, "Loading physics engine...");
            const havokInstance = await havokPhysics();
            const havokPlugin = new HavokPlugin(true, havokInstance);
            scene.enablePhysics(new Vector3(0, -9.8 * 0.75, 0), havokPlugin);
            updateLoadingText(2, "Loading physics engine... Done");
        })());

        // wait for all promises. parallel loading is faster than sequential loading.
        const [mmdAnimation, { meshes: [modelMesh] }] = await Promise.all(promises);
        if (!((_mmdAnimation: any): _mmdAnimation is MmdAnimation => true)(mmdAnimation)) throw new Error("unreachable");
        if (!((_mesh: any): _mesh is MmdMesh => true)(modelMesh)) throw new Error("unreachable");

        // hide loading screen
        scene.onAfterRenderObservable.addOnce(() => engine.hideLoadingUI());

        mmdRuntime.setCamera(mmdCamera);
        mmdCamera.addAnimation(mmdAnimation);
        mmdCamera.setAnimation("motion");

        {
            modelMesh.parent = mmdRoot;

            for (const mesh of modelMesh.metadata.meshes) mesh.receiveShadows = true;
            shadowGenerator.addShadowCaster(modelMesh);
            modelMesh.scaling.setAll(1 / 12.5);

            const mmdModel = mmdRuntime.createMmdModel(modelMesh);
            mmdModel.addAnimation(mmdAnimation);
            mmdModel.setAnimation("motion");

            // make sure directional light follow the model
            const bodyBone = mmdModel.runtimeBones.find((bone) => bone.name === "センター");
            const boneWorldMatrix = new Matrix();

            scene.onBeforeRenderObservable.add(() => {
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
                mesh.freezeWorldMatrix();
                mesh.doNotSyncBoundingInfo = true;
                mesh.isPickable = false;
                mesh.doNotSyncBoundingInfo = true;
                mesh.alwaysSelectAsActiveMesh = true;
            }

            scene.skipPointerMovePicking = true;
            scene.skipPointerDownPicking = true;
            scene.skipPointerUpPicking = true;
            scene.skipFrustumClipping = true;
            scene.blockMaterialDirtyMechanism = true;
        });

        // if you want ground collision, uncomment following lines.
        const groundRigidBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, true, scene);
        groundRigidBody.shape = new PhysicsShapeBox(
            new Vector3(0, -1, 0),
            new Quaternion(),
            new Vector3(100, 2, 100), scene);

        // setting camera gui for text credits to be excluded on post processing
        const guiCamera = new ArcRotateCamera("GUICamera", Math.PI / 2 + Math.PI / 7, Math.PI / 2, 100, new Vector3(0, 20, 0), scene);
        guiCamera.layerMask = 0x10000000;
        scene.activeCameras = [mmdCamera, guiCamera];

        // the text on the gui
        const advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI("UI", true, scene, Texture.BILINEAR_SAMPLINGMODE, true);
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

        // switch camera when double click
        let animatedCamera = true;
        let lastClickTime = -Infinity;
        canvas.onclick = (): void => {
            const currentTime = performance.now();
            if (500 < currentTime - lastClickTime) {
                lastClickTime = currentTime;
                return;
            }

            lastClickTime = -Infinity;

            if (animatedCamera) {
                scene.activeCameras = [camera, guiCamera];
                animatedCamera = false;
            } else {
                scene.activeCameras = [mmdCamera, guiCamera];
                animatedCamera = true;
            }
        };

        // if you want to use inspector, uncomment following line.
        Inspector.Show(scene, { });

        mmdRuntime.seekAnimation(0, true);

        const defaultPipeline = new DefaultRenderingPipeline("default", true, scene, [mmdCamera, camera]);
        // defaultPipeline.samples = 4;
        defaultPipeline.bloomEnabled = true;
        defaultPipeline.chromaticAberrationEnabled = true;
        defaultPipeline.chromaticAberration.aberrationAmount = 1;
        defaultPipeline.fxaaEnabled = true;
        defaultPipeline.imageProcessingEnabled = true;
        defaultPipeline.imageProcessing.toneMappingEnabled = true;
        defaultPipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
        defaultPipeline.imageProcessing.vignetteWeight = 0.5;
        defaultPipeline.imageProcessing.vignetteStretch = 0.5;
        defaultPipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0);
        defaultPipeline.imageProcessing.vignetteEnabled = true;

        // webxr experience for AR
        const webXrExperience = await scene.createDefaultXRExperienceAsync({
            uiOptions: {
                sessionMode: "immersive-ar",
                referenceSpaceType: "local-floor"
            },
            floorMeshes: [ground] /* Array of meshes to be used as landing points */,
            teleportationOptions: {
                // Options to pass to the teleportation module
            }
        });


        if (webXrExperience.baseExperience !== undefined) {

            const featureManager = webXrExperience.baseExperience.featuresManager;
            const sessionManager = webXrExperience.baseExperience.sessionManager;

            featureManager.enableFeature(WebXRLayers, "latest", {
                preferMultiviewOnInit: false
            }, true, false);

            featureManager.enableFeature(WebXRMeshDetector, "latest", {
                doNotRemoveMeshesOnSessionEnded: false,
                generateMeshes: false}, true, false);

            sessionManager.onXRFrameObservable.addOnce(() => {
                defaultPipeline.addCamera(webXrExperience.baseExperience.camera);
            });

            // sessionManager.worldScalingFactor = 15;

            sessionManager.onXRSessionInit.add(() => {
                scene.clearColor = new Color4(0, 0, 0, 0);
                shadowOnlyMaterial.alpha = 0.2;
                mmdRuntime.playAnimation();
                scene.activeCameras = [webXrExperience.baseExperience.camera, guiCamera];
            });

            sessionManager.onXRSessionEnded.add(() => {
                scene.clearColor = new Color4(0.95, 0.95, 0.95, 1.0);
                shadowOnlyMaterial.alpha = 0.4;
                if (animatedCamera) {
                    scene.activeCameras = [camera, guiCamera];
                    animatedCamera = false;
                } else {
                    scene.activeCameras = [mmdCamera, guiCamera];
                    animatedCamera = true;
                }
            });

            const weXRmesh = new WebXRMeshDetector(sessionManager, {doNotRemoveMeshesOnSessionEnded: false, generateMeshes: true});

            weXRmesh.onMeshAddedObservable.add((meshData) => {
                meshData.mesh!.material = shadowOnlyMaterial;
                meshData.mesh!.receiveShadows = true;
            });

            // weXRmesh.onMeshUpdatedObservable.add((meshData) => {
            //     meshData.mesh!.material = shadowOnlyMaterial;
            //     meshData.mesh!.receiveShadows = true;

            // });

            if (weXRmesh.isCompatible()) {
                weXRmesh.attach(true);
            }
        }

        return scene;
    }
}
