import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const body = await req.json();

    const event = body.event;
    const transaction = body.data?.transaction;

    if (event !== "transaction.updated" || transaction?.status !== "APPROVED") {
      return new Response("OK", { status: 200 });
    }

    const reference = transaction.reference;

    // Referencia: listo-{sesionId}-{timestamp}
    const sesionId = reference?.split("-").slice(1, 6).join("-");

    if (!sesionId) {
      return new Response("No sesion ID", { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabase
      .from("sesiones")
      .update({
        pago_en_proceso: false,
        pago_pendiente_confirmacion: true,
        referencia_wompi: transaction.id || reference,
      })
      .eq("id", sesionId);

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("Error", { status: 500 });
  }
});
