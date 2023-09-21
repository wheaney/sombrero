// ReShade shader to translate, rotate, zoom, and crop an image
#include "ReShade.fxh"

uniform float g_imu_orientation_yaw < source = "imu_orientation_yaw"; defaultValue=0.0; >;
uniform float g_imu_orientation_pitch < source = "imu_orientation_pitch"; defaultValue=0.0; >;
uniform float g_imu_orientation_roll < source = "imu_orientation_roll"; defaultValue=0.0; >;
uniform float g_display_res_w < source = "display_res_w"; defaultValue=1920.0; >;
uniform float g_display_res_h < source = "display_res_h"; defaultValue=1080.0; >;
uniform float g_display_fov < source = "display_fov"; defaultValue=37.0; >;
uniform float g_zoom < source = "zoom"; defaultValue=1.0; >;
uniform float g_disabled < source = "disabled"; defaultValue=1.0; >;

void PS_IMU_Transform(float4 pos : SV_Position, float2 texcoord : TexCoord, out float4 color : SV_Target)
{
    if (g_disabled != 0.0) {
        color = tex2D(ReShade::BackBuffer, texcoord);
        return;
    }

    // Calculate the center of the image
    float2 center = float2(0.5f, 0.5f);
    texcoord -= center;

    // Apply aspect ratio
    float aspect_ratio = ReShade::ScreenSize.x / ReShade::ScreenSize.y;
    texcoord.y /= aspect_ratio;

    // Rotate the image
    float imu_z_radians = -g_imu_orientation_roll * 3.1415926 / 180;
    texcoord = float2(
        texcoord.x * cos(imu_z_radians) - texcoord.y * sin(imu_z_radians),
        texcoord.x * sin(imu_z_radians) + texcoord.y * cos(imu_z_radians)
    );

    // Revert aspect ratio
    texcoord.y *= aspect_ratio;

    // Translate the image
    float vertical_fov = g_display_fov / aspect_ratio;
    texcoord.x += g_imu_orientation_yaw / g_display_fov;
    texcoord.y += g_imu_orientation_pitch / vertical_fov;

    // Apply zoom and adjust for screen size vs display size
    texcoord = texcoord / float2(g_zoom * ReShade::ScreenSize.x / g_display_res_w, g_zoom * ReShade::ScreenSize.y / g_display_res_h);
    texcoord += center;

    // Get the original pixel color or black if outside original image
    if (texcoord.x < 0 || texcoord.y < 0 || texcoord.x > 1 || texcoord.y > 1 || texcoord.x <= 0.005 && texcoord.y <= 0.005)
        color = float4(0, 0, 0, 1);
    else
        color = tex2D(ReShade::BackBuffer, texcoord);

    // Crop the image
    if (texcoord.x < 0 || texcoord.y < 0 || texcoord.x > g_display_res_w / ReShade::ScreenSize.x || texcoord.y > g_display_res_h / ReShade::ScreenSize.y)
        discard;
}

technique Transform < enabled = true; >
{
    pass
    {
        VertexShader = PostProcessVS;
        PixelShader = PS_IMU_Transform;
    }
}
