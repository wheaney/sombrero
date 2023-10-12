// ReShade shader to translate, rotate, zoom, and crop an image
#include "ReShade.fxh"

uniform float3x3 g_imu_data < source = "imu_data"; defaultValue=float3x3(
//  yaw,    pitch,  roll
    0.0,    0.0,    0.0, // positions
    0.0,    0.0,    0.0, // velocities
    0.0,    0.0,    0.0  // accelerations
); >;
uniform float2 g_look_ahead < source = "look_ahead_cfg"; defaultValue=float2(-10.0f, 2.6f); >;
uniform uint2 g_display_res < source = "display_res"; defaultValue=uint2(1920u, 1080u); >; // width, height
uniform float g_display_fov < source = "display_fov"; defaultValue=40.1; >;
uniform float g_zoom < source = "zoom"; defaultValue=1.0; >;
uniform bool g_disabled < source = "disabled"; defaultValue=true; >;
uniform float g_frametime < source = "averageframetime"; >;

// how much do the lenses swivel in relation to the perceived screen distance
// computed about 6 inches of radius vs about 12 ft of screen distance
uniform float g_lens_distance_ratio < source = "lens_distance_ratio"; defaultValue=0.04; >;

// cap at 60 ms look-ahead, beyond this it may get jittery and unusable
#define LOOK_AHEAD_MS_CAP 60.0
#define DEG_TO_RAD 3.14159/180

float degreesLookAhead(float gyro_position, float gyro_velocity, float gyro_accel, float t, float t_squared) {
    return gyro_position + gyro_velocity * t + 0.5 * gyro_accel * t_squared;
}

void PS_IMU_Transform(float4 pos : SV_Position, float2 texcoord : TexCoord, out float4 color : SV_Target)
{
    if (g_disabled) {
        color = tex2D(ReShade::BackBuffer, texcoord);
        return;
    }

    float look_ahead_ms = g_look_ahead.x + g_frametime * g_look_ahead.y;
    float look_ahead_sec = (look_ahead_ms > LOOK_AHEAD_MS_CAP ? LOOK_AHEAD_MS_CAP : look_ahead_ms) / 1000.0;
    float look_ahead_sec_squared = pow(look_ahead_sec, 2);
    float3 g_imu_euler = float3(
        degreesLookAhead(g_imu_data[0][0], g_imu_data[1][0], g_imu_data[2][0], look_ahead_sec, look_ahead_sec_squared),
        degreesLookAhead(g_imu_data[0][1], g_imu_data[1][1], g_imu_data[2][1], look_ahead_sec, look_ahead_sec_squared),
        degreesLookAhead(g_imu_data[0][2], g_imu_data[1][2], g_imu_data[2][2], look_ahead_sec, look_ahead_sec_squared)
    );

    // Calculate the center of the image
    float2 center = float2(0.5f, 0.5f);
    texcoord -= center;

    // Apply aspect ratio
    float aspect_ratio = ReShade::ScreenSize.x / ReShade::ScreenSize.y;
    texcoord.y /= aspect_ratio;

    // Rotate the image
    float imu_z_radians = -g_imu_euler.z * DEG_TO_RAD;
    texcoord = float2(
        texcoord.x * cos(imu_z_radians) - texcoord.y * sin(imu_z_radians),
        texcoord.x * sin(imu_z_radians) + texcoord.y * cos(imu_z_radians)
    );

    // Revert aspect ratio
    texcoord.y *= aspect_ratio;

    // Translate the image
    float vertical_fov = g_display_fov / aspect_ratio;
    texcoord.x += g_imu_euler.x * (1 - g_lens_distance_ratio) / g_display_fov;
    texcoord.y += g_imu_euler.y / vertical_fov;

    float x_rads = g_imu_euler.x * DEG_TO_RAD;
    float half_fov_rads = g_display_fov/2 * DEG_TO_RAD;

    // Adjust the screen height based on how close the edges of the screen are, creates a bit of a screen tilt
    float edge_normalizer = cos(half_fov_rads);
    float left_edge_zoom = 0.5 * cos(x_rads - half_fov_rads)/edge_normalizer + 0.5;
    float right_edge_zoom = 0.5 * cos(x_rads + half_fov_rads)/edge_normalizer + 0.5;
    float zoom_delta = left_edge_zoom - right_edge_zoom;

    // find the ratio for where our current pixel falls in the range
    float current_ratio = zoom_delta * (texcoord.x + 0.5) + right_edge_zoom;

    // apply the ratio like an inverse zoom: if this pixel should appear further away, we zoom out, etc...
    texcoord.y *= current_ratio;

    // Apply zoom and adjust for screen size vs display size
    texcoord = texcoord / float2(g_zoom * ReShade::ScreenSize.x / g_display_res.x, g_zoom * ReShade::ScreenSize.y / g_display_res.y);
    texcoord += center;

    // Get the original pixel color or black if outside original image
    if (texcoord.x < 0 || texcoord.y < 0 || texcoord.x > 1 || texcoord.y > 1 || texcoord.x <= 0.005 && texcoord.y <= 0.005)
        color = float4(0, 0, 0, 1);
    else
        color = tex2D(ReShade::BackBuffer, texcoord);

    // Crop the image
    if (texcoord.x < 0 || texcoord.y < 0 || texcoord.x > g_display_res.x / ReShade::ScreenSize.x || texcoord.y > g_display_res.y / ReShade::ScreenSize.y)
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