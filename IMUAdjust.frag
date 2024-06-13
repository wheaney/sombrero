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
uniform float lens_distance_ratio;
uniform bool sbs_enabled;
uniform bool sbs_content;
uniform bool sbs_mode_stretched;
uniform bool custom_banner_enabled;
uniform float trim_width_percent;
uniform float trim_height_percent;
uniform float half_fov_z_rads;
uniform float half_fov_y_rads;
uniform vec2 source_resolution;
uniform vec2 display_resolution;
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

vec3 applyLookAhead(
    in vec3 position,
    in vec3 velocity,
    in vec3 accel,
    in float t,
    in float t_squared
) {
    return position + velocity * t + 0.5 * accel * t_squared;
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
    float texcoord_x_min = 0.0;
    float texcoord_x_max = 1.0;
    float lens_y_offset = 0.0;
    float lens_z_offset = 0.0;

    if(enabled && sbs_enabled) {
        bool right_display = texcoord.x > 0.5;

        lens_y_offset = lens_distance_ratio / 3;
        if(right_display)
            lens_y_offset = -lens_y_offset;
        if(sbs_content) {
            // source video is SBS, left-half of the screen goes to the left lens, right-half to the right lens
            if(right_display)
                texcoord_x_min = 0.5;
            else
                texcoord_x_max = 0.5;
        }
        if(!sbs_mode_stretched) {
            // if the content isn't stretched, assume it's centered in the middle 50% of the screen
            texcoord_x_min = max(0.25, texcoord_x_min);
            texcoord_x_max = min(0.75, texcoord_x_max);
        }

        // translate the texcoord respresenting the current lens's half of the screen to a full-screen texcoord
        texcoord.x = (texcoord.x - (right_display ? 0.5 : 0.0)) * 2;
    }

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
            float texcoord_width = texcoord_x_max - texcoord_x_min;
            texcoord.x = texcoord.x * texcoord_width + texcoord_x_min;

            color = texture2D(uDesktopTexture, texcoord);
        }
    } else {
        float fov_y_half_width = tan(half_fov_y_rads);
        float fov_y_width = fov_y_half_width * 2;
        float fov_z_half_width = tan(half_fov_z_rads);
        float fov_z_width = fov_z_half_width * 2;
        
        float vec_y = -texcoord.x * fov_y_width + fov_y_half_width;
        float vec_z = -texcoord.y * fov_z_width + fov_z_half_width;
        vec3 lens_vector = vec3(lens_distance_ratio, lens_y_offset, lens_z_offset);
        vec3 texcoord_vector = vec3(1.0, vec_y, vec_z);

        // then rotate the vector using each of the snapshots provided
        vec3 rotated_vector_t0 = applyQuaternionToVector(imu_quat_data[0], texcoord_vector);
        vec3 rotated_vector_t1 = applyQuaternionToVector(imu_quat_data[1], texcoord_vector);
        vec3 rotated_vector_t2 = applyQuaternionToVector(imu_quat_data[2], texcoord_vector);
        vec3 rotated_lens_vector = applyQuaternionToVector(imu_quat_data[0], lens_vector);

        // compute the two velocities (units/ms) as change in the 3 rotation snapshots
        float delta_time_t0 = imu_quat_data[3].x - imu_quat_data[3].y;
        vec3 velocity_t0 = rateOfChange(rotated_vector_t0, rotated_vector_t1, delta_time_t0);
        vec3 velocity_t1 = rateOfChange(rotated_vector_t1, rotated_vector_t2, imu_quat_data[3].y - imu_quat_data[3].z);

        // and then the acceleration (units/ms^2) as the change in velocities
        vec3 accel_t0 = rateOfChange(velocity_t0, velocity_t1, delta_time_t0);

        // allows for the bottom and top of the screen to have different look-ahead values
        float look_ahead_scanline_adjust = texcoord.y * look_ahead_cfg.z;

        // use the 4th value of the look-ahead config to cap the look-ahead value
        float look_ahead_ms_capped = min(min(look_ahead_ms, look_ahead_cfg.w), look_ahead_ms_cap) + look_ahead_scanline_adjust;
        float look_ahead_ms_squared = pow(look_ahead_ms_capped, 2);

        // apply most recent velocity and acceleration to most recent position to get a predicted position
        vec3 res = applyLookAhead(rotated_vector_t0, velocity_t0, accel_t0, look_ahead_ms, look_ahead_ms_squared) -
            rotated_lens_vector;

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
            texcoord.x = (fov_y_half_width - res.y) / fov_y_width;
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
            float fov_y = half_fov_y_rads * 2 * source_resolution.x / display_resolution.x;
            float res_y_rads = (fov_y / 2) - atan(res.y, res.x);
            texcoord.x = res_y_rads / fov_y;
        }

        // screens are always flat in the vertical direction, so this is the same for curved and flat cases
        texcoord.y = (fov_z_half_width - res.z) / fov_z_width;

        // apply the texture offsets now
        float texcoord_width = texcoord_x_max - texcoord_x_min;
        texcoord.x = texcoord.x * texcoord_width + texcoord_x_min;

        // scale/zoom operations must always be done around the center
        vec2 texcoord_center = vec2(texcoord_x_min + texcoord_width/2.0f, 0.5f);
        texcoord -= texcoord_center;
        if (!curved_display) {
            // scale the coordinates from aspect ratio of display to the aspect ratio of the source texture
            texcoord *= vec2(display_resolution.x / source_resolution.x, display_resolution.y / source_resolution.y);
            // apply the zoom
            texcoord /= display_size;
        } else {
            // curved radius-based logic only applied horizontally, so only y needs scaling
            texcoord.y /= display_size * source_resolution.y / display_resolution.y;
        }
        texcoord += texcoord_center;

        if(looking_away || 
           texcoord.x < texcoord_x_min + trim_width_percent || 
           texcoord.y < trim_height_percent || 
           texcoord.x > texcoord_x_max - trim_width_percent || 
           texcoord.y > 1.0 - trim_height_percent || 
           texcoord.x <= 0.001 && texcoord.y <= 0.002) {
            color = vec4(0, 0, 0, 1);
        } else {
            color = texture2D(uDesktopTexture, texcoord);
        }
    }
}