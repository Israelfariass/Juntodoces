// POST /functions/v1/mp-webhook
// O Mercado Pago avisa aqui quando o status de um pedido muda (tópico "Order").
// Não confiamos no conteúdo do aviso: usamos só o id e consultamos o pedido direto
// na API do Mercado Pago com o nosso token. Só então marcamos como pago.
import { db } from "../_shared/common.ts";
import { getOrder } from "../_shared/mercadopago.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");

  let body: { type?: string; action?: string; data?: { id?: string } } = {};
  try { body = await req.json(); } catch { /* aviso sem corpo */ }

  const url = new URL(req.url);
  const type = body.type ?? url.searchParams.get("type");
  const mpOrderId = body.data?.id ?? url.searchParams.get("data.id");
  if (type !== "order" || !mpOrderId) return new Response("ignored");

  try {
    const mp = await getOrder(mpOrderId);
    const code = String(mp.external_reference ?? "");

    const { data: order } = await db.from("orders").select("id, total_cents, mp_order_id")
      .eq("code", code).maybeSingle();
    if (!order || order.mp_order_id !== mpOrderId) return new Response("unknown order");

    let paymentStatus: string | null = null;
    if (mp.status === "processed" && mp.status_detail === "accredited") {
      // confere o valor pago antes de dar como pago
      const paid = Math.round(Number(mp.total_paid_amount ?? mp.total_amount) * 100);
      if (paid >= order.total_cents) paymentStatus = "pago";
      else console.error("Valor pago menor que o total", code, paid, order.total_cents);
    } else if (mp.status === "failed" || mp.status === "canceled") {
      paymentStatus = "falhou";
    } else if (mp.status === "refunded") {
      paymentStatus = "reembolsado";
    }

    if (paymentStatus) {
      await db.from("orders").update({ payment_status: paymentStatus }).eq("id", order.id);
    }
    return new Response("ok");
  } catch (err) {
    console.error("mp-webhook", err);
    return new Response("error", { status: 500 }); // o Mercado Pago tenta de novo
  }
});
