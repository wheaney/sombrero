#!/bin/bash
set -e

wget https://github.com/wheaney/reshadefx-codegen/releases/latest/download/glslcodegen
chmod +x glslcodegen

mkdir includes
pushd includes
wget https://raw.githubusercontent.com/crosire/reshade-shaders/slim/Shaders/ReShade.fxh
wget https://raw.githubusercontent.com/crosire/reshade-shaders/slim/Shaders/ReShadeUI.fxh
popd

./glslcodegen ./includes/ /sombrero/IMUAdjust.fx /sombrero/glsl/IMUAdjust.frag
./glslcodegen ./includes/ /sombrero/Sideview.fx /sombrero/glsl/Sideview.frag