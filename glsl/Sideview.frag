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
	uint g_sideview_position;
	bool g_sideview_enabled;
	float g_sideview_display_size;
	vec4 g_date;
	vec4 g_keepalive_date;
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
bool F_is_keepalive_recent(
	in vec4 currentDate,
	in vec4 keepAliveDate)
{
	float _73 = currentDate.w + float(day_in_seconds);
	float _75 = _73 - keepAliveDate.w;
	float _77 = fmodHLSL(_75, float(day_in_seconds));
	float _78 = abs(_77);
	bool _80 = _78 <= 5.00000000e+00;
	return _80;
}
void F_PS_Sideview_Transform(
	in vec4 pos,
	in vec2 texcoord,
	out vec4 color)
{
	vec4 _86;
	vec4 _87;
	_86 = g_date;
	_87 = g_keepalive_date;
	bool _88 = F_is_keepalive_recent(_86, _87);
	bool is_keepalive_valid = _88;
	bool _93 = g_sideview_enabled && is_keepalive_valid;
	if (_93)
	{
		float texcoord_x_min = 0.00000000e+00;
		float texcoord_x_max = 1.00000000e+00;
		float texcoord_y_min = 0.00000000e+00;
		float texcoord_y_max = 1.00000000e+00;
		bool _106 = g_sideview_position == 0u;
		bool _108 = g_sideview_position == 1u;
		bool _109 = _106 || _108;
		if (_109)
		{
			texcoord_y_max = g_sideview_display_size;
		}
		else
		{
			float _111 = 1.00000000e+00 - g_sideview_display_size;
			texcoord_y_min = _111;
		}
		bool _116 = g_sideview_position == 0u;
		bool _118 = g_sideview_position == 2u;
		bool _119 = _116 || _118;
		if (_119)
		{
			texcoord_x_max = g_sideview_display_size;
		}
		else
		{
			float _121 = 1.00000000e+00 - g_sideview_display_size;
			texcoord_x_min = _121;
		}
		bool _126 = g_sideview_position == 4u;
		if (_126)
		{
			float _128 = 1.00000000e+00 - g_sideview_display_size;
			float _130 = _128 / 2.00000000e+00;
			texcoord_y_min = _130;
			texcoord_x_min = _130;
			float _132 = 1.00000000e+00 + g_sideview_display_size;
			float _134 = _132 / 2.00000000e+00;
			texcoord_y_max = _134;
			texcoord_x_max = _134;
		}
		bool _139 = texcoord.x < texcoord_x_min;
		bool _141 = texcoord.x > texcoord_x_max;
		bool _142 = _139 || _141;
		bool _144 = texcoord.y < texcoord_y_min;
		bool _145 = _142 || _144;
		bool _147 = texcoord.y > texcoord_y_max;
		bool _148 = _145 || _147;
		if (_148)
		{
			color = vec4(0.00000000e+00, 0.00000000e+00, 0.00000000e+00, 1.00000000e+00);
		}
		else
		{
			float _151 = texcoord.x - texcoord_x_min;
			float _152 = _151 / g_sideview_display_size;
			texcoord[0] = _152;
			float _154 = texcoord.y - texcoord_y_min;
			float _155 = _154 / g_sideview_display_size;
			texcoord[1] = _155;
			vec4 _156 = texture(V_ReShade_BackBuffer, texcoord);
			color = _156;
		}
	}
	else
	{
		vec4 _157 = texture(V_ReShade_BackBuffer, texcoord);
		color = _157;
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
#ifdef ENTRY_POINT_F_PS_Sideview_Transform
layout(location = 0) in vec2 _in_param1;
layout(location = 0) out vec4 _out_param2;
void main()
{
	vec4 _param0 = gl_FragCoord;
	vec2 _param1 = _in_param1;
	vec4 _param2;
	F_PS_Sideview_Transform(_param0, _param1, _param2);
	_out_param2 = _param2;
	return;
}
#endif
