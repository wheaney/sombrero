// Detect if we're in ReShade or GLSL environment
#if defined(__RESHADE__) || defined(__RESHADEFX__)
    #include "ReShade.fxh"

    #define RESHADE 1

    #define SAMPLE_TEXTURE(name, coord) tex2D(name, coord)
    #define DECLARE_UNIFORM(type, name, annotation) uniform type name annotation

    uniform sampler screenTexture = ReShade::BackBuffer;
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
#else
    #define RESHADE 0

    #define float float
    #define float2 vec2
    #define float3 vec3
    #define float4 vec4
    #define float2x2 mat2
    #define float3x3 mat3
    #define float4x4 mat4
    #define uint uint
    #define uint2 uvec2
    #define uint3 uvec3
    #define uint4 uvec4

    #define SAMPLE_TEXTURE(name, coord) texture2D(name, coord)
    #define DECLARE_UNIFORM(type, name, annotation) uniform type name

    uniform sampler2D screenTexture;
    uniform sampler2D calibratingTexture;
    uniform sampler2D customBannerTexture;
#endif

DECLARE_UNIFORM(bool, virtual_display_enabled, < source = "virtual_display_enabled"; defaultValue=false; >);
DECLARE_UNIFORM(float4x4, imu_quat_data, < source = "imu_quat_data"; defaultValue=float4x4(
    0.0,    0.0,    0.0,    0.0, // quat snapshot at t0
    0.0,    0.0,    0.0,    0.0, // quat snapshot at t1 (for velocity 1)
    0.0,    0.0,    0.0,    0.0, // quat snapshot at t2 (for velocity 2, accel 1)
    0.0,    0.0,    0.0,    0.0  // timestamps for t0, t1, and t2, last value is unused
); >);
DECLARE_UNIFORM(float4, look_ahead_cfg, < source = "look_ahead_cfg"; defaultValue=float4(0.0, 0.0, 0.0, 0.0); >);
DECLARE_UNIFORM(float2, display_resolution, < source = "display_res"; defaultValue=float2(1920, 1080); >);
DECLARE_UNIFORM(float2, source_to_display_ratio, < source = "source_to_display_ratio"; defaultValue=float2(1.0, 1.0); >);
DECLARE_UNIFORM(float, display_size, < source = "display_zoom"; defaultValue=1.0; >);
DECLARE_UNIFORM(float, display_north_offset, < source = "display_north_offset"; defaultValue=1.0; >);
DECLARE_UNIFORM(float3, lens_vector, < source = "lens_vector"; defaultValue=float3(1.0, 0.0, 0.0); >);
DECLARE_UNIFORM(float3, lens_vector_r, < source = "lens_vector_r"; defaultValue=float3(1.0, 0.0, 0.0); >);
DECLARE_UNIFORM(float2, texcoord_x_limits, < source = "texcoord_x_limits"; defaultValue=float2(0.0, 1.0); >);
DECLARE_UNIFORM(float2, texcoord_x_limits_r, < source = "texcoord_x_limits_r"; defaultValue=float2(0.0, 1.0); >);
DECLARE_UNIFORM(bool, show_banner, < source = "show_banner"; defaultValue=false; >);
DECLARE_UNIFORM(float, frametime, < source = "frametime"; >);
DECLARE_UNIFORM(float, look_ahead_ms, < source = "look_ahead_ms"; defaultValue=0.0; >);
DECLARE_UNIFORM(float4, date, < source = "date"; >);
DECLARE_UNIFORM(float4, keepalive_date, < source = "keepalive_date"; defaultValue=float4(0, 0, 0, 0); >);
DECLARE_UNIFORM(bool, sbs_enabled, < source = "sbs_enabled"; defaultValue=false; >);
DECLARE_UNIFORM(bool, custom_banner_enabled, < source = "custom_banner_enabled"; defaultValue=false; >);
DECLARE_UNIFORM(float2, trim_percent, < source = "trim_percent"; defaultValue=float2(0.0, 0.0); >);
DECLARE_UNIFORM(bool, curved_display, < source = "curved_display"; defaultValue=false; >);

// FOV defaults based on 46 degree diagonal
DECLARE_UNIFORM(float, half_fov_z_rads, < source = "half_fov_z_rads"; defaultValue=0.1968; >);
DECLARE_UNIFORM(float, half_fov_y_rads, < source = "half_fov_y_rads"; defaultValue=0.34987; >);
DECLARE_UNIFORM(float2, fov_half_widths, < source = "fov_half_widths"; defaultValue=float2(0.34987, 0.1968); >);
DECLARE_UNIFORM(float2, fov_widths, < source = "fov_widths"; defaultValue=float2(0.34987, 0.1968); >);

uniform float4 imu_reset_data = float4(0.0, 0.0, 0.0, 1.0);
uniform float2 banner_position = float2(0.5, 0.9);
uniform float look_ahead_ms_cap = 45.0;
uniform float day_in_seconds = 24 * 60 * 60;

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

// attempt to figure out where the current position should be based on previous position and velocity.
// velocity and time values should use the same time units (secs, ms, etc...)
float3 applyLookAhead(float3 position, float3 velocity, float t) {
    return position + velocity * t;
}

// returns the rate of change between the two vectors, in same time units as delta_time
// e.g. if delta_time is in ms, then the rate of change is "per ms"
float3 rateOfChange(float3 v1, float3 v2, float delta_time) {
    return (v1-v2) / delta_time;
}

// super naive check, just make sure the times are within 5 seconds of each other, ignore year, month, day
bool isKeepaliveRecent(float4 currentDate, float4 keepAliveDate) {
    return abs(mod(currentDate.w + day_in_seconds - keepAliveDate.w, day_in_seconds)) <= 5.0;
}

/**
 * For a curved display, our lenses are sitting inside a circle (defined by `radius`), at coords vectorStart and positioned 
 * as described by lookVector. Without moving vectorStart, and only changing the magnitude of the lookVector without changing
 * its direction, we need to find the scaling factor that will make the two vectors combined end up on the edge of the circle.
 *
 * The resulting magnitude of the combined vector -- created by putting our vectors tip-to-tail -- must be the radius
 * of the circle. Therefore: `radius = magnitude(lookVector*scale + vectorStart)`, where magnitude is
 * sqrt(vec.x^2 + vec.y^2).
 *
 * For simplicity: (x, y) = vectorStart, (a, b) = lookVector, r = radius, s = scale
 *
 * r^2 = (as+x)^2 + (bs+y)^2
 * 
 * Expanding and simplifying: (a^2 + b^2) * s^2 + 2(ax + by) * s + (x^2 + y^2 - r^2) = 0
 * 
 * This is a quadratic equation in the form of `ax^2 + bx + c = 0`, where we're solving for s (x) and:
 *  * `a = a^2 + b^2`
 *  * `b = 2(ax + by)`
 *  * `c = (x^2 + y^2 - r^2)`
 *
 * A negative return value is a "looking away" result
 **/
float getVectorScaleToCurve(float radius, float2 vectorStart, float2 lookVector) {
    float a = pow(lookVector.x, 2) + pow(lookVector.y, 2);
    float b = 2 * (lookVector.x * vectorStart.x + lookVector.y * vectorStart.y);
    float c = pow(vectorStart.x, 2) + pow(vectorStart.y, 2) - pow(radius, 2);

    float discriminant = pow(b, 2) - 4 * a * c;
    if (discriminant < 0.0) return -1.0;

    float sqrtDiscriminant = sqrt(discriminant);

    // return positive or largest, if both positive
    return max(
        (-b + sqrtDiscriminant) / (2 * a),
        (-b - sqrtDiscriminant) / (2 * a)
    );
}

void PS_IMU_Transform(float2 texcoord, out float4 color) {
    float2 effective_x_limits = texcoord_x_limits;
    float3 effective_lens_vector = lens_vector;

    if (sbs_enabled && virtual_display_enabled) {
        bool right_display = texcoord.x > 0.5;

        if(right_display) {
            effective_x_limits = texcoord_x_limits_r;
            effective_lens_vector = lens_vector_r;
        }

        // translate the texcoord respresenting the current lens's half of the screen to a full-screen texcoord
        texcoord.x = (texcoord.x - (right_display ? 0.5 : 0.0)) * 2;
    }
    float texcoord_width = effective_x_limits.y - effective_x_limits.x;

    if (virtual_display_enabled || show_banner) {
        bool banner_shown = false;
        if (show_banner) {
            float2 banner_size = float2(800.0, 200.0) / display_resolution;

            // if the banner width is greater than the sreen width, scale it down
            banner_size /= max(banner_size.x, 1.1);

            float2 banner_start = banner_position - banner_size / 2;

            // if the banner would extend too close or past the bottom edge of the screen, apply some padding
            banner_start.y = min(banner_start.y, 0.95 - banner_size.y);

            float2 banner_texcoord = (texcoord - banner_start) / banner_size;
            if (banner_texcoord.x >= 0.0 && banner_texcoord.x <= 1.0 && banner_texcoord.y >= 0.0 && banner_texcoord.y <= 1.0) {
                banner_shown = true;
                if (custom_banner_enabled) {
                    color = SAMPLE_TEXTURE(customBannerTexture, banner_texcoord);
                } else {
                    color = SAMPLE_TEXTURE(calibratingTexture, banner_texcoord);
                }
            }
        }
        
        if (!banner_shown) {
            // adjust texcoord back to the range that describes where the content is displayed
            texcoord.x = texcoord.x * texcoord_width + effective_x_limits.x;

            color = SAMPLE_TEXTURE(screenTexture, texcoord);
        }
    } else { 
        float vec_y = -texcoord.x * fov_widths.x + fov_half_widths.x;
        float vec_z = -texcoord.y * fov_widths.y + fov_half_widths.y;
        float3 texcoord_vector = float3(1.0, vec_y, vec_z);

        // then rotate the vector using each of the snapshots provided
        float3 rotated_vector_t0 = applyQuaternionToVector(imu_quat_data[0], texcoord_vector);
        float3 rotated_vector_t1 = applyQuaternionToVector(imu_quat_data[1], texcoord_vector);
        float3 rotated_lens_vector = applyQuaternionToVector(imu_quat_data[0], effective_lens_vector);

        // compute the velocity (units/ms) as change in the rotation snapshots
        float delta_time_t0 = imu_quat_data[3].x - imu_quat_data[3].y;
        float3 velocity_t0 = rateOfChange(rotated_vector_t0, rotated_vector_t1, delta_time_t0);

        // look_ahead can be hardcoded by look_ahead_ms, otherwise calculate it based on the frametime
        float effective_look_ahead_ms = look_ahead_ms;
        if (look_ahead_ms == 0.0) effective_look_ahead_ms = look_ahead_cfg.x + frametime * look_ahead_cfg.y;

        // allows for the bottom and top of the screen to have different look-ahead values
        float look_ahead_scanline_adjust = texcoord.y * look_ahead_cfg.z;

        // use the 4th value of the look-ahead config to cap the look-ahead value
        float look_ahead_ms_capped = min(min(effective_look_ahead_ms, look_ahead_cfg.w), look_ahead_ms_cap) + look_ahead_scanline_adjust;

        // apply most recent velocity and acceleration to most recent position to get a predicted position
        float3 res = applyLookAhead(rotated_vector_t0, velocity_t0, look_ahead_ms_capped) - rotated_lens_vector;

        bool looking_away = res.x < 0.0;
        
        float display_distance = display_north_offset - rotated_lens_vector.x;
        if (!curved_display) {
            // flat display

            // divide all values by x to scale the magnitude so x is exactly 1, and multiply by the final display distance
            // so the vector is pointing at a coordinate on the screen
            res *= display_distance / res.x;
            res += rotated_lens_vector;

            // deconstruct the rotated and scaled vector back to a texcoord (just inverse operations of the first conversion
            // above)
            texcoord.x = (fov_half_widths.x - res.y) / fov_widths.x;
        } else {
            // curved display

            // the screen sizes scale with the circle, so to zoom, we just make the circle bigger
            float radius = display_size;

            // position ourselves within the circle's radius based on desired display distance
            float2 vectorStart = float2(radius - display_distance, rotated_lens_vector.y);

            // scale the vector to the length needed to reach the curved display, then add the lens offsets back on
            float scale = getVectorScaleToCurve(radius, vectorStart, res.xy);
            if (scale <= 0.0) looking_away = true;
            res *= scale;
            res += float3(vectorStart.x, vectorStart.y, rotated_lens_vector.z);

            // we know exactly how many radians of the circle is covered by a single display's horizontal FOV,
            // so texcoord.x is just converting our vector.xy to radians and figuring out the percentage of the total 
            // FOV of all virtual displays
            float fov_y = half_fov_y_rads * 2 * source_to_display_ratio.x;
            float res_y_rads = (fov_y / 2) - atan(res.y, res.x);
            texcoord.x = res_y_rads / fov_y;
        }

        // screens are always flat in the vertical direction, so this is the same for curved and flat cases
        texcoord.y = (fov_half_widths.y - res.z) / fov_widths.y;

        // apply the texture offsets now
        texcoord.x = texcoord.x * texcoord_width + effective_x_limits.x;

        // scale/zoom operations must always be done around the center
        float2 texcoord_center = float2(effective_x_limits.x + texcoord_width/2.0, 0.5);
        texcoord -= texcoord_center;
        if (!curved_display) {
            // scale the coordinates from aspect ratio of display to the aspect ratio of the source texture
            texcoord /= source_to_display_ratio * display_size;
        } else {
            // curved radius-based logic only applied horizontally, so only y needs scaling
            texcoord.y /= source_to_display_ratio.y * display_size;
        }
        texcoord += texcoord_center;

        if(looking_away || 
           texcoord.x < effective_x_limits.x + trim_percent.x || 
           texcoord.y < trim_percent.y || 
           texcoord.x > effective_x_limits.y - trim_percent.x || 
           texcoord.y > 1.0 - trim_percent.y || 
           texcoord.x <= 0.001 && texcoord.y <= 0.002) {
            color = float4(0, 0, 0, 1);
        } else {
            color = SAMPLE_TEXTURE(screenTexture, texcoord);
        }
    }
}

#if RESHADE
    void Reshade_PS_IMU_Transform(float4 pos : SV_Position, float2 texcoord : TexCoord, out float4 color : SV_Target) {
        virtual_display_enabled &= isKeepaliveRecent(date, keepalive_date);
        float res_x_divisor = sbs_enabled ? 2.0 : 1.0;
        float2 source_resolution = float2(ReShade::ScreenSize.x / res_x_divisor, ReShade::ScreenSize.y);
        source_to_display_ratio = source_resolution / display_resolution;

        show_banner = all(imu_quat_data[0] == imu_reset_data) && all(imu_quat_data[1] == imu_reset_data);

        PS_IMU_Transform(texcoord, color);
    }

    technique Transform < enabled = true; >
    {
        pass
        {
            VertexShader = PostProcessVS;
            PixelShader = Reshade_PS_IMU_Transform;
        }
    }
#endif