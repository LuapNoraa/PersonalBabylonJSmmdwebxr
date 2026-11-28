
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { Scene } from "@babylonjs/core/scene";

export type MmdSphereMapMode =
    | "camera-relative"
    | "world-space normal mapping"
    | "world-anchored";

type MmdPluginUniforms = {
    ubo?: { name: string; size: number; type: string }[];
    fragment?: string;
};

type MmdShaderPluginPrototype = {
    getCustomCode(shaderType: string): Record<string, string> | null;

    getUniforms(shaderLanguage?: ShaderLanguage): MmdPluginUniforms;

    bindForSubMesh(
        uniformBuffer: UniformBuffer,
        scene: Scene,
        engine: AbstractEngine,
        subMesh: SubMesh
    ): void;
};

let currentMode: MmdSphereMapMode = "camera-relative";

const patchedPrototypes = new WeakSet<object>();

function getModeValue(): number {
    switch (currentMode) {
    case "camera-relative":
        return 0;
    case "world-space normal mapping":
        return 1;
    case "world-anchored":
        return 2;
    }
}

export function setMmdSphereMapMode(mode: MmdSphereMapMode): void {
    currentMode = mode;
}

export function getMmdSphereMapMode(): MmdSphereMapMode {
    return currentMode;
}

function patchSphereMapShader(
    pluginPrototype: MmdShaderPluginPrototype,
    useWebGPU: boolean
): void {
    if (patchedPrototypes.has(pluginPrototype)) {
        return;
    }

    patchedPrototypes.add(pluginPrototype);

    const originalGetCustomCode = pluginPrototype.getCustomCode;

    pluginPrototype.getCustomCode = function(
        shaderType: string
    ): Record<string, string> | null {
        const code = originalGetCustomCode.call(this, shaderType);

        if (shaderType !== "fragment" || code === null) {
            return code;
        }

        const fragmentCode = code.CUSTOM_FRAGMENT_BEFORE_FOG;

        if (fragmentCode === undefined) {
            throw new Error(
                "[WorldSphereMap] MMD sphere-map insertion point not found."
            );
        }

        if (fragmentCode.includes("sphereMapMode")) {
            return code;
        }

        const glslPattern =
            /vec3\s+viewSpaceNormal\s*=\s*normalize\(mat3\(view\)\s*\*\s*vNormalW\)\s*;\s*vec2\s+sphereUV\s*=\s*viewSpaceNormal\.xy\s*\*\s*0\.5\s*\+\s*0\.5\s*;/;

        const wgslPattern =
            /var\s+viewSpaceNormal:\s*vec3f\s*=\s*normalize\(mat3x3f\(scene\.view\[0\]\.xyz,scene\.view\[1\]\.xyz,scene\.view\[2\]\.xyz\)\s*\*\s*fragmentInputs\.vNormalW\)\s*;\s*var\s+sphereUV:\s*vec2f\s*=\s*viewSpaceNormal\.xy\s*\*\s*0\.5\s*\+\s*0\.5\s*;/;

        const glslReplacement = `
            vec2 sphereUV = vec2(0.5);

            if (sphereMapMode < 0.5) {
                vec3 viewSpaceNormal = normalize(mat3(view) * vNormalW);
                sphereUV = viewSpaceNormal.xy * 0.5 + 0.5;
            } else if (sphereMapMode < 1.5) {
                vec3 worldSpaceNormal = normalize(vNormalW);
                sphereUV = worldSpaceNormal.xy * 0.5 + 0.5;
            } else {
                vec3 worldSpaceNormal = normalize(vNormalW);
                vec3 viewDirectionW = normalize(vEyePosition.xyz - vPositionW.xyz);
                vec3 reflectionDirectionW = reflect(-viewDirectionW, worldSpaceNormal);

                float sphereMapDenominator = 2.0 * sqrt(max(
                    dot(reflectionDirectionW.xy, reflectionDirectionW.xy) +
                    (reflectionDirectionW.z + 1.0) * (reflectionDirectionW.z + 1.0),
                    0.0001
                ));

                sphereUV = reflectionDirectionW.xy / sphereMapDenominator + 0.5;
            }
        `;

        const wgslReplacement = `
            var sphereUV: vec2f = vec2f(0.5, 0.5);

            if (uniforms.sphereMapMode < 0.5) {
                let viewSpaceNormal = normalize(
                    mat3x3f(scene.view[0].xyz, scene.view[1].xyz, scene.view[2].xyz) *
                    fragmentInputs.vNormalW
                );
                sphereUV = viewSpaceNormal.xy * 0.5 + 0.5;
            } else if (uniforms.sphereMapMode < 1.5) {
                let worldSpaceNormal = normalize(fragmentInputs.vNormalW);
                sphereUV = worldSpaceNormal.xy * 0.5 + 0.5;
            } else {
                let worldSpaceNormal = normalize(fragmentInputs.vNormalW);
                let viewDirectionW = normalize(
                    scene.vEyePosition.xyz - fragmentInputs.vPositionW
                );
                let reflectionDirectionW = reflect(-viewDirectionW, worldSpaceNormal);

                let sphereMapDenominator = 2.0 * sqrt(max(
                    dot(reflectionDirectionW.xy, reflectionDirectionW.xy) +
                    (reflectionDirectionW.z + 1.0) * (reflectionDirectionW.z + 1.0),
                    0.0001
                ));

                sphereUV = reflectionDirectionW.xy / sphereMapDenominator + 0.5;
            }
        `;

        if (useWebGPU && wgslPattern.test(fragmentCode)) {
            code.CUSTOM_FRAGMENT_BEFORE_FOG =
                fragmentCode.replace(wgslPattern, wgslReplacement);

            console.info(
                "[WorldSphereMap] Successfully installed three WGSL modes."
            );

            return code;
        }

        if (!useWebGPU && glslPattern.test(fragmentCode)) {
            code.CUSTOM_FRAGMENT_BEFORE_FOG =
                fragmentCode.replace(glslPattern, glslReplacement);

            console.info(
                "[WorldSphereMap] Successfully installed three GLSL modes."
            );

            return code;
        }

        console.warn(
            "[WorldSphereMap] Unrecognized sphere-map shader source. Patch skipped.",
            fragmentCode
        );

        return code;
    };

    const originalGetUniforms = pluginPrototype.getUniforms;

    pluginPrototype.getUniforms = function(
        shaderLanguage?: ShaderLanguage
    ): MmdPluginUniforms {
        const uniforms = originalGetUniforms.call(this, shaderLanguage);

        if (useWebGPU) {
            return {
                ...uniforms,
                ubo: [
                    ...(uniforms.ubo ?? []),
                    { name: "sphereMapMode", size: 1, type: "float" }
                ]
            };
        }

        return {
            ...uniforms,
            ubo: [
                ...(uniforms.ubo ?? []),
                { name: "sphereMapMode", size: 1, type: "float" }
            ],
            fragment:
                `${uniforms.fragment ?? ""}\nuniform float sphereMapMode;`
        };
    };

    const originalBindForSubMesh = pluginPrototype.bindForSubMesh;

    pluginPrototype.bindForSubMesh = function(
        uniformBuffer: UniformBuffer,
        scene: Scene,
        engine: AbstractEngine,
        subMesh: SubMesh
    ): void {
        originalBindForSubMesh.call(
            this,
            uniformBuffer,
            scene,
            engine,
            subMesh
        );

        const modeValue = getModeValue();

        uniformBuffer.updateFloat("sphereMapMode", modeValue);
    };
}

export async function installWorldSpaceMmdSphereMap(
    useWebGPU: boolean
): Promise<void> {
    if (useWebGPU) {
        const { MmdPluginMaterial: mmdPluginMaterial } = await import(
            "babylon-mmd/esm/Loader/ShadersWGSL/mmdStandard"
        );

        patchSphereMapShader(
            mmdPluginMaterial.prototype,
            true
        );
    } else {
        const { MmdPluginMaterial: mmdPluginMaterial } = await import(
            "babylon-mmd/esm/Loader/Shaders/mmdStandard"
        );

        patchSphereMapShader(
            mmdPluginMaterial.prototype,
            false
        );
    }

    console.info(
        `[WorldSphereMap] Installed. Current mode: ${currentMode}`
    );
}
