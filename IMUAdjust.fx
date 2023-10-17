// ReShade shader to translate, rotate, zoom, and crop an image
#include "ReShade.fxh"

uniform float4x4 g_imu_quat_data < source = "imu_quat_data"; defaultValue=float4x4(
//  w,      x,      y,      z,
    0.0,    0.0,    0.0,    0.0, // snapshot at t0
    0.0,    0.0,    0.0,    0.0, // snapshot at t1 (for velocity 1)
    0.0,    0.0,    0.0,    0.0, // snapshot at t2 (for velocity 2, accel 1)
    0.0,    0.0,    0.0,    0.0  // screen-center/frame-of-reference
); >;
uniform float g_imu_data_period_ms < source = "imu_data_period_ms"; defaultValue=3.0; >;
uniform float2 g_look_ahead < source = "look_ahead_cfg"; defaultValue=float2(0.0f, 2.4f); >;
uniform uint2 g_display_res < source = "display_res"; defaultValue=uint2(1920u, 1080u); >; // width, height
uniform float g_display_fov < source = "display_fov"; defaultValue=46.0; >;
uniform float g_zoom < source = "zoom"; defaultValue=1.0; >;
uniform bool g_disabled < source = "disabled"; defaultValue=true; >;
uniform float g_frametime < source = "averageframetime"; >;

// how much do the lenses swivel in relation to the perceived screen distance
// computed about 6 inches of radius vs about 12 ft of screen distance
uniform float g_lens_distance_ratio < source = "lens_distance_ratio"; defaultValue=0.04; >;

// cap look-ahead, beyond this it may get jittery and unusable
#define LOOK_AHEAD_MS_CAP 45.0

#define MS_PER_SEC 1000.0

// attempt to figure out where the current position should be based on previous position, velocity, and acceleration.
// velocity, accel, and time values should all use the same time units (secs, ms, etc...)
float3 applyLookAhead(float3 position, float3 velocity, float3 accel, float t, float t_squared) {
    return position + velocity * t + 0.5 * accel * t_squared;
}

float4 quatMul(float4 q1, float4 q2) {
    float3 u = float3(q1.x, q1.y, q1.z);
    float s = q1.w;
    float3 v = float3(q2.x, q2.y, q2.z);
    float t = q2.w;
    return float4(s*v + t*u + cross(u, v), s*t - dot(u, v));
}

float4 quatConj(float4 q) {
    return float4(-q.x, -q.y, -q.z, q.w);
}

float3 applyQuaternionToVector(float4 q, float3 v) {
    float4 p = quatMul(quatMul(q, float4(v, 0)), quatConj(q));
    return p.xyz;
}

// returns the rate of change between the two vectors, in same time units as delta_time
// e.g. if delta_time is in ms, then the rate of change is "per ms"
float3 rate_of_change(float3 v1, float3 v2, float delta_time) {
    return (v1-v2) / delta_time;
}

void PS_IMU_Transform(float4 pos : SV_Position, float2 texcoord : TexCoord, out float4 color : SV_Target)
{
    if (g_disabled) {
        color = tex2D(ReShade::BackBuffer, texcoord);
    } else {
        float aspect_ratio = ReShade::ScreenSize.x / ReShade::ScreenSize.y;
        float diag_to_vert_ratio = sqrt(pow(aspect_ratio, 2) + 1);
        float vertical_fov_rads = radians(g_display_fov / diag_to_vert_ratio);
        float vertical_fov_vector_ratio = sin(vertical_fov_rads/2);
        float horizontal_fov_vector_ratio = sin(vertical_fov_rads * aspect_ratio/2);

        // Convert texcoord coordinates into a vector, where the screen's center (texcoord {0.5,0.5}) is at (0,0,1).
        // The screen appears flat across a curved field-of-view, so keeping z fixed at 1 correctly yields vectors
        // that range in magnitude from a min value 1 at the center to max values at the corners of the screen.
        float vec_x = (0.5-texcoord.x) * 2 * horizontal_fov_vector_ratio;
        float vec_y = (0.5-texcoord.y) * 2 * vertical_fov_vector_ratio;
        float vec_z = 1.0;
        float3 texcoord_vector = float3(vec_x, vec_y, vec_z);

        // then rotate the vector using each of the snapshots provided
        float3 rotated_vector_t0 = applyQuaternionToVector(g_imu_quat_data[0], texcoord_vector);
        float3 rotated_vector_t1 = applyQuaternionToVector(g_imu_quat_data[1], texcoord_vector);
        float3 rotated_vector_t2 = applyQuaternionToVector(g_imu_quat_data[2], texcoord_vector);

        // compute the two velocities (units/ms) as change in the 3 rotation snapshots
        float3 velocity_t0 = rate_of_change(rotated_vector_t0, rotated_vector_t1, g_imu_data_period_ms);
        float3 velocity_t1 = rate_of_change(rotated_vector_t1, rotated_vector_t2, g_imu_data_period_ms);

        // and then the acceleration (units/ms^2) as the change in velocities
        float3 accel_t0 = rate_of_change(velocity_t0, velocity_t1, g_imu_data_period_ms);

        // apply most recent velocity and acceleration to most recent position to get a predicted position
        float look_ahead_ms = min(g_look_ahead.x + g_frametime * g_look_ahead.y, LOOK_AHEAD_MS_CAP);
        float look_ahead_ms_squared = pow(look_ahead_ms, 2);
        float3 look_ahead_vector = applyLookAhead(rotated_vector_t0, velocity_t0, accel_t0, look_ahead_ms, look_ahead_ms_squared);

        // rotate it to the frame-of-reference, using its conjugate
        float3 res = applyQuaternionToVector(quatConj(g_imu_quat_data[3]), look_ahead_vector);

        // adjust its new magnitude so it's pointing to a coordinate on the screen, since the screen is at a z-coordinate
        // of 1.0, we do this by just scaling each component by 1/z
        res /= res.z;

        // add the amount the lenses moved (as a percentage of the unit vector)
        res *= 1 + g_lens_distance_ratio/length(res);

        // convert vector back to texcoord (just inverse operations of the first conversion above)
        texcoord.x = 0.5 - (0.5 * res.x / horizontal_fov_vector_ratio);
        texcoord.y = 0.5 - (0.5 * res.y / vertical_fov_vector_ratio);

        float2 center = float2(0.5f, 0.5f);
        texcoord -= center;
        texcoord = texcoord / float2(g_zoom * ReShade::ScreenSize.x / g_display_res.x, g_zoom * ReShade::ScreenSize.y / g_display_res.y);
        texcoord += center;

        // Get the original pixel color or black if outside original image
        if (texcoord.x < 0 || texcoord.y < 0 || texcoord.x > 1 || texcoord.y > 1 || texcoord.x <= 0.005 && texcoord.y <= 0.005 || texcoord.x > g_display_res.x / ReShade::ScreenSize.x || texcoord.y > g_display_res.y / ReShade::ScreenSize.y)
            color = float4(0, 0, 0, 1);
        else
            color = tex2D(ReShade::BackBuffer, texcoord);
    }
}

technique Transform < enabled = true; >
{
    pass
    {
        VertexShader = PostProcessVS;
        PixelShader = PS_IMU_Transform;
    }
}