// Aviso de status pelo WhatsApp Business (Cloud API da Meta).
// Fora da janela de 24 h de conversa, a Meta só aceita mensagens de TEMPLATE aprovado.
// Crie um template (categoria Utilidade) com 3 variáveis, por exemplo:
//   "Oi, {{1}}! Aqui é da Juntô Doces. Pedido {{2}}: {{3}}"
// e informe o nome dele em WA_TEMPLATE_STATUS. Veja docs/WHATSAPP.md.

export async function notifyStatus(phone: string, firstName: string, code: string, text: string): Promise<boolean> {
  const token = Deno.env.get("WA_TOKEN");
  const phoneId = Deno.env.get("WA_PHONE_NUMBER_ID");
  const template = Deno.env.get("WA_TEMPLATE_STATUS");
  if (!token || !phoneId || !template) return false; // WhatsApp ainda não configurado

  const to = phone.length <= 11 ? `55${phone}` : phone;
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template,
        language: { code: "pt_BR" },
        components: [{
          type: "body",
          parameters: [firstName, code, text].map((t) => ({ type: "text", text: t })),
        }],
      },
    }),
  });
  if (!res.ok) console.error("WhatsApp falhou", res.status, await res.text());
  return res.ok;
}
