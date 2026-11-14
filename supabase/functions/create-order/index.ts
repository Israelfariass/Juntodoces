// POST /functions/v1/create-order
// Recebe o carrinho, recalcula tudo no servidor (preços, complementos, mínimo, loja aberta),
// grava o pedido e, se o pagamento for Pix, gera a cobrança no Mercado Pago.
import { cors, db, fail, json, onlyDigits } from "../_shared/common.ts";
import { createPixOrder } from "../_shared/mercadopago.ts";
import { publicOrder } from "../_shared/public.ts";
import { isStoreOpen } from "../_shared/store.ts";

type InItem = { productId: string; qty: number; selections?: Record<string, string[]>; note?: string };

const PAY = ["pix", "cartao", "dinheiro"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Método não permitido", 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return fail("Pedido inválido"); }

  // --- dados do cliente
  const name = String(b.name ?? "").trim().slice(0, 80);
  const phone = onlyDigits(b.phone);
  const fulfillment = b.fulfillment === "retirada" ? "retirada" : b.fulfillment === "entrega" ? "entrega" : "";
  const address = String(b.address ?? "").trim().slice(0, 200);
  const pay = String(b.pay ?? "");
  const notes = String(b.notes ?? "").trim().slice(0, 300);
  const cashChange = pay === "dinheiro" ? String(b.cashChangeFor ?? "").trim().slice(0, 20) : "";
  const items = Array.isArray(b.items) ? (b.items as InItem[]) : [];

  if (!name) return fail("Informe seu nome.");
  if (phone.length < 10 || phone.length > 11) return fail("Confira o número de WhatsApp com DDD.");
  if (!fulfillment) return fail("Escolha entrega ou retirada.");
  if (fulfillment === "entrega" && address.length < 5) return fail("Informe o endereço de entrega.");
  if (!PAY.includes(pay)) return fail("Escolha a forma de pagamento.");
  if (items.length < 1 || items.length > 30) return fail("A sacola está vazia ou grande demais.");

  // --- limite simples contra abuso: no máximo 5 pedidos do mesmo número em 10 minutos
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await db.from("orders").select("id", { count: "exact", head: true })
    .eq("phone", phone).gte("created_at", since);
  if ((count ?? 0) >= 5) return fail("Muitos pedidos em pouco tempo. Tente de novo em alguns minutos.", 429);

  // --- configurações da loja
  const { data: settingsRows, error: sErr } = await db.from("settings").select("key, value");
  if (sErr || !settingsRows) return fail("Não foi possível carregar a loja.", 500);
  const cfg = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
  if (!isStoreOpen(String(cfg.loja_modo ?? "aberta"), cfg.horarios ?? null)) {
    return fail("A loja está fechada agora. Volte no horário de funcionamento.", 409);
  }
  const feeCents = fulfillment === "entrega" ? Number(cfg.taxa_entrega_cents ?? 0) : 0;
  const minCents = Number(cfg.pedido_minimo_cents ?? 0);

  // --- produtos, grupos e opções usados no pedido
  const productIds = [...new Set(items.map((i) => String(i.productId)))];
  const { data: products } = await db.from("products")
    .select("id, name, price_cents, active, paused").in("id", productIds);
  const { data: links } = await db.from("product_groups").select("product_id, group_id").in("product_id", productIds);
  const groupIds = [...new Set((links ?? []).map((l) => l.group_id))];
  const { data: groups } = groupIds.length
    ? await db.from("option_groups").select("id, title, min_select, max_select, free_select").in("id", groupIds)
    : { data: [] as { id: string; title: string; min_select: number; max_select: number; free_select: number }[] };
  const { data: options } = groupIds.length
    ? await db.from("options").select("id, group_id, name, price_cents, active").in("group_id", groupIds)
    : { data: [] as { id: string; group_id: string; name: string; price_cents: number; active: boolean }[] };

  const prodById = new Map((products ?? []).map((p) => [p.id, p]));
  const groupById = new Map((groups ?? []).map((g) => [g.id, g]));
  const optById = new Map((options ?? []).map((o) => [o.id, o]));

  // --- recalcula cada item
  const lines: { name: string; detail: string; qty: number; unit: number }[] = [];
  for (const it of items) {
    const qty = Number(it.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) return fail("Quantidade inválida.");
    const p = prodById.get(String(it.productId));
    if (!p || !p.active) return fail("Um dos itens não existe mais. Atualize o cardápio.");
    if (p.paused) return fail(`${p.name} está indisponível no momento.`);

    const allowed = (links ?? []).filter((l) => l.product_id === p.id).map((l) => l.group_id);
    const sel = it.selections ?? {};
    for (const gid of Object.keys(sel)) {
      if (!allowed.includes(gid)) return fail("Complemento inválido.");
    }

    let unit = p.price_cents;
    const labels: string[] = [];
    for (const gid of allowed) {
      const g = groupById.get(gid);
      if (!g) continue;
      const ids = [...new Set((sel[gid] ?? []).map(String))];
      if (ids.length < g.min_select) return fail(`Escolha ${g.min_select === 1 ? "uma opção" : g.min_select + " opções"} em "${g.title}".`);
      if (ids.length > g.max_select) return fail(`Escolha no máximo ${g.max_select} em "${g.title}".`);
      const chosen = [];
      for (const oid of ids) {
        const o = optById.get(oid);
        if (!o || o.group_id !== gid || !o.active) return fail("Um complemento escolhido não está disponível.");
        chosen.push(o);
      }
      // os inclusos valem para as opções mais caras; as demais cobram o preço da opção
      const charged = [...chosen].sort((a, c) => c.price_cents - a.price_cents).slice(g.free_select);
      unit += charged.reduce((s, o) => s + o.price_cents, 0);
      labels.push(...chosen.map((o) => o.name));
    }
    const note = String(it.note ?? "").trim().slice(0, 120);
    const detail = [labels.join(", "), note ? `Obs: ${note}` : ""].filter(Boolean).join(" · ");
    lines.push({ name: p.name, detail, qty, unit });
  }

  const subtotal = lines.reduce((s, l) => s + l.unit * l.qty, 0);
  if (subtotal < minCents) {
    return fail(`O pedido mínimo é R$ ${(minCents / 100).toFixed(2).replace(".", ",")}.`);
  }
  const total = subtotal + feeCents;

  // --- grava o pedido
  const { data: order, error: oErr } = await db.from("orders").insert({
    customer_name: name,
    phone,
    fulfillment,
    address: fulfillment === "entrega" ? address : null,
    payment_method: pay,
    cash_change_for: cashChange || null,
    notes: notes || null,
    subtotal_cents: subtotal,
    fee_cents: feeCents,
    total_cents: total,
  }).select("id, code").single();
  if (oErr || !order) { console.error(oErr); return fail("Não foi possível salvar o pedido.", 500); }

  const { error: iErr } = await db.from("order_items").insert(
    lines.map((l) => ({ order_id: order.id, name: l.name, detail: l.detail, qty: l.qty, unit_price_cents: l.unit })),
  );
  if (iErr) {
    console.error(iErr);
    await db.from("orders").delete().eq("id", order.id);
    return fail("Não foi possível salvar os itens do pedido.", 500);
  }
  await db.from("order_events").insert({ order_id: order.id, status: "recebido" });

  // --- Pix: gera a cobrança. Se falhar, o pedido continua e a loja envia a chave no WhatsApp.
  let pix: { copyPaste: string; qrBase64: string } | null = null;
  let pixError = false;
  if (pay === "pix") {
    try {
      const payerEmail = Deno.env.get("MP_PAYER_EMAIL");
      if (!payerEmail) throw new Error("MP_PAYER_EMAIL não configurado");
      const charge = await createPixOrder({ code: order.code, totalCents: total, payerEmail });
      await db.from("orders").update({
        mp_order_id: charge.mpOrderId,
        pix_copy_paste: charge.copyPaste,
        pix_qr_base64: charge.qrBase64,
      }).eq("id", order.id);
      pix = { copyPaste: charge.copyPaste, qrBase64: charge.qrBase64 };
    } catch (err) {
      console.error("Pix falhou", err);
      pixError = true;
    }
  }

  const { data: full } = await db.from("orders").select("*, order_items(*)").eq("id", order.id).single();
  return json({ order: publicOrder(full), pix, pixError });
});
