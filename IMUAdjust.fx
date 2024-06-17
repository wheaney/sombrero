// ReShade shader to translate, rotate, zoom, and crop an image
#include "ReShade.fxh"

texture2D calibratingImage < source = "calibrating.png"; > {
    Width = 800;
    Height = 200;
};
sampler2D calibratingSampler {
	Texture = calibratingImage;
};
texture2D customBannerImage < source = "custom_banner.png"; > {
    Width = 800;
    Height = 200;
};
sampler2D customBannerSampler {
	Texture = customBannerImage;
};
uniform float2 banner_position = float2(0.5, 0.9);

uniform float4x4 g_imu_quat_data < source = "imu_quat_data"; defaultValue=float4x4(
    0.0,    0.0,    0.0,    0.0, // quat snapshot at t0
    0.0,    0.0,    0.0,    0.0, // quat snapshot at t1 (for velocity 1)
    0.0,    0.0,    0.0,    0.0, // quat snapshot at t2 (for velocity 2, accel 1)
    0.0,    0.0,    0.0,    0.0  // timestamps for t0, t1, and t2, last value is unused
); >;
uniform float4 g_look_ahead < source = "look_ahead_cfg"; defaultValue=float4(
    10.0f,  // look-ahead constant, in ms
    1.25f,  // look-ahead frametime multiplier, where frametime is ms/frame
    1.0f,   // scanline adjust
    30.0f   // look-ahead cap, in ms
); >;
uniform uint2 g_display_res < source = "display_res"; defaultValue=uint2(1920u, 1080u); >; // width, height
uniform float g_display_fov < source = "display_fov"; defaultValue=46.0; >;
uniform float g_display_zoom < source = "display_zoom"; defaultValue=1.0; >;
uniform float g_display_north_offset < source = "display_north_offset"; defaultValue=1.0; >;
uniform bool g_virtual_display_enabled < source = "virtual_display_enabled"; defaultValue=false; >;
uniform float g_frametime < source = "averageframetime"; >;
uniform float g_lens_distance_ratio < source = "lens_distance_ratio"; defaultValue=0.025; >;
uniform float4 imu_reset_data = float4(0, 0, 0, 1);
uniform float4 g_date < source = "date"; >;
uniform float4 g_keepalive_date < source = "keepalive_date"; >;
uniform bool g_sbs_enabled < source = "sbs_enabled"; defaultValue=false; >;
uniform bool g_sbs_content < source = "sbs_content"; defaultValue=false; >;
uniform bool g_sbs_mode_stretched < source = "sbs_mode_stretched"; defaultValue=false; >;
uniform bool g_custom_banner_enabled < source = "custom_banner_enabled"; defaultValue=false; >;

uniform uint day_in_seconds = 24 * 60 * 60;

// cap look-ahead, beyond this it may get jittery and unusable
#define LOOK_AHEAD_MS_CAP 45.0

// attempt to figure out where the current position should be based on previous position and velocity.
// velocity and time values should use the same time units (secs, ms, etc...)
float3 applyLookAhead(float3 position, float3 velocity, float t) {
    return position + velocity * t;
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
float3 rateOfChange(float3 v1, float3 v2, float delta_time) {
    return (v1-v2) / delta_time;
}

// super naive check, just make sure the times are within 5 seconds of each other, ignore year, month, day
bool isKeepaliveRecent(float4 currentDate, float4 keepAliveDate)
{
    return abs((currentDate.w + day_in_seconds - keepAliveDate.w) % day_in_seconds) <= 5.0;
}

void PS_IMU_Transform(float4 pos : SV_Position, float2 texcoord : TexCoord, out float4 color : SV_Target)
{
    bool is_keepalive_valid = isKeepaliveRecent(g_date, g_keepalive_date);
    bool shader_disabled = !g_virtual_display_enabled || !is_keepalive_valid;
    bool is_imu_reset_state = all(g_imu_quat_data[0] == imu_reset_data) && all(g_imu_quat_data[1] == imu_reset_data);
    float texcoord_x_min = 0.0;
    float texcoord_x_max = 1.0;
    float2 screen_size = float2(ReShade::ScreenSize.x, ReShade::ScreenSize.y);
    float lens_y_offset = 0.0;
    float lens_z_offset = 0.0;
    if (g_sbs_enabled && !shader_disabled) {
        bool right_display = texcoord.x > 0.5;
        if (ReShade::AspectRatio > 2) screen_size.x /= 2;

        lens_y_offset = g_lens_distance_ratio / 3;
        if (right_display) lens_y_offset = -lens_y_offset;
        if (g_sbs_content) {
            // source video is SBS, left-half of the screen goes to the left lens, right-half to the right lens
            if (right_display)
                texcoord_x_min = 0.5;
            else
                texcoord_x_max = 0.5;
        }
        if (!g_sbs_mode_stretched) {
            // if the content isn't stretched, assume it's centered in the middle 50% of the screen
            texcoord_x_min = max(0.25, texcoord_x_min);
            texcoord_x_max = min(0.75, texcoord_x_max);
        }

        // translate the texcoord respresenting the current lens's half of the screen to a full-screen texcoord
        texcoord.x = (texcoord.x - (right_display ? 0.5 : 0.0)) * 2;
    }

    if (shader_disabled || is_imu_reset_state) {
        float2 banner_size = float2(800.0 / ReShade::ScreenSize.x, 200.0 / ReShade::ScreenSize.y); // Assuming ScreenWidth and ScreenHeight are defined

        if (!shader_disabled &&
            texcoord.x >= banner_position.x - banner_size.x / 2 &&
            texcoord.x <= banner_position.x + banner_size.x / 2 &&
            texcoord.y >= banner_position.y - banner_size.y / 2 &&
            texcoord.y <= banner_position.y + banner_size.y / 2)
        {
            float2 banner_texcoord = (texcoord - (banner_position - banner_size / 2)) / banner_size;
            if (g_custom_banner_enabled) {
                color = tex2D(customBannerSampler, banner_texcoord);
            } else {
                color = tex2D(calibratingSampler, banner_texcoord);
            }
        } else {
            // adjust texcoord back to the range that describes where the content is displayed
            float texcoord_width = texcoord_x_max - texcoord_x_min;
            texcoord.x = texcoord.x * texcoord_width + texcoord_x_min;

            color = tex2D(ReShade::BackBuffer, texcoord);
        }
    } else {
        float screen_aspect_ratio = screen_size.x / screen_size.y;
        float native_aspect_ratio = g_display_res.x / g_display_res.y;

        // TODO - fov is based on native aspect ratio, but that produces odd results due to how images at other aspect
        //        ratios are scaled, so for now, just use the aspect ratio of the original image
        float diag_to_vert_ratio = sqrt(pow(screen_aspect_ratio, 2) + 1);
        float half_fov_z_rads = radians(g_display_fov / diag_to_vert_ratio)/2;
        float half_fov_y_rads = half_fov_z_rads * screen_aspect_ratio;

        float screen_distance = 1.0 - g_lens_distance_ratio;

        float fov_y_half_width = tan(half_fov_y_rads) * screen_distance;
        float fov_y_width = fov_y_half_width * 2;
        float fov_z_half_width = tan(half_fov_z_rads) * screen_distance;
        float fov_z_width = fov_z_half_width * 2;

        // Convert texcoord coordinates into a NWU vector, where the screen's center (texcoord {0.5,0.5}) is at (1,0,0).
        // The screen appears flat across a curved field-of-view, so keeping x/north fixed at 1 correctly yields vectors
        // that range in magnitude from a min value 1 at the center to max values at the corners of the screen.
        float vec_y = -texcoord.x * fov_y_width + fov_y_half_width;
        float vec_z = -texcoord.y * fov_z_width + fov_z_half_width;
        float3 texcoord_vector = float3(1.0, vec_y, vec_z);
        float3 lens_vector = float3(g_lens_distance_ratio, lens_y_offset, lens_z_offset);

        // then rotate the vector using each of the snapshots provided
        float3 rotated_vector_t0 = applyQuaternionToVector(g_imu_quat_data[0], texcoord_vector);
        float3 rotated_vector_t1 = applyQuaternionToVector(g_imu_quat_data[1], texcoord_vector);
        float3 rotated_lens_vector = applyQuaternionToVector(g_imu_quat_data[0], lens_vector);

        // compute the velocity (units/ms) as change in the rotation snapshots
        float delta_time_t0 = g_imu_quat_data[3].x - g_imu_quat_data[3].y;
        float3 velocity_t0 = rateOfChange(rotated_vector_t0, rotated_vector_t1, delta_time_t0);

        // allows for the bottom and top of the screen to have different look-ahead values
        float look_ahead_scanline_adjust = texcoord.y * g_look_ahead.z;

        // use the 4th value of the look-ahead config to cap the look-ahead value
        float look_ahead_ms = min(min(g_look_ahead.x + g_frametime * g_look_ahead.y, g_look_ahead.w), LOOK_AHEAD_MS_CAP) + look_ahead_scanline_adjust;

        // apply most recent velocity and acceleration to most recent position to get a predicted position
        float3 res = applyLookAhead(rotated_vector_t0, velocity_t0, look_ahead_ms) - rotated_lens_vector;

        bool looking_behind = res.x < 0;

        // divide all values by x to scale the magnitude so x is exactly 1, and multiply by the final display distance
        // so the vector is pointing at a coordinate on the screen
        float display_distance = (g_sbs_enabled ? g_display_north_offset : 1.0) - rotated_lens_vector.x;
        res *= display_distance/res.x;
        res += rotated_lens_vector;

        // deconstruct the rotated and scaled vector back to a texcoord (just inverse operations of the first conversion
        // above)
        texcoord.x = (fov_y_half_width - res.y) / fov_y_width;
        texcoord.y = (fov_z_half_width - res.z) / fov_z_width;

        // apply the screen offsets now
        float texcoord_width = texcoord_x_max - texcoord_x_min;
        texcoord.x = texcoord.x * texcoord_width + texcoord_x_min;

        float2 texcoord_center = float2(texcoord_x_min + texcoord_width/2.0f, 0.5f);
        texcoord -= texcoord_center;
        texcoord /= g_display_zoom;
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