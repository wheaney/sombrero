#version 330 core

uniform sampler2D uDesktopTexture;
uniform sampler2D uCalibratingTexture;
uniform sampler2D uCustomBannerTexture;

uniform bool enabled;
uniform bool show_banner;
uniform mat4 imu_quat_data;
uniform vec4 look_ahead_cfg;
uniform float look_ahead_ms;
uniform float display_size;
uniform float display_north_offset;
uniform vec3 lens_vector;
uniform vec3 lens_vector_r;
uniform vec2 texcoord_x_limits;
uniform vec2 texcoord_x_limits_r;
uniform bool sbs_enabled;
uniform bool custom_banner_enabled;
uniform float trim_width_percent;
uniform float trim_height_percent;
uniform float half_fov_z_rads;
uniform float half_fov_y_rads;
uniform vec2 fov_half_widths;
uniform vec2 fov_widths;
uniform vec2 display_resolution;
uniform vec2 source_to_display_ratio;
uniform bool curved_display;

vec2 banner_position = vec2(0.5, 0.9);
float look_ahead_ms_cap = 45.0;

vec4 quatMul(vec4 q1, vec4 q2) {
    vec3 u = vec3(q1.x, q1.y, q1.z);
    float s = q1.w;
    vec3 v = vec3(q2.x, q2.y, q2.z);
    float t = q2.w;
    return vec4(s * v + t * u + cross(u, v), s * t - dot(u, v));
}

vec4 quatConj(vec4 q) {
    return vec4(-q.x, -q.y, -q.z, q.w);
}

vec3 applyQuaternionToVector(vec4 q, vec3 v) {
    vec4 p = quatMul(quatMul(q, vec4(v, 0)), quatConj(q));
    return p.xyz;
}

const int day_in_seconds = 24 * 60 * 60;

// attempt to figure out where the current position should be based on previous position and velocity.
// velocity and time values should use the same time units (secs, ms, etc...)
vec3 applyLookAhead(vec3 position, vec3 velocity, float t
) {
    return position + velocity * t;
}

vec3 rateOfChange(
    in vec3 v1,
    in vec3 v2,
    in float delta_time
) {
    return (v1 - v2) / delta_time;
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
float getVectorScaleToCurve(float radius, vec2 vectorStart, vec2 lookVector) {
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

void PS_IMU_Transform(vec4 pos, vec2 texcoord, out vec4 color) {
    vec2 effective_x_limits = texcoord_x_limits;
    vec3 effective_lens_vector = lens_vector;

    if(enabled && sbs_enabled) {
        bool right_display = texcoord.x > 0.5;
        if(right_display) {
            effective_x_limits = texcoord_x_limits_r;
            effective_lens_vector = lens_vector_r;
        }

        // translate the texcoord respresenting the current lens's half of the screen to a full-screen texcoord
        texcoord.x = (texcoord.x - (right_display ? 0.5 : 0.0)) * 2;
    }
    float texcoord_width = effective_x_limits.y - effective_x_limits.x;

    if(!enabled || show_banner) {
        bool banner_shown = false;
        if (show_banner) {
            vec2 banner_size = vec2(800.0 / display_resolution.x, 200.0 / display_resolution.y);

            // if the banner width is greater than the sreen width, scale it down
            banner_size /= max(banner_size.x, 1.1);

            vec2 banner_start = banner_position - banner_size / 2;

            // if the banner would extend too close or past the bottom edge of the screen, apply some padding
            banner_start.y = min(banner_start.y, 0.95 - banner_size.y);

            vec2 banner_texcoord = (texcoord - banner_start) / banner_size;
            if (banner_texcoord.x >= 0.0 && banner_texcoord.x <= 1.0 && banner_texcoord.y >= 0.0 && banner_texcoord.y <= 1.0) {
                banner_shown = true;
                if (custom_banner_enabled) {
                    color = texture2D(uCustomBannerTexture, banner_texcoord);
                } else {
                    color = texture2D(uCalibratingTexture, banner_texcoord);
                }
            }
        }
        
        if (!banner_shown) {
            // adjust texcoord back to the range that describes where the content is displayed
            texcoord.x = texcoord.x * texcoord_width + effective_x_limits.x;

            color = texture2D(uDesktopTexture, texcoord);
        }
    } else {        
        float vec_y = -texcoord.x * fov_widths.x + fov_half_widths.x;
        float vec_z = -texcoord.y * fov_widths.y + fov_half_widths.y;
        vec3 texcoord_vector = vec3(1.0, vec_y, vec_z);

        // then rotate the vector using each of the snapshots provided
        vec3 rotated_vector_t0 = applyQuaternionToVector(imu_quat_data[0], texcoord_vector);
        vec3 rotated_vector_t1 = applyQuaternionToVector(imu_quat_data[1], texcoord_vector);
        vec3 rotated_lens_vector = applyQuaternionToVector(imu_quat_data[0], effective_lens_vector);

        // compute the velocity (units/ms) as change in the rotation snapshots
        float delta_time_t0 = imu_quat_data[3].x - imu_quat_data[3].y;
        vec3 velocity_t0 = rateOfChange(rotated_vector_t0, rotated_vector_t1, delta_time_t0);

        // allows for the bottom and top of the screen to have different look-ahead values
        float look_ahead_scanline_adjust = texcoord.y * look_ahead_cfg.z;

        // use the 4th value of the look-ahead config to cap the look-ahead value
        float look_ahead_ms_capped = min(min(look_ahead_ms, look_ahead_cfg.w), look_ahead_ms_cap) + look_ahead_scanline_adjust;

        // apply most recent velocity and acceleration to most recent position to get a predicted position
        vec3 res = applyLookAhead(rotated_vector_t0, velocity_t0, look_ahead_ms_capped) - rotated_lens_vector;

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
            vec2 vectorStart = vec2(radius - display_distance, rotated_lens_vector.y);

            // scale the vector to the length needed to reach the curved display, then add the lens offsets back on
            float scale = getVectorScaleToCurve(radius, vectorStart, res.xy);
            if (scale <= 0.0) looking_away = true;
            res *= scale;
            res += vec3(vectorStart.x, vectorStart.y, rotated_lens_vector.z);

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
        vec2 texcoord_center = vec2(effective_x_limits.x + texcoord_width/2.0f, 0.5f);
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
           texcoord.x < effective_x_limits.x + trim_width_percent || 
           texcoord.y < trim_height_percent || 
           texcoord.x > effective_x_limits.y - trim_width_percent || 
           texcoord.y > 1.0 - trim_height_percent || 
           texcoord.x <= 0.001 && texcoord.y <= 0.002) {
            color = vec4(0, 0, 0, 1);
        } else {
            color = texture2D(uDesktopTexture, texcoord);
        }
    }
}