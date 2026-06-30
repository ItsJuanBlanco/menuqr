import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

function parseSesionId(reference: string | undefined): string | null {
  if (!reference?.startsWith("listo-")) return null;
  return reference.split("-").slice(1, 6).join("-") || null;
}

function parsePaymentAmount(transaction: Record<string, unknown>): number {
  const amountInCents = transaction.amount_in_cents ?? transaction.amountInCents;

  const cents = Number(amountInCents);
  if (!Number.isFinite(cents) || cents <= 0) return 0;

  return Math.round(cents / 100);
}

async function getSessionDeliveredTotal(supabase: SupabaseClient, sesionId: string): Promise<number> {
  const { data: items, error } = await supabase
    .from("pedido_items")
    .select(`
      subtotal,
      precio_unitario,
      cantidad,
      pedidos!inner ( sesion_id, archivado )
    `)
    .eq("pedidos.sesion_id", sesionId)
    .eq("pedidos.archivado", false)
    .eq("confirmado_por_mesero", true);

  if (error) throw error;

  return (items || []).reduce((sum, item) => {
    const row = item as {
      subtotal?: number | null;
      precio_unitario?: number | null;
      cantidad?: number | null;
    };
    return sum + Number(row.subtotal ?? Number(row.precio_unitario) * Number(row.cantidad));
  }, 0);
}

async function getSessionApprovedPaymentsTotal(
  supabase: SupabaseClient,
  sesionId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("pagos_grupo")
    .select("monto")
    .eq("sesion_id", sesionId)
    .eq("estado", "aprobado");

  if (error) throw error;

  return (data || []).reduce((sum, row) => sum + Number(row.monto), 0);
}

async function resolveSessionPaymentTargetTotal(
  supabase: SupabaseClient,
  sesionId: string,
  subtotal: number,
  paidTotal: number
): Promise<number> {
  if (subtotal <= 0) return 0;

  const { data: sesion, error: sesionError } = await supabase
    .from("sesiones")
    .select("cargo_servicio")
    .eq("id", sesionId)
    .maybeSingle();

  if (sesionError) throw sesionError;

  const accumulatedService = Number(sesion?.cargo_servicio) || 0;
  const serviceEnabled = accumulatedService > 0 || paidTotal > subtotal;
  const cargoServicio = serviceEnabled ? Math.round(subtotal * 0.1) : 0;

  return subtotal + cargoServicio;
}

serve(async (req) => {
  try {
    const body = await req.json();

    const event = body.event;
    const transaction = body.data?.transaction as Record<string, unknown> | undefined;

    if (event !== "transaction.updated" || transaction?.status !== "APPROVED") {
      return new Response("OK", { status: 200 });
    }

    const reference = String(transaction.reference || "");
    const sesionId = parseSesionId(reference);

    if (!sesionId) {
      return new Response("No sesion ID", { status: 200 });
    }

    const referenciaWompi = String(transaction.id || reference);
    const monto = parsePaymentAmount(transaction);

    if (monto <= 0) {
      console.error("Invalid payment amount for reference:", reference);
      return new Response("Invalid amount", { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: existingPayment, error: existingError } = await supabase
      .from("pagos_grupo")
      .select("id")
      .eq("referencia_wompi", referenciaWompi)
      .maybeSingle();

    if (existingError) throw existingError;

    if (!existingPayment) {
      const { error: insertError } = await supabase.from("pagos_grupo").insert({
        sesion_id: sesionId,
        monto,
        referencia_wompi: referenciaWompi,
        estado: "aprobado",
      });

      if (insertError) throw insertError;
    }

    const [paidTotal, sessionTotal] = await Promise.all([
      getSessionApprovedPaymentsTotal(supabase, sesionId),
      getSessionDeliveredTotal(supabase, sesionId),
    ]);

    const targetTotal = await resolveSessionPaymentTargetTotal(
      supabase,
      sesionId,
      sessionTotal,
      paidTotal
    );

    const updatePayload: Record<string, unknown> = {
      pago_en_proceso: false,
      referencia_wompi: referenciaWompi,
    };

    if (targetTotal > 0 && paidTotal >= targetTotal) {
      updatePayload.pago_pendiente_confirmacion = true;
    }

    const { error: sesionError } = await supabase
      .from("sesiones")
      .update(updatePayload)
      .eq("id", sesionId);

    if (sesionError) throw sesionError;

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("Error", { status: 500 });
  }
});
