import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const MENU_PROMPT =
  'Analiza esta foto de una carta/menú de restaurante. Extrae TODOS los productos visibles y devuelve ÚNICAMENTE un JSON array (sin texto adicional, sin markdown, sin backticks) con este formato exacto: [{"nombre": "...", "descripcion": "...", "precio": numero_entero, "categoria": "..."}]. Si no hay descripción visible, generar una breve basada en el nombre. Las categorías deben ser generales como Entradas, Platos Fuertes, Bebidas, Postres.';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanClaudeJson(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido. Usá POST." }, 405);
  }

  try {
    const { image_base64, media_type } = await req.json();

    if (!image_base64 || typeof image_base64 !== "string") {
      return jsonResponse({ error: "Falta image_base64 en el body." }, 400);
    }

    if (!media_type || typeof media_type !== "string") {
      return jsonResponse({ error: "Falta media_type en el body." }, 400);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "ANTHROPIC_API_KEY no está configurada en Supabase." }, 500);
    }

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type,
                  data: image_base64,
                },
              },
              {
                type: "text",
                text: MENU_PROMPT,
              },
            ],
          },
        ],
      }),
    });

    const anthropicData = await anthropicResponse.json();

    if (!anthropicResponse.ok) {
      const message =
        anthropicData?.error?.message ||
        anthropicData?.error?.type ||
        anthropicData?.error ||
        "Anthropic devolvió un error.";

      return jsonResponse({ error: String(message) }, 400);
    }

    const textBlock = anthropicData.content?.find((block: { type?: string }) => block.type === "text");
    const rawText = textBlock?.text;

    if (!rawText || typeof rawText !== "string") {
      return jsonResponse({ error: "Claude no devolvió texto parseable." }, 400);
    }

    let products: unknown;
    try {
      products = JSON.parse(cleanClaudeJson(rawText));
    } catch {
      return jsonResponse(
        {
          error: "No se pudo parsear el JSON devuelto por Claude.",
          raw: rawText.slice(0, 800),
        },
        400,
      );
    }

    if (!Array.isArray(products)) {
      return jsonResponse({ error: "La respuesta de Claude no es un array JSON." }, 400);
    }

    return jsonResponse(products, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor.";
    return jsonResponse({ error: message }, 500);
  }
});
