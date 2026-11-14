// POST /functions/v1/track-order  { phone }
// Devolve os últimos pedidos daquele WhatsApp, só com o que o cliente precisa ver
// (sem nome, endereço ou observações).
import { cors, db, fail, json, onlyDigits } from "../_shared/common.ts";
import { publicOrder } from "../_shared/public.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Método não permitido", 405);

  let b: { phone?: unknown };
  try { b = await req.json(); } catch { return fail("Pedido inválido"); }

  const phone = onlyDigits(b.phone);
  if (phone.length < 10 || phone.length > 11) return fail("Confira o número de WhatsApp com DDD.");

  const { data, error } = await db.from("orders")
    .select("*, order_items(*)")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(3);
  if (error) { console.error(error); return fail("Não foi possível buscar o pedido.", 500); }

  return json({ orders: (data ?? []).map(publicOrder) });
});
