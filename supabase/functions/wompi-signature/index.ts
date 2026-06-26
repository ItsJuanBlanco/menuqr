import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { amount, reference } = await req.json();
    
    const integritySecret = Deno.env.get("WOMPI_INTEGRITY_SECRET");
    const publicKey = Deno.env.get("WOMPI_PUBLIC_KEY");
    
    if (!integritySecret || !publicKey) {
      throw new Error("Variables de entorno no configuradas");
    }

    const stringToHash = `${reference}${amount}COP${integritySecret}`;
    
    const encoder = new TextEncoder();
    const data = encoder.encode(stringToHash);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    return new Response(
      JSON.stringify({ signature, publicKey }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});