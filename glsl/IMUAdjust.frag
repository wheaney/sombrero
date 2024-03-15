// Automatically generated from ReShadeFX
// See https://github.com/wheaney/reshadefx-codegen

float fmodHLSL(float x, float y) { return x - y * trunc(x / y); }
vec2 fmodHLSL(vec2 x, vec2 y) { return x - y * trunc(x / y); }
vec3 fmodHLSL(vec3 x, vec3 y) { return x - y * trunc(x / y); }
vec4 fmodHLSL(vec4 x, vec4 y) { return x - y * trunc(x / y); }
mat2 fmodHLSL(mat2 x, mat2 y) { return x - matrixCompMult(y, mat2(trunc(x[0] / y[0]), trunc(x[1] / y[1]))); }
mat3 fmodHLSL(mat3 x, mat3 y) { return x - matrixCompMult(y, mat3(trunc(x[0] / y[0]), trunc(x[1] / y[1]), trunc(x[2] / y[2]))); }
mat4 fmodHLSL(mat4 x, mat4 y) { return x - matrixCompMult(y, mat4(trunc(x[0] / y[0]), trunc(x[1] / y[1]), trunc(x[2] / y[2]), trunc(x[3] / y[3]))); }
layout(std140, column_major, binding = 0) uniform _Globals {
	vec2 banner_position;
	mat4x4 g_imu_quat_data;
	vec4 g_look_ahead;
	uvec2 g_display_res;
	float g_display_fov;
	float g_display_zoom;
	float g_display_north_offset;
	bool g_virtual_display_enabled;
	float g_frametime;
	float g_lens_distance_ratio;
	vec4 imu_reset_data;
	vec4 g_date;
	vec4 g_keepalive_date;
	bool g_sbs_enabled;
	bool g_sbs_content;
	bool g_sbs_mode_stretched;
	bool g_custom_banner_enabled;
	uint day_in_seconds;
};
layout(binding = 0) uniform sampler2D V_ReShade_BackBuffer;
layout(binding = 1) uniform sampler2D V_ReShade_DepthBuffer;
float F_ReShade_GetLinearizedDepth(
	in vec2 texcoord)
{
	float _10 = texcoord.x / 1.00000000e+00;
	texcoord[0] = _10;
	float _13 = texcoord.y / 1.00000000e+00;
	texcoord[1] = _13;
	float _16 = texcoord.x - 0.00000000e+00;
	texcoord[0] = _16;
	float _19 = texcoord.y + 0.00000000e+00;
	texcoord[1] = _19;
	vec4 _24 = vec4(texcoord.x, texcoord.y, 0.00000000e+00, 0.00000000e+00);
	vec4 _25 = textureLod(V_ReShade_DepthBuffer, _24.xy, _24.w);
	float _28 = _25.x * 1.00000000e+00;
	float depth = _28;
	float _31 = 1.00000000e+00 - depth;
	depth = _31;
	float _33 = depth * 9.99000000e+02;
	float _35 = 1.00000000e+03 - _33;
	float _36 = depth / _35;
	depth = _36;
	return depth;
}
void F_PostProcessVS(
	in uint id,
	out vec4 position,
	out vec2 texcoord)
{
	bool _43 = id == 2u;
	float _46 = _43 ? 2.00000000e+00 : 0.00000000e+00;
	texcoord[0] = _46;
	bool _48 = id == 1u;
	float _51 = _48 ? 2.00000000e+00 : 0.00000000e+00;
	texcoord[1] = _51;
	vec2 _53 = texcoord * vec2(2.00000000e+00, -2.00000000e+00);
	vec2 _55 = _53 + vec2(-1.00000000e+00, 1.00000000e+00);
	vec4 _60 = vec4(_55.x, _55.y, 0.00000000e+00, 1.00000000e+00);
	position = _60;
	return;
}
layout(binding = 2) uniform sampler2D V_calibratingSampler;
layout(binding = 3) uniform sampler2D V_customBannerSampler;
vec3 F_applyLookAhead(
	in vec3 position,
	in vec3 velocity,
	in vec3 accel,
	in float t,
	in float t_squared)
{
	vec3 _91 = velocity * t.xxx;
	vec3 _92 = position + _91;
	vec3 _94 = vec3(5.00000000e-01, 5.00000000e-01, 5.00000000e-01) * accel;
	vec3 _96 = _94 * t_squared.xxx;
	vec3 _97 = _92 + _96;
	return _97;
}
vec4 F_quatMul(
	in vec4 q1,
	in vec4 q2)
{
	vec3 _105 = vec3(q1.x, q1.y, q1.z);
	vec3 u = _105;
	float s = q1.w;
	vec3 _112 = vec3(q2.x, q2.y, q2.z);
	vec3 v = _112;
	float t_115 = q2.w;
	vec3 _117 = s.xxx * v;
	vec3 _119 = t_115.xxx * u;
	vec3 _120 = _117 + _119;
	vec3 _121 = cross(u, v);
	vec3 _122 = _120 + _121;
	float _123 = s * t_115;
	float _124 = dot(u, v);
	float _125 = _123 - _124;
	vec4 _129 = vec4(_122.x, _122.y, _122.z, _125);
	return _129;
}
vec4 F_quatConj(
	in vec4 q)
{
	float _134 = -(q.x);
	float _136 = -(q.y);
	float _138 = -(q.z);
	vec4 _140 = vec4(_134, _136, _138, q.w);
	return _140;
}
vec3 F_applyQuaternionToVector(
	in vec4 q,
	in vec3 v)
{
	vec4 _149 = vec4(v.x, v.y, v.z, 0.00000000e+00);
	vec4 _150;
	vec4 _151;
	_150 = q;
	_151 = _149;
	vec4 _152 = F_quatMul(_150, _151);
	vec4 _153;
	_153 = q;
	vec4 _154 = F_quatConj(_153);
	vec4 _155;
	vec4 _156;
	_155 = _152;
	_156 = _154;
	vec4 _157 = F_quatMul(_155, _156);
	vec4 p = _157;
	return p.xyz;
}
vec3 F_rateOfChange(
	in vec3 v1,
	in vec3 v2,
	in float delta_time)
{
	vec3 _165 = v1 - v2;
	vec3 _167 = _165 / delta_time.xxx;
	return _167;
}
bool F_isKeepaliveRecent(
	in vec4 currentDate,
	in vec4 keepAliveDate)
{
	float _174 = currentDate.w + float(day_in_seconds);
	float _176 = _174 - keepAliveDate.w;
	float _178 = fmodHLSL(_176, float(day_in_seconds));
	float _179 = abs(_178);
	bool _181 = _179 <= 5.00000000e+00;
	return _181;
}
void F_PS_IMU_Transform(
	in vec4 pos,
	in vec2 texcoord,
	out vec4 color)
{
	vec4 _187;
	vec4 _188;
	_187 = g_date;
	_188 = g_keepalive_date;
	bool _189 = F_isKeepaliveRecent(_187, _188);
	bool is_keepalive_valid = _189;
	bool _191 = !bool(g_virtual_display_enabled);
	bool _192 = !bool(is_keepalive_valid);
	bool _193 = _191 || _192;
	bool shader_disabled = _193;
	bvec4 _196 = equal(g_imu_quat_data[0], imu_reset_data);
	bool _197 = all(_196);
	bvec4 _199 = equal(g_imu_quat_data[1], imu_reset_data);
	bool _200 = all(_199);
	bool _201 = _197 && _200;
	bool is_imu_reset_state = _201;
	float texcoord_x_min = 0.00000000e+00;
	float texcoord_x_max = 1.00000000e+00;
	vec2 screen_size = vec2(1.92000000e+03, 1.08000000e+03);
	float lens_y_offset = 0.00000000e+00;
	float lens_z_offset = 0.00000000e+00;
	bool _216 = !bool(shader_disabled);
	bool _217 = g_sbs_enabled && _216;
	if (_217)
	{
		bool _220 = texcoord.x > 5.00000000e-01;
		bool right_display = _220;
		if (false)
		{
			float _228 = screen_size.x / 2.00000000e+00;
			screen_size[0] = _228;
		}
		float _230 = g_lens_distance_ratio / 3.00000000e+00;
		lens_y_offset = _230;
		if (right_display)
		{
			float _234 = -(lens_y_offset);
			lens_y_offset = _234;
		}
		if (g_sbs_content)
		{
			if (right_display)
			{
				texcoord_x_min = 5.00000000e-01;
			}
			else
			{
				texcoord_x_max = 5.00000000e-01;
			}
		}
		bool _246 = !bool(g_sbs_mode_stretched);
		if (_246)
		{
			float _248 = max(2.50000000e-01, texcoord_x_min);
			texcoord_x_min = _248;
			float _250 = min(7.50000000e-01, texcoord_x_max);
			texcoord_x_max = _250;
		}
		float _253 = right_display ? 5.00000000e-01 : 0.00000000e+00;
		float _255 = texcoord.x - _253;
		float _257 = _255 * 2.00000000e+00;
		texcoord[0] = _257;
	}
	bool _261 = shader_disabled || is_imu_reset_state;
	if (_261)
	{
		vec2 banner_size = vec2(4.16666657e-01, 1.85185179e-01);
		bool _267 = !bool(shader_disabled);
		float _270 = banner_size.x / 2.00000000e+00;
		float _272 = banner_position.x - _270;
		bool _274 = texcoord.x >= _272;
		bool _275 = _267 && _274;
		float _278 = banner_size.x / 2.00000000e+00;
		float _280 = banner_position.x + _278;
		bool _282 = texcoord.x <= _280;
		bool _283 = _275 && _282;
		float _286 = banner_size.y / 2.00000000e+00;
		float _288 = banner_position.y - _286;
		bool _290 = texcoord.y >= _288;
		bool _291 = _283 && _290;
		float _294 = banner_size.y / 2.00000000e+00;
		float _296 = banner_position.y + _294;
		bool _298 = texcoord.y <= _296;
		bool _299 = _291 && _298;
		if (_299)
		{
			vec2 _301 = banner_size / vec2(2.00000000e+00, 2.00000000e+00);
			vec2 _302 = banner_position - _301;
			vec2 _303 = texcoord - _302;
			vec2 _304 = _303 / banner_size;
			vec2 banner_texcoord = _304;
			if (g_custom_banner_enabled)
			{
				vec4 _309 = texture(V_customBannerSampler, banner_texcoord);
				color = _309;
			}
			else
			{
				vec4 _310 = texture(V_calibratingSampler, banner_texcoord);
				color = _310;
			}
		}
		else
		{
			float _311 = texcoord_x_max - texcoord_x_min;
			float texcoord_width = _311;
			float _314 = texcoord.x * texcoord_width;
			float _315 = _314 + texcoord_x_min;
			texcoord[0] = _315;
			vec4 _316 = texture(V_ReShade_BackBuffer, texcoord);
			color = _316;
		}
	}
	else
	{
		float _319 = screen_size.x / screen_size.y;
		float screen_aspect_ratio = _319;
		uint _323 = g_display_res.x / g_display_res.y;
		float native_aspect_ratio = float(_323);
		float _327 = pow(screen_aspect_ratio, 2.00000000e+00);
		float _329 = _327 + 1.00000000e+00;
		float _330 = sqrt(_329);
		float diag_to_vert_ratio = _330;
		float _332 = g_display_fov / diag_to_vert_ratio;
		float _333 = radians(_332);
		float _335 = _333 / 2.00000000e+00;
		float half_fov_z_rads = _335;
		float _337 = half_fov_z_rads * screen_aspect_ratio;
		float half_fov_y_rads = _337;
		float _340 = 1.00000000e+00 - g_lens_distance_ratio;
		float screen_distance = _340;
		float _342 = lens_z_offset / screen_distance;
		float _343 = atan(_342);
		float lens_fov_z_offset_rads = _343;
		float _345 = half_fov_z_rads - lens_fov_z_offset_rads;
		float _346 = tan(_345);
		float _347 = _346 * screen_distance;
		float fov_z_pos = _347;
		float _349 = half_fov_z_rads + lens_fov_z_offset_rads;
		float _350 = tan(_349);
		float _351 = -(_350);
		float _352 = _351 * screen_distance;
		float fov_z_neg = _352;
		float _354 = fov_z_pos - fov_z_neg;
		float fov_z_width = _354;
		float _356 = lens_y_offset / screen_distance;
		float _357 = atan(_356);
		float lens_fov_y_offset_rads = _357;
		float _359 = half_fov_y_rads - lens_fov_y_offset_rads;
		float _360 = tan(_359);
		float _361 = _360 * screen_distance;
		float fov_y_pos = _361;
		float _363 = half_fov_y_rads + lens_fov_y_offset_rads;
		float _364 = tan(_363);
		float _365 = -(_364);
		float _366 = _365 * screen_distance;
		float fov_y_neg = _366;
		float _368 = fov_y_pos - fov_y_neg;
		float fov_y_width = _368;
		float vec_x = screen_distance;
		float _372 = -(texcoord.x);
		float _373 = _372 * fov_y_width;
		float _374 = _373 + fov_y_pos;
		float vec_y = _374;
		float _377 = -(texcoord.y);
		float _378 = _377 * fov_z_width;
		float _379 = _378 + fov_z_pos;
		float vec_z = _379;
		vec3 _381 = vec3(vec_x, vec_y, vec_z);
		vec3 texcoord_vector = _381;
		vec3 _383 = vec3(g_lens_distance_ratio, lens_y_offset, lens_z_offset);
		vec3 lens_vector = _383;
		vec4 _385;
		vec3 _386;
		_385 = g_imu_quat_data[0];
		_386 = texcoord_vector;
		vec3 _388 = F_applyQuaternionToVector(_385, _386);
		vec3 rotated_vector_t0 = _388;
		vec4 _390;
		vec3 _391;
		_390 = g_imu_quat_data[1];
		_391 = texcoord_vector;
		vec3 _393 = F_applyQuaternionToVector(_390, _391);
		vec3 rotated_vector_t1 = _393;
		vec4 _395;
		vec3 _396;
		_395 = g_imu_quat_data[2];
		_396 = texcoord_vector;
		vec3 _398 = F_applyQuaternionToVector(_395, _396);
		vec3 rotated_vector_t2 = _398;
		vec4 _400;
		vec3 _401;
		_400 = g_imu_quat_data[0];
		_401 = lens_vector;
		vec3 _403 = F_applyQuaternionToVector(_400, _401);
		vec3 rotated_lens_vector = _403;
		float _407 = g_imu_quat_data[3].x - g_imu_quat_data[3].y;
		float delta_time_t0 = _407;
		vec3 _409;
		vec3 _410;
		float _411;
		_409 = rotated_vector_t0;
		_410 = rotated_vector_t1;
		_411 = delta_time_t0;
		vec3 _412 = F_rateOfChange(_409, _410, _411);
		vec3 velocity_t0 = _412;
		float _416 = g_imu_quat_data[3].y - g_imu_quat_data[3].z;
		vec3 _417;
		vec3 _418;
		float _419;
		_417 = rotated_vector_t1;
		_418 = rotated_vector_t2;
		_419 = _416;
		vec3 _420 = F_rateOfChange(_417, _418, _419);
		vec3 velocity_t1 = _420;
		vec3 _422;
		vec3 _423;
		float _424;
		_422 = velocity_t0;
		_423 = velocity_t1;
		_424 = delta_time_t0;
		vec3 _425 = F_rateOfChange(_422, _423, _424);
		vec3 accel_t0 = _425;
		float _429 = texcoord.y * g_look_ahead.z;
		float look_ahead_scanline_adjust = _429;
		float _432 = g_frametime * g_look_ahead.y;
		float _434 = g_look_ahead.x + _432;
		float _436 = min(_434, g_look_ahead.w);
		float _438 = min(_436, 4.50000000e+01);
		float _439 = _438 + look_ahead_scanline_adjust;
		float look_ahead_ms = _439;
		float _442 = pow(look_ahead_ms, 2.00000000e+00);
		float look_ahead_ms_squared = _442;
		vec3 _444;
		vec3 _445;
		vec3 _446;
		float _447;
		float _448;
		_444 = rotated_vector_t0;
		_445 = velocity_t0;
		_446 = accel_t0;
		_447 = look_ahead_ms;
		_448 = look_ahead_ms_squared;
		vec3 _449 = F_applyLookAhead(_444, _445, _446, _447, _448);
		vec3 res = _449;
		bool _453 = res.x < 0.00000000e+00;
		bool looking_behind = _453;
		float _456 = g_sbs_enabled ? g_display_north_offset : 1.00000000e+00;
		float _458 = _456 - rotated_lens_vector.x;
		float display_distance = _458;
		float _461 = display_distance / res.x;
		vec3 _463 = res * _461.xxx;
		res = _463;
		vec3 _464 = rotated_lens_vector - lens_vector;
		vec3 _465 = res + _464;
		res = _465;
		float _467 = fov_y_pos - res.y;
		float _468 = _467 / fov_y_width;
		texcoord[0] = _468;
		float _470 = fov_z_pos - res.z;
		float _471 = _470 / fov_z_width;
		texcoord[1] = _471;
		float _472 = texcoord_x_max - texcoord_x_min;
		float texcoord_width_473 = _472;
		float _475 = texcoord.x * texcoord_width_473;
		float _476 = _475 + texcoord_x_min;
		texcoord[0] = _476;
		float _478 = texcoord_width_473 / 2.00000000e+00;
		float _479 = texcoord_x_min + _478;
		vec2 _481 = vec2(_479, 5.00000000e-01);
		vec2 texcoord_center = _481;
		vec2 _483 = texcoord - texcoord_center;
		texcoord = _483;
		vec2 _485 = texcoord / g_display_zoom.xx;
		texcoord = _485;
		vec2 _486 = texcoord + texcoord_center;
		texcoord = _486;
		bool _491 = texcoord.x < texcoord_x_min;
		bool _492 = looking_behind || _491;
		bool _495 = texcoord.y < 0.00000000e+00;
		bool _496 = _492 || _495;
		bool _498 = texcoord.x > texcoord_x_max;
		bool _499 = _496 || _498;
		bool _502 = texcoord.y > 1.00000000e+00;
		bool _503 = _499 || _502;
		bool _506 = texcoord.x <= 4.99999989e-03;
		bool _509 = texcoord.y <= 4.99999989e-03;
		bool _510 = _506 && _509;
		bool _511 = _503 || _510;
		if (_511)
		{
			color = vec4(0.00000000e+00, 0.00000000e+00, 0.00000000e+00, 1.00000000e+00);
		}
		else
		{
			vec4 _513 = texture(V_ReShade_BackBuffer, texcoord);
			color = _513;
		}
	}
	return;
}
#ifdef ENTRY_POINT_F_PostProcessVS
layout(location = 0) out vec2 _out_param2;
void main()
{
	uint _param0 = gl_VertexID;
	vec4 _param1;
	vec2 _param2;
	F_PostProcessVS(_param0, _param1, _param2);
	gl_Position = _param1;
	_out_param2 = _param2;
	return;
}
#endif
#ifdef ENTRY_POINT_F_PS_IMU_Transform
layout(location = 0) in vec2 _in_param1;
layout(location = 0) out vec4 _out_param2;
void main()
{
	vec4 _param0 = gl_FragCoord;
	vec2 _param1 = _in_param1;
	vec4 _param2;
	F_PS_IMU_Transform(_param0, _param1, _param2);
	_out_param2 = _param2;
	return;
}
#endif
