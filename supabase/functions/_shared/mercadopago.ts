// Mercado Pago: API Orders (Pix). Documentação:
// https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/pix
// O token de acesso fica só no servidor (secret MP_ACCESS_TOKEN). Nunca vai para o site.

const API = "https://api.mercadopago.com";

function headers(idempotencyKey?: string): HeadersInit {
  const token = Deno.env.get("MP_ACCESS_TOKEN");
  if (!token) throw new Error("MP_ACCESS_TOKEN não configurado");
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (idempotencyKey) h["X-Idempotency-Key"] = idempotencyKey;
  return h;
}

export type PixCharge = {
  mpOrderId: string;
  copyPaste: string;
  qrBase64: string;
};

export async function createPixOrder(opts: {
  code: string;            // vira external_reference
  totalCents: number;
  payerEmail: string;
}): Promise<PixCharge> {
  const amount = (opts.totalCents / 100).toFixed(2);
  const res = await fetch(`${API}/v1/orders`, {
    method: "POST",
    headers: headers(crypto.randomUUID()),
    body: JSON.stringify({
      type: "online",
      processing_mode: "automatic",
      total_amount: amount,
      external_reference: opts.code,
      payer: { email: opts.payerEmail },
      transactions: {
        payments: [{
          amount,
          payment_method: { id: "pix", type: "bank_transfer" },
          expiration_time: "PT30M",   // Pix vale por 30 minutos
        }],
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${JSON.stringify(data)}`);
  const pm = data?.transactions?.payments?.[0]?.payment_method;
  if (!data?.id || !pm?.qr_code) throw new Error("Resposta do Mercado Pago sem dados do Pix");
  return { mpOrderId: data.id, copyPaste: pm.qr_code, qrBase64: pm.qr_code_base64 ?? "" };
}

// Consulta o pedido direto no Mercado Pago. É a fonte de verdade para o webhook.
export async function getOrder(mpOrderId: string) {
  const res = await fetch(`${API}/v1/orders/${encodeURIComponent(mpOrderId)}`, { headers: headers() });
  if (!res.ok) throw new Error(`Mercado Pago GET ${res.status}`);
  return await res.json();
}
