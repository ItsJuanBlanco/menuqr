import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const body = await req.json();
    
    // Verificar que es un evento de transacción aprobada
    const event = body.event;
    const transaction = body.data?.transaction;
    
    if (event !== 'transaction.updated' || transaction?.status !== 'APPROVED') {
      return new Response('OK', { status: 200 });
    }

    const reference = transaction.reference;
    
    // La referencia tiene formato: listo-{sesionId}-{timestamp}
    const sesionId = reference?.split('-').slice(1, 6).join('-');
    
    if (!sesionId) {
      return new Response('No sesion ID', { status: 200 });
    }

    // Conectar a Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Actualizar la sesión
    await supabase
      .from('sesiones')
      .update({ 
        pago_en_proceso: false,
        pago_pendiente_confirmacion: false,
        activa: false,
        referencia_wompi: reference
      })
      .eq('id', sesionId);

    // Archivar pedidos de esa sesión
    await supabase
      .from('pedidos')
      .update({ archivado: true })
      .eq('sesion_id', sesionId);

    // Verificar si la mesa quedó sin sesiones activas
    const { data: sesion } = await supabase
      .from('sesiones')
      .select('mesa_id')
      .eq('id', sesionId)
      .single();

    if (sesion?.mesa_id) {
      const { data: sesionesActivas } = await supabase
        .from('sesiones')
        .select('id')
        .eq('mesa_id', sesion.mesa_id)
        .eq('activa', true);

      if (!sesionesActivas?.length) {
        await supabase
          .from('mesas')
          .update({ estado: 'libre' })
          .eq('id', sesion.mesa_id);
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response('Error', { status: 500 });
  }
});