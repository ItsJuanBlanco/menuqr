const WOMPI_PUBLIC_KEY = 'pub_test_sLvY32q8txNx6ygl0BrYaNo5w1aUkfMT';
const WOMPI_SIGNATURE_URL = `${SUPABASE_URL}/functions/v1/wompi-signature`;

function formatCOP(amount) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function setPagarMessage(type, message) {
  const hint = document.getElementById('pagarHint');
  const status = document.getElementById('pagarStatus');

  if (hint) hint.hidden = true;
  if (status) {
    status.hidden = false;
    status.className =
      type === 'success'
        ? 'pagar-page__success'
        : type === 'error'
          ? 'pagar-page__error'
          : 'pagar-page__status';
    status.textContent = message;
  }
}

async function getSessionApprovedPaymentsTotal(sesionId) {
  const { data, error } = await supabaseClient
    .from('pagos_grupo')
    .select('monto')
    .eq('sesion_id', sesionId)
    .eq('estado', 'aprobado');

  if (error) throw error;

  return (data || []).reduce((sum, row) => sum + Number(row.monto), 0);
}

async function getSessionDeliveredTotal(sesionId, restauranteId) {
  const { data, error } = await supabaseClient
    .from('pedido_items')
    .select(`
      subtotal,
      precio_unitario,
      cantidad,
      confirmado_por_mesero,
      pedidos!inner ( sesion_id, archivado, restaurante_id )
    `)
    .eq('pedidos.sesion_id', sesionId)
    .eq('pedidos.restaurante_id', restauranteId)
    .eq('pedidos.archivado', false)
    .eq('confirmado_por_mesero', true);

  if (error) throw error;

  return (data || []).reduce(
    (sum, item) => sum + Number(item.subtotal ?? item.precio_unitario * item.cantidad),
    0
  );
}

async function clearPaymentInProgress(sesionId) {
  await supabaseClient.from('sesiones').update({ pago_en_proceso: false }).eq('id', sesionId);
}

async function markPaymentInProgress(sesionId) {
  const { error } = await supabaseClient
    .from('sesiones')
    .update({ pago_en_proceso: true })
    .eq('id', sesionId);

  if (error) throw error;
}

async function saveSessionPaymentExtras(sesionId, { cargoServicio = 0, propina = 0 } = {}) {
  if (!sesionId || (cargoServicio <= 0 && propina <= 0)) return;

  const { data, error: readError } = await supabaseClient
    .from('sesiones')
    .select('cargo_servicio, propina')
    .eq('id', sesionId)
    .maybeSingle();

  if (readError) throw readError;

  const { error } = await supabaseClient
    .from('sesiones')
    .update({
      cargo_servicio: (Number(data?.cargo_servicio) || 0) + cargoServicio,
      propina: (Number(data?.propina) || 0) + propina,
    })
    .eq('id', sesionId);

  if (error) throw error;
}

async function handleApprovedPayment(monto, sesionId, referenciaWompi, restauranteId, extras = {}) {
  const cargoServicio = Number(extras.cargoServicio) || 0;
  const propina = Number(extras.propina) || 0;

  const { error: insertError } = await supabaseClient.from('pagos_grupo').insert({
    sesion_id: sesionId,
    monto,
    referencia_wompi: referenciaWompi,
    estado: 'aprobado',
  });

  if (insertError) throw insertError;

  await saveSessionPaymentExtras(sesionId, { cargoServicio, propina });

  const paidTotal = await getSessionApprovedPaymentsTotal(sesionId);
  const sessionTotal = await getSessionDeliveredTotal(sesionId, restauranteId);

  if (sessionTotal > 0 && paidTotal >= sessionTotal) {
    const { error } = await supabaseClient
      .from('sesiones')
      .update({ pago_pendiente_confirmacion: true, pago_en_proceso: false })
      .eq('id', sesionId);

    if (error) throw error;

    setPagarMessage(
      'success',
      'Pago registrado. La cuenta está completa y el mesero la confirmará.'
    );
    return;
  }

  await clearPaymentInProgress(sesionId);
  setPagarMessage('success', 'Pago registrado. Tu parte fue acreditada a la cuenta.');
}

async function fetchWompiSignature(amountInCents, reference) {
  const response = await fetch(WOMPI_SIGNATURE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ amount: amountInCents, reference }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'No se pudo obtener la firma de Wompi.');
  }

  if (!data.signature || !data.publicKey) {
    throw new Error('Respuesta inválida del servidor de pagos.');
  }

  return data;
}

function buildPagarRedirectUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('id');
  url.searchParams.delete('status');
  url.searchParams.delete('reference');
  return url.toString();
}

async function openWompiCheckout({ monto, sesionId, parte, publicKey, restauranteId, cargoServicio = 0 }) {
  if (typeof WidgetCheckout === 'undefined') {
    setPagarMessage('error', 'No se pudo cargar Wompi. Recarga la página.');
    return;
  }

  await markPaymentInProgress(sesionId);

  const reference = parte
    ? `sesion-${sesionId}-parte-${parte}-${Date.now()}`
    : `sesion-${sesionId}-${Date.now()}`;
  const amountInCents = Math.round(monto * 100);

  try {
    const { signature, publicKey: signedPublicKey } = await fetchWompiSignature(
      amountInCents,
      reference
    );

    const checkout = new WidgetCheckout({
      currency: 'COP',
      amountInCents,
      reference,
      publicKey: signedPublicKey || publicKey,
      signature: { integrity: signature },
      redirectUrl: buildPagarRedirectUrl(),
    });

    checkout.open(async (result) => {
      const transaction = result?.transaction;

      if (transaction?.status === 'APPROVED') {
        try {
          const referencia = transaction.id || transaction.reference || reference;
          await handleApprovedPayment(monto, sesionId, referencia, restauranteId, { cargoServicio });
        } catch (error) {
          console.error(error);
          await clearPaymentInProgress(sesionId);
          setPagarMessage('error', error.message || 'No se pudo registrar el pago.');
        }
        return;
      }

      await clearPaymentInProgress(sesionId);
      setPagarMessage('error', 'El pago no se completó. Puedes intentar de nuevo.');
    });
  } catch (error) {
    console.error(error);
    await clearPaymentInProgress(sesionId);
    setPagarMessage('error', error.message || 'No se pudo iniciar el pago con Wompi.');
  }
}

async function initPagar() {
  const params = new URLSearchParams(window.location.search);
  const monto = Number(params.get('monto'));
  const sesionId = params.get('sesion');
  const parte = params.get('parte');

  if (!monto || monto <= 0 || !sesionId) {
    setPagarMessage('error', 'Enlace de pago inválido.');
    return;
  }

  document.getElementById('pagarAmount').textContent = formatCOP(monto);

  try {
    const { data: sesion, error: sesionError } = await supabaseClient
      .from('sesiones')
      .select('id, restaurante_id, activa, pago_pendiente_confirmacion')
      .eq('id', sesionId)
      .maybeSingle();

    if (sesionError) throw sesionError;
    if (!sesion) {
      setPagarMessage('error', 'Sesión no encontrada.');
      return;
    }

    if (sesion.activa === false) {
      setPagarMessage('error', 'Esta cuenta ya no está activa.');
      return;
    }

    if (sesion.pago_pendiente_confirmacion) {
      setPagarMessage('success', 'Esta cuenta ya fue pagada completamente.');
      return;
    }

    const { data: restaurante, error: restauranteError } = await supabaseClient
      .from('restaurantes')
      .select('nombre, wompi_public_key')
      .eq('id', sesion.restaurante_id)
      .maybeSingle();

    if (restauranteError) throw restauranteError;

    if (restaurante?.nombre) {
      document.title = `${restaurante.nombre} · Pagar`;
      document.getElementById('pagarTitle').textContent = restaurante.nombre;
    }

    const publicKey = restaurante?.wompi_public_key || WOMPI_PUBLIC_KEY;

    const cargoServicio = Number(params.get('servicio')) || 0;

    await openWompiCheckout({
      monto,
      sesionId,
      parte,
      publicKey,
      restauranteId: sesion.restaurante_id,
      cargoServicio,
    });
  } catch (error) {
    console.error(error);
    setPagarMessage('error', error.message || 'No se pudo iniciar el pago.');
  }
}

initPagar();
