# WhatsApp

## O que já funciona sem configurar nada

- Depois do pedido, o site mostra o botão **Abrir conversa no WhatsApp** com o resumo pronto.
- Na área da loja, o botão **Avisar no WhatsApp** abre a conversa com o cliente com a mensagem da etapa atual.
  A loja só precisa tocar em enviar.

## Avisos automáticos (opcional)

Para o servidor enviar sozinho a cada mudança de etapa, use a **WhatsApp Business Platform (Cloud API)** da Meta.

1. Crie uma conta no Meta for Developers e um app com o produto WhatsApp.
2. Registre o número da loja (ele não pode estar em uso no app comum do WhatsApp).
3. Crie um **template** de mensagem (categoria Utilidade, idioma pt_BR) com três variáveis. Exemplo:
   `Oi, {{1}}! Aqui é da Juntô Doces. Pedido {{2}}: {{3}}`
   e espere a aprovação da Meta.
4. Guarde as chaves no Supabase:
   ```bash
   supabase secrets set WA_TOKEN=... WA_PHONE_NUMBER_ID=... WA_TEMPLATE_STATUS=nome_do_template
   ```
5. Pronto: `admin-orders` passa a chamar `_shared/whatsapp.ts` ao avançar a etapa. Se algo falhar,
   o painel continua mostrando o botão manual.

Observações:
- Fora da janela de 24 horas de conversa, a Meta só aceita mensagens de template aprovado.
- Mensagens de template são cobradas pela Meta por conversa. Confira os preços atuais antes de ativar.
- Antes de avisar clientes por WhatsApp, deixe claro no site que o número será usado para isso
  (o texto da tela de pedido já diz que os avisos vão para o WhatsApp informado).
