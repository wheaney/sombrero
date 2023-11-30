// ReShade shader to translate, rotate, zoom, and crop an image
#include "ReShade.fxh"

texture2D calibratingImage < source = "calibrating.png"; > {
    Width = 800;
    Height = 200;
};
sampler2D calibratingSampler {
	Texture = calibratingImage;
};
uniform float2 banner_position = float2(0.5, 0.9);

uniform float4x4 g_imu_quat_data < source = "imu_quat_data"; defaultValue=float4x4(
//  w,      x,      y,      z,
    0.0,    0.0,    0.0,    0.0, // snapshot at t0
    0.0,    0.0,    0.0,    0.0, // snapshot at t1 (for velocity 1)
    0.0,    0.0,    0.0,    0.0, // snapshot at t2 (for velocity 2, accel 1)
    0.0,    0.0,    0.0,    0.0  // screen-center/frame-of-reference
); >;
uniform float g_imu_data_period_ms < source = "imu_data_period_ms"; defaultValue=10.0; >;
uniform float2 g_look_ahead < source = "look_ahead_cfg"; defaultValue=float2(10.0f, 1.25f); >;
uniform uint2 g_display_res < source = "display_res"; defaultValue=uint2(1920u, 1080u); >; // width, height
uniform float g_display_fov < source = "display_fov"; defaultValue=46.0; >;
uniform float g_zoom < source = "zoom"; defaultValue=1.0; >;
uniform bool g_disabled < source = "disabled"; defaultValue=true; >;
uniform float g_frametime < source = "averageframetime"; >;
uniform float g_lens_distance_ratio < source = "lens_distance_ratio"; defaultValue=0.035; >;
uniform float4 imu_reset_data = float4(0, 0, 0, 1);
uniform float4 g_date < source = "date"; >;
uniform float4 g_keepalive_date < source = "keepalive_date"; >;
uniform bool g_sbs_enabled < source = "sbs_enabled"; defaultValue=false; >;

uniform uint day_in_seconds = 24 * 60 * 60;
uniform float2 texcoord_center = float2(0.5f, 0.5f);

// cap look-ahead, beyond this it may get jittery and unusable
#define LOOK_AHEAD_MS_CAP 30.0

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

// super naive check, just make sure the times are within 5 seconds of each other, ignore year, month, day
bool is_keepalive_recent(float4 currentDate, float4 keepAliveDate)
{
    return abs((currentDate.w + day_in_seconds - keepAliveDate.w) % day_in_seconds) <= 5.0;
}

void PS_IMU_Transform(float4 pos : SV_Position, float2 texcoord : TexCoord, out float4 color : SV_Target)
{
    bool is_imu_reset_state = all(g_imu_quat_data[0] == imu_reset_data) && all(g_imu_quat_data[1] == imu_reset_data);
    bool is_keepalive_valid = is_keepalive_recent(g_date, g_keepalive_date);
    if (g_disabled || is_imu_reset_state || !is_keepalive_valid) {
        float2 banner_size = float2(800.0 / ReShade::ScreenSize.x, 200.0 / ReShade::ScreenSize.y); // Assuming ScreenWidth and ScreenHeight are defined

        if (!g_disabled && is_keepalive_valid &&
            texcoord.x >= banner_position.x - banner_size.x / 2 &&
            texcoord.x <= banner_position.x + banner_size.x / 2 &&
            texcoord.y >= banner_position.y - banner_size.y / 2 &&
            texcoord.y <= banner_position.y + banner_size.y / 2)
        {
            float2 banner_texcoord = (texcoord - (banner_position - banner_size / 2)) / banner_size;
            color = tex2D(calibratingSampler, banner_texcoord);
        } else {
            color = tex2D(ReShade::BackBuffer, texcoord);
        }
    } else {
        // These variables are sort of overkill for now, but are broken out for future SBS support
        float texcoord_x_min = 0.0;
        float texcoord_x_max = 1.0;
        float2 screen_size = float2(ReShade::ScreenSize.x, ReShade::ScreenSize.y);
        float lens_y_offset = 0.0;
        float lens_z_offset = 0.0;
        if (g_sbs_enabled) {
            // TODO - SBS support, modify the above variables based on left/right lens properties
        }

        float screen_aspect_ratio = screen_size.x / screen_size.y;
        float native_aspect_ratio = g_display_res.x / g_display_res.y;

        // TODO - fov is based on native aspect ratio, but that produces odd results due to how images at other aspect
        //        ratios are scaled, so for now, just use the aspect ratio of the original image
        float diag_to_vert_ratio = sqrt(pow(screen_aspect_ratio, 2) + 1);
        float half_fov_z_rads = radians(g_display_fov / diag_to_vert_ratio)/2;
        float half_fov_y_rads = half_fov_z_rads * screen_aspect_ratio;

        float screen_distance = 1.0 - g_lens_distance_ratio;

        float lens_fov_z_offset_rads = atan(lens_z_offset/screen_distance);
        float fov_z_pos = tan(half_fov_z_rads - lens_fov_z_offset_rads) * screen_distance;
        float fov_z_neg = -tan(half_fov_z_rads + lens_fov_z_offset_rads) * screen_distance;
        float fov_z_width = fov_z_pos - fov_z_neg;

        float lens_fov_y_offset_rads = atan(lens_y_offset/screen_distance);
        float fov_y_pos = tan(half_fov_y_rads - lens_fov_y_offset_rads) * screen_distance;
        float fov_y_neg = -tan(half_fov_y_rads + lens_fov_y_offset_rads) * screen_distance;
        float fov_y_width = fov_y_pos - fov_y_neg;

        // Convert texcoord coordinates into a NWU vector, where the screen's center (texcoord {0.5,0.5}) is at (1,0,0).
        // The screen appears flat across a curved field-of-view, so keeping x/north fixed at 1 correctly yields vectors
        // that range in magnitude from a min value 1 at the center to max values at the corners of the screen.
        float vec_x = screen_distance;
        float vec_y = -texcoord.x * fov_y_width + fov_y_pos;
        float vec_z = texcoord.y * fov_z_width + fov_z_neg;
        float3 texcoord_vector = float3(vec_x, vec_y, vec_z);
        float3 lens_vector = float3(g_lens_distance_ratio, lens_y_offset, lens_z_offset);

        // then rotate the vector using each of the snapshots provided
        float3 rotated_vector_t0 = applyQuaternionToVector(g_imu_quat_data[0], texcoord_vector);
        float3 rotated_vector_t1 = applyQuaternionToVector(g_imu_quat_data[1], texcoord_vector);
        float3 rotated_vector_t2 = applyQuaternionToVector(g_imu_quat_data[2], texcoord_vector);
        float3 rotated_lens_vector = applyQuaternionToVector(g_imu_quat_data[0], lens_vector);

        // compute the two velocities (units/ms) as change in the 3 rotation snapshots
        float3 velocity_t0 = rate_of_change(rotated_vector_t0, rotated_vector_t1, g_imu_data_period_ms);
        float3 velocity_t1 = rate_of_change(rotated_vector_t1, rotated_vector_t2, g_imu_data_period_ms);

        // and then the acceleration (units/ms^2) as the change in velocities
        float3 accel_t0 = rate_of_change(velocity_t0, velocity_t1, g_imu_data_period_ms);

        // the bottom of the screen seems to refresh later than the top, need a bigger look-ahead as y approaches 1
        // TODO - move this to a runtime uniform value provided by the driver since it will vary by device
        float look_ahead_scanline_adjust = texcoord.y * 5;

        float look_ahead_ms = min(g_look_ahead.x + g_frametime * g_look_ahead.y, LOOK_AHEAD_MS_CAP) + look_ahead_scanline_adjust;
        float look_ahead_ms_squared = pow(look_ahead_ms, 2);

        // apply most recent velocity and acceleration to most recent position to get a predicted position
        float3 look_ahead_vector = applyLookAhead(rotated_vector_t0, velocity_t0, accel_t0, look_ahead_ms, look_ahead_ms_squared);
        float3 look_ahead_lens_vector = applyLookAhead(rotated_lens_vector, velocity_t0, accel_t0, look_ahead_ms, look_ahead_ms_squared);

        // rotate it to the frame-of-reference, using its conjugate
        float3 res = applyQuaternionToVector(quatConj(g_imu_quat_data[3]), look_ahead_vector);
        float3 res_lens = applyQuaternionToVector(quatConj(g_imu_quat_data[3]), look_ahead_lens_vector);
        bool looking_behind = res.x < 0;

        // divide all values by x to scale the magnitude so x is exactly 1, and multiply by the final display distance
        // so the vector is pointing at a coordinate on the screen
        float display_distance = 1.0 - res_lens.x;
        res *= display_distance/res.x;

        // adjust x and y by how much our lens moved from its original offset
        res += res_lens - lens_vector;

        // deconstruct the rotated and scaled vector back to a texcoord (just inverse operations of the first conversion
        // above)
        texcoord.x = (fov_y_pos - res.y) / fov_y_width;
        texcoord.y = (res.z - fov_z_neg) / fov_z_width;

        texcoord -= texcoord_center;
        texcoord /= g_zoom;
        texcoord += texcoord_center;

        // Get the original pixel color or black if outside original image
        if (looking_behind || texcoord.x < texcoord_x_min || texcoord.y < 0 || texcoord.x > texcoord_x_max || texcoord.y > 1 || texcoord.x <= 0.005 && texcoord.y <= 0.005)
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