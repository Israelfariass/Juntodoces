// Utilidades compartilhadas pelas Edge Functions.
import { createClient } from "npm:@supabase/supabase-js@2";

export const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// Em produção, troque "*" pelo endereço do seu site (ex.: https://juntodoces.netlify.app).
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

export const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export const onlyDigits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

export const STATUS_FLOW = ["recebido", "preparo", "rota", "entregue"] as const;

export function statusText(status: string, fulfillment: string): string {
  const retirada = fulfillment === "retirada";
  switch (status) {
    case "recebido": return "Pedido recebido. A Juntô Doces recebeu o seu pedido.";
    case "preparo":  return "Em preparo. Estamos montando tudo com carinho.";
    case "rota":     return retirada ? "Pronto para retirar. Pode vir buscar." : "Saiu para entrega. Seu pedido está a caminho.";
    case "entregue": return retirada ? "Retirado. Bom apetite!" : "Entregue. Bom apetite!";
    case "cancelado": return "Pedido cancelado. Fale com a gente se precisar de ajuda.";
    default: return status;
  }
}
