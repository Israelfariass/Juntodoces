// Formato de pedido que sai para o cliente. Não inclui nome, endereço nem observações,
// porque quem acompanha só precisa do número de WhatsApp.

// deno-lint-ignore no-explicit-any
export function publicOrder(o: any) {
  const pixOpen = o.payment_method === "pix" && o.payment_status === "pendente" &&
    o.status !== "cancelado" && o.pix_copy_paste;
  return {
    code: o.code,
    created_at: o.created_at,
    fulfillment: o.fulfillment,
    status: o.status,
    payment_method: o.payment_method,
    payment_status: o.payment_status,
    total_cents: o.total_cents,
    // deno-lint-ignore no-explicit-any
    items: (o.order_items ?? []).map((i: any) => ({
      name: i.name, detail: i.detail, qty: i.qty, unit_price_cents: i.unit_price_cents,
    })),
    pix: pixOpen ? { copyPaste: o.pix_copy_paste, qrBase64: o.pix_qr_base64 ?? "" } : null,
  };
}
