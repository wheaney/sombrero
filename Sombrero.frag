// Detect if we're in ReShade or GLSL environment
#if defined(__RESHADE__) || defined(__RESHADEFX__)
    #include "ReShade.fxh"

    #define RESHADE 1

    #define SAMPLE_TEXTURE(name, coord) tex2D(name, coord)
    #define DECLARE_UNIFORM(type, name, default_value) uniform type name < source = #name; defaultValue = default_value; >;

    texture BackBufferTex : COLOR;
    sampler screenTexture { Texture = BackBufferTex; };
    texture2D calibratingImage < source = "calibrating.png"; > {
        Width = 800;
        Height = 200;
    };
    sampler2D calibratingTexture {
        Texture = calibratingImage;
    };
    texture2D customBannerImage < source = "custom_banner.png"; > {
        Width = 800;
        Height = 200;
    };
    sampler2D customBannerTexture {
        Texture = customBannerImage;
    };

    float mod(float x, float y) {
        return x % y;
    }

    DECLARE_UNIFORM(float4, date, float4(0, 0, 0, 0));
    DECLARE_UNIFORM(float4, keepalive_date, float4(0, 0, 0, 0));
    DECLARE_UNIFORM(bool, sbs_mode_stretched, false);
#else
    #ifdef GL_ES
        precision mediump float;
    #endif

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
    #define atan2 atan

    #if __VERSION__ >= 130
        #define SAMPLE_TEXTURE(name, coord) texture(name, coord)
    #else
        #define SAMPLE_TEXTURE(name, coord) texture2D(name, coord)
    #endif
    #define DECLARE_UNIFORM(type, name, default_value) uniform type name;

    uniform sampler2D screenTexture;
    uniform sampler2D calibratingTexture;
    uniform sampler2D customBannerTexture;
#endif

uniform float2 banner_position = float2(0.5, 0.9);
uniform float day_in_seconds = 24 * 60 * 60;

// ======== BEGIN virtual display uniforms ========
DECLARE_UNIFORM(bool, virtual_display_enabled, false);
DECLARE_UNIFORM(float4x4, pose_orientation, float4x4(
    0.0,    0.0,    0.0,    0.0, // quat snapshot at t0
    0.0,    0.0,    0.0,    0.0, // quat snapshot at t1 (for velocity 1)
    0.0,    0.0,    0.0,    0.0, // quat snapshot at t2 (for velocity 2, accel 1)
    0.0,    0.0,    0.0,    0.0  // timestamps for t0, t1, and t2, last value is unused
));
DECLARE_UNIFORM(float3, pose_position, float3(0.0, 0.0, 0.0));
DECLARE_UNIFORM(float4, look_ahead_cfg, float4(0.0, 0.0, 0.0, 0.0));
DECLARE_UNIFORM(float2, display_resolution, float2(1920, 1080));
DECLARE_UNIFORM(float2, source_to_display_ratio, float2(1.0, 1.0));
DECLARE_UNIFORM(float, display_size, 1.0);
DECLARE_UNIFORM(float, display_north_offset, 1.0);
DECLARE_UNIFORM(float3, lens_vector, float3(0.05, 0.0, 0.0));
DECLARE_UNIFORM(float3, lens_vector_r, float3(0.05, 0.0, 0.0));
DECLARE_UNIFORM(float2, texcoord_x_limits, float2(0.0, 1.0));
DECLARE_UNIFORM(float2, texcoord_x_limits_r, float2(0.0, 1.0));
DECLARE_UNIFORM(bool, show_banner, false);
DECLARE_UNIFORM(float, frametime, 17.0);
DECLARE_UNIFORM(float, look_ahead_ms, -1.0);
DECLARE_UNIFORM(bool, custom_banner_enabled, false);
DECLARE_UNIFORM(float2, trim_percent, float2(0.0, 0.0));
DECLARE_UNIFORM(bool, curved_display, false);
DECLARE_UNIFORM(bool, sbs_enabled, false);

// FOV defaults based on 46 degree diagonal
DECLARE_UNIFORM(float, half_fov_z_rads, 0.1968);
DECLARE_UNIFORM(float, half_fov_y_rads, 0.34987);
DECLARE_UNIFORM(float2, fov_half_widths, float2(0.36488117986, 0.19938069145));
DECLARE_UNIFORM(float2, fov_widths, float2(0.72976236, 0.398761383));

uniform float4 imu_reset_data = float4(0.0, 0.0, 0.0, 1.0);
uniform float look_ahead_ms_cap = 45.0;
// ======== END virtual display uniforms ========

// ======== BEGIN sideview uniforms ========
DECLARE_UNIFORM(bool, sideview_enabled, false);

// 0 = top-left, 1 = top-right, 2 = bottom-left, 3 = bottom-right, 4 = center
DECLARE_UNIFORM(float, sideview_position, 0.0);
// ======== END sideview uniforms ========

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

float2 applySideviewTransform(float2 texcoord) {
    float2 texcoord_mins = float2(0.0, 0.0);

    if (sideview_position == 2 || sideview_position == 3) {
        // bottom
        texcoord_mins.y = 1.0 - display_size;
    }

    if (sideview_position == 1 || sideview_position == 3) {
        // right
        texcoord_mins.x = 1.0 - display_size;
    }

    if (sideview_position == 4) {
        // center
        texcoord_mins.x = texcoord_mins.y = (1.0 - display_size) / 2.0;
    }

    return (texcoord - texcoord_mins) / display_size;
}

/**
 * This fragment shader function applies IMU and sideview changes along with device-specific FOV measurements and SBS state to output
 * a virtual display to XR glasses. The steps are:
 * 1. Determine the area of the screen texture we should be sampling. If SBS is enabled:
 *   a. Choose the x-limits and lens vector based on the current lens (left or right).
 *   b. Scale the texcoord's x coordinate so it treats its own half of the screen as a full-screen texcoord (e.g. for a right lens, the
 *      an x-coordinate of 0.6 takes up 20% of the right half of the screen, so we map it to a value of 0.2).
 * 2. If the screen is not static (i.e. virtual display is being rendered):
 *   a. Map the texture coordinates to a vector. The vector starts at the pivot point in the middle of the wearer's head to the same 
 *      texture-coordinate point on a screen that's at a forward distance described by the north-offset. This is the "look vector."
 *      The look vector is technically two vectors tip-to-tail, but for simplicity we keep them as one until after rotation: 
 *        (1) a vector going from the pivot point in the middle of the wearer's head to the lens ("lens vector"). Since this is based
 *            on real-world physical properties of the glasses, we should be careful to keep its magnitude fixed.
 *        (2) a vector going from the lens to the texture coordinate point on the screen ("lens look vector"). We need a separate 
 *            understanding of this vector for scaling purposes later, otherwise we'd be scaling the lens vector, whose magnitude is fixed.
 *   b. Compute a rotation based on the IMU rotation with additional look-ahead rotation applied to predict where the pose will be in
 *      a specific number of milliseconds.
 *   c. Apply the IMU+look-ahead rotation to the look vector and lens vector separately.
 *   d. Remove the rotated lens vector from the rotated look vector so we're left with just the lens look vector in preparation for scaling.
 *   e. Scale the lens look vector so it's tip is on the same plane as the screen again (the rotation may have taken it slightly off this plane).
 *   f. Append the rotated lens vector again so we're left with the final look vector.
 *   g. Map the final look vector back to texture coordinates.
 *   h. Apply aspect ratio scaling so the screen doesn't appear warped in cases where the source and destination aspect ratios differ, and 
 *      apply the display zoom requested by the user.
 * 3. If sideview is enabled, apply the requested sideview transform, which just scales and translates the texture coordinates.
 * 4. If the banner is being shown:
 *   a. Scale the full-screen texture coordinates to coordinates relative to the banner texture, then figure out if those texture 
 *      coordinates fall within the banner region.
 *   b. If so, sample the banner texture, this is our final color so we can exit.
 * 5. After we've applied all effects, we've got the final texture coordinates, but they're relative to a full-screen texture. Apply the 
 *    x-limits to move the texcoords to the relevant area of the screen texture so it's ready for sampling (e.g. with an x-coordinate of 0.2, 
 *    for a split SBS image from the right lens we would want to be sampling 20% of the way into the right-half of the screen texture, so it 
 *    would map to 0.6 on the original screen texture).
 * 6. Inspect the final texture coordinates to ensure they fall within the sample-able bounds of the screen texture. If not, set the color 
 *    to black, otherwise use the coordinates to sample the screen texture.
 */
void PS_Sombrero(bool vd_effect_enabled, bool sideview_effect_enabled, float2 src_dsp_ratio, bool banner_visible, float2 texcoord, out float4 color) {
    if (!vd_effect_enabled && !sideview_effect_enabled) {
        color = SAMPLE_TEXTURE(screenTexture, texcoord);
        return;
    }
    
    // Step 1
    float2 effective_x_limits = texcoord_x_limits;
    float3 effective_lens_vector = lens_vector;

    if (sbs_enabled && (vd_effect_enabled || sideview_effect_enabled)) {
        // Step 1.a
        bool right_display = texcoord.x > 0.5;
        if(right_display) {
            effective_x_limits = texcoord_x_limits_r;
            effective_lens_vector = lens_vector_r;
        }

        // Step 1.b
        texcoord.x = (texcoord.x - (right_display ? 0.5 : 0.0)) * 2;
    }

    // Step 2
    bool looking_away = false;
    if (vd_effect_enabled && !banner_visible) {
        // Step 2.a
        float vec_y = -texcoord.x * fov_widths.x + fov_half_widths.x;
        float vec_z = -texcoord.y * fov_widths.y + fov_half_widths.y;
        float3 look_vector = float3(1.0, vec_y, vec_z);

        // Step 2.b
        float3 rotated_vector_t0 = applyQuaternionToVector(pose_orientation[0], look_vector);
        float3 rotated_vector_t1 = applyQuaternionToVector(pose_orientation[1], look_vector);
        float3 rotated_lens_vector = applyQuaternionToVector(pose_orientation[0], effective_lens_vector);
        float3 final_lens_position = pose_position + rotated_lens_vector;

        // compute the velocity (units/ms) as change in the rotation snapshots
        float delta_time_t0 = pose_orientation[3].x - pose_orientation[3].y;
        float3 velocity_t0 = rateOfChange(rotated_vector_t0, rotated_vector_t1, delta_time_t0);

        // look_ahead can be hardcoded by look_ahead_ms, otherwise calculate it based on the frametime
        float effective_look_ahead_ms = look_ahead_ms;
        if (look_ahead_ms == -1.0) effective_look_ahead_ms = look_ahead_cfg.x + frametime * look_ahead_cfg.y;

        // allows for the bottom and top of the screen to have different look-ahead values
        float look_ahead_scanline_adjust = texcoord.y * look_ahead_cfg.z;

        // use the 4th value of the look-ahead config to cap the look-ahead value
        float look_ahead_ms_capped = min(min(effective_look_ahead_ms, look_ahead_cfg.w), look_ahead_ms_cap) + look_ahead_scanline_adjust;

        // Step 2.c
        float3 rotated_look_vector = applyLookAhead(rotated_vector_t0, velocity_t0, look_ahead_ms_capped);

        // Step 2.d
        float3 lens_look_vector = rotated_look_vector - final_lens_position;

        looking_away = lens_look_vector.x < 0.0;
        
        float display_distance = display_north_offset - final_lens_position.x;

        // for sideview, we want the display size to reverse the effect of the distance so it's always "full screen" prior 
        // to applying the sideview adjustment
        float effective_display_size = display_size;
        if (sideview_effect_enabled) {
            effective_display_size = display_north_offset;
            if (display_size > 1.0)  effective_display_size *= display_size;
        }
        
        float3 final_look_vector;
        if (!curved_display) {
            // flat display

            // Step 2.e
            // divide all values by x to scale the magnitude so x is exactly 1, and multiply by the final display distance
            // so the vector is pointing at a coordinate on the screen
            lens_look_vector *= display_distance / lens_look_vector.x;

            // Step 2.f
            final_look_vector = lens_look_vector + final_lens_position;

            // Step 2.g for x-coord
            // deconstruct the rotated and scaled vector back to a texcoord (just inverse operations of the first conversion
            // above)
            texcoord.x = (fov_half_widths.x - final_look_vector.y) / fov_widths.x;
        } else {
            // curved display

            // Step 2.e
            // the screen sizes scale with the circle, so to zoom, we just make the circle bigger
            float radius = effective_display_size;

            // position ourselves within the circle's radius based on desired display distance
            float2 vectorStart = float2(radius - display_distance, final_lens_position.y);

            // scale the vector to the length needed to reach the curved display, then add the lens offsets back on
            float scale = getVectorScaleToCurve(radius, vectorStart, lens_look_vector.xy);
            if (scale <= 0.0) looking_away = true;
            lens_look_vector *= scale;

            // Step 2.f
            final_look_vector = lens_look_vector + float3(vectorStart.x, vectorStart.y, final_lens_position.z);

            // Step 2.g for x-coord
            // we know exactly how many radians of the circle is covered by a single display's horizontal FOV,
            // so texcoord.x is just converting our vector.xy to radians and figuring out the percentage of the total 
            // FOV of all virtual displays
            float fov_y = half_fov_y_rads * 2 * src_dsp_ratio.x;
            float final_look_vector_y_rads = (fov_y / 2) - atan2(final_look_vector.y, final_look_vector.x);
            texcoord.x = final_look_vector_y_rads / fov_y;
        }

        // Step 2.g for y-coord
        // screens are always flat in the vertical direction, so this is the same for curved and flat cases
        texcoord.y = (fov_half_widths.y - final_look_vector.z) / fov_widths.y;

        // Step 2.h
        // scale/zoom operations must always be done around the center
        float2 texcoord_center = float2(0.5, 0.5);
        texcoord -= texcoord_center;
        float2 aspect_ratio_adjustment = src_dsp_ratio * effective_display_size;
        if (!curved_display) {
            // scale the coordinates from aspect ratio of display to the aspect ratio of the source texture
            texcoord /= aspect_ratio_adjustment;
        } else {
            // curved radius-based logic only applied horizontally, so only y needs scaling
            texcoord.y /= aspect_ratio_adjustment.y;
        }
        texcoord += texcoord_center;
    }

    // Step 3
    if (sideview_effect_enabled && !banner_visible) texcoord = applySideviewTransform(texcoord);

    // Step 4
    if (banner_visible) {
        // Step 4.a
        float2 banner_size = float2(800.0, 200.0) / display_resolution;

        // if the banner width is greater than the sreen width, scale it down
        banner_size /= max(banner_size.x, 1.1);

        float2 banner_start = banner_position - banner_size / 2;

        // if the banner would extend too close or past the bottom edge of the screen, apply some padding
        banner_start.y = min(banner_start.y, 0.95 - banner_size.y);

        // figure out the texture coordinates relative to the banner texture
        float2 banner_texcoord = (texcoord - banner_start) / banner_size;
        if (banner_texcoord.x >= 0.0 && banner_texcoord.x <= 1.0 && banner_texcoord.y >= 0.0 && banner_texcoord.y <= 1.0) {
            // Step 4.b
            if (custom_banner_enabled) {
                color = SAMPLE_TEXTURE(customBannerTexture, banner_texcoord);
            } else {
                color = SAMPLE_TEXTURE(calibratingTexture, banner_texcoord);
            }
            
            return;
        }
    }

    // Step 5
    float texcoord_width = effective_x_limits.y - effective_x_limits.x;
    texcoord.x = texcoord.x * texcoord_width + effective_x_limits.x;

    // Step 6
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

#if RESHADE
    void Reshade_PS_Sombrero(float4 pos : SV_Position, float2 texcoord : TexCoord, out float4 color : SV_Target) {
        bool is_keepalive_recent = isKeepaliveRecent(date, keepalive_date);
        bool vd_effect_enabled = virtual_display_enabled && is_keepalive_recent;
        bool sideview_effect_enabled = sideview_enabled && is_keepalive_recent;
        bool any_effect_enabled = vd_effect_enabled || sideview_effect_enabled;
        float2 source_resolution = float2(ReShade::ScreenSize.x, ReShade::ScreenSize.y);

        // the rendering application may have stretched the image to fit the SBS screen, if so then the texture
        // is actually double the width of the original source content, so we should adjust our understanding of
        // the source resolution accordingly
        if (sbs_enabled && sbs_mode_stretched && ReShade::AspectRatio > 2)
            source_resolution.x /= 2.0;

        float2 src_dsp_ratio = source_resolution / display_resolution;
        bool banner_visible = any_effect_enabled && all(pose_orientation[0] == imu_reset_data) && all(pose_orientation[1] == imu_reset_data);

        PS_Sombrero(vd_effect_enabled, sideview_effect_enabled, src_dsp_ratio, banner_visible, texcoord, color);
    }

    technique Transform < enabled = true; >
    {
        pass
        {
            VertexShader = PostProcessVS;
            PixelShader = Reshade_PS_Sombrero;
        }
    }
#endif