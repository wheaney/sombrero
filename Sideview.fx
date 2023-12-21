// ReShade shader to shrink the image toward one corner of the screen
#include "ReShade.fxh"

// general external can be disabled, overriding sideview_enabled
uniform bool g_disabled < source = "disabled"; defaultValue=true; >;

// 0 = top-left, 1 = top-right, 2 = bottom-left, 3 = bottom-right
uniform uint g_sideview_position < source = "sideview_position"; defaultValue=0; >;

uniform bool g_sideview_enabled < source = "sideview_enabled"; defaultValue=false; >;
uniform float g_sideview_display_size < source = "sideview_display_size"; defaultValue=1.0f; >;

uniform float4 g_date < source = "date"; >;
uniform float4 g_keepalive_date < source = "keepalive_date"; >;

uniform uint day_in_seconds = 24 * 60 * 60;

// super naive check, just make sure the times are within 5 seconds of each other, ignore year, month, day
bool is_keepalive_recent(float4 currentDate, float4 keepAliveDate)
{
    return abs((currentDate.w + day_in_seconds - keepAliveDate.w) % day_in_seconds) <= 5.0;
}

void PS_Sideview_Transform(float4 pos : SV_Position, float2 texcoord : TexCoord, out float4 color : SV_Target)
{
    bool is_keepalive_valid = is_keepalive_recent(g_date, g_keepalive_date);
    if (!g_disabled && g_sideview_enabled && is_keepalive_valid) {
        float texcoord_x_min = 0.0;
        float texcoord_x_max = 1.0;
        float texcoord_y_min = 0.0;
        float texcoord_y_max = 1.0;

        if (g_sideview_position == 0 || g_sideview_position == 1) {
            // top
            texcoord_y_max = g_sideview_display_size;
        } else {
            // bottom
            texcoord_y_min = 1.0 - g_sideview_display_size;
        }

        if (g_sideview_position == 0 || g_sideview_position == 2) {
            // left
            texcoord_x_max = g_sideview_display_size;
        } else {
            // right
            texcoord_x_min = 1.0 - g_sideview_display_size;
        }

        if (texcoord.x < texcoord_x_min || texcoord.x > texcoord_x_max || texcoord.y < texcoord_y_min || texcoord.y > texcoord_y_max)
            color = float4(0, 0, 0, 1);
        else {
            // scale texcoord.x and texcoord.y to the new range
            texcoord.x = (texcoord.x - texcoord_x_min) / g_sideview_display_size;
            texcoord.y = (texcoord.y - texcoord_y_min) / g_sideview_display_size;
            color = tex2D(ReShade::BackBuffer, texcoord);
        }
    } else {
        color = tex2D(ReShade::BackBuffer, texcoord);
    }
}

technique Transform < enabled = true; >
{
    pass
    {
        VertexShader = PostProcessVS;
        PixelShader = PS_Sideview_Transform;
    }
}