// POST /functions/v1/admin-orders  { action: "list" | "advance" | "cancel" | "mark-paid", code? }
// Painel da loja. Exige login (Supabase Auth) de um usuário que esteja na tabela staff.
import { cors, db, fail, json, STATUS_FLOW, statusText } from "../_shared/common.ts";
import { notifyStatus } from "../_shared/whatsapp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Método não permitido", 405);

  // --- quem está chamando?
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(jwt);
  if (!auth?.user) return fail("Entre com seu e-mail e senha.", 401);
  const { data: staff } = await db.from("staff").select("user_id").eq("user_id", auth.user.id).maybeSingle();
  if (!staff) return fail("Este usuário não tem acesso ao painel da loja.", 403);

  let b: { action?: string; code?: string };
  try { b = await req.json(); } catch { return fail("Pedido inválido"); }

  if (b.action === "list") {
    const { data, error } = await db.from("orders")
      .select("*, order_items(*)")
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) { console.error(error); return fail("Não foi possível listar os pedidos.", 500); }
    return json({ orders: data });
  }

  const code = String(b.code ?? "");
  const { data: order } = await db.from("orders").select("*").eq("code", code).maybeSingle();
  if (!order) return fail("Pedido não encontrado.", 404);

  if (b.action === "mark-paid") {
    await db.from("orders").update({ payment_status: "pago" }).eq("id", order.id);
    return json({ ok: true });
  }

  let next: string | null = null;
  if (b.action === "cancel") {
    if (order.status === "entregue") return fail("Pedido já entregue.");
    next = "cancelado";
  } else if (b.action === "advance") {
    const i = STATUS_FLOW.indexOf(order.status);
    if (i < 0 || i >= STATUS_FLOW.length - 1) return fail("Este pedido não pode avançar.");
    next = STATUS_FLOW[i + 1];
  } else {
    return fail("Ação inválida.");
  }

  const { error } = await db.from("orders").update({ status: next }).eq("id", order.id);
  if (error) { console.error(error); return fail("Não foi possível atualizar o pedido.", 500); }
  await db.from("order_events").insert({ order_id: order.id, status: next });

  // Avisa o cliente pelo WhatsApp (se a API estiver configurada). Se não, o painel
  // mostra o botão "Avisar no WhatsApp" com a mensagem pronta.
  const first = String(order.customer_name).split(" ")[0];
  const notified = await notifyStatus(order.phone, first, order.code, statusText(next, order.fulfillment));

  return json({ ok: true, status: next, notified });
});
