# Pagamento

## Recomendação

**Mercado Pago**, começando pelo **Pix** (já está implementado no projeto) e depois **cartão online**.

Por que:
- Conta simples de abrir para MEI/CNPJ e também para pessoa física.
- O Pix é gerado por API, com QR Code e Pix Copia e Cola, e o aviso de pagamento chega por webhook.
- O mesmo token serve depois para cartão (Checkout Pro ou Checkout Transparente), sem trocar de empresa.

Antes de decidir, compare as taxas atuais de Pix e cartão no site do Mercado Pago e nas alternativas,
porque mudam com o tempo e com o seu volume de vendas.

## Alternativas

| Opção | Quando faz sentido |
|---|---|
| **Pix manual (chave da loja)** | Para começar sem integração: a loja envia a chave no WhatsApp e confere o comprovante. Sem custo, mas dá trabalho e não confirma sozinho. |
| **Mercado Pago** | Melhor ponto de partida: Pix automático e cartão com a mesma conta. |
| **Asaas** | Boa opção se você quer cobrança Pix/boleto/cartão com painel financeiro mais completo. |
| **Pagar.me / Stripe** | Mais indicados quando o volume cresce ou você precisa de recursos avançados (split, recorrência). |
| **Maquininha na entrega** | Já está no site como "Cartão na entrega" e "Dinheiro". Não precisa de integração. |

## Como o Pix está ligado no código

- `supabase/functions/_shared/mercadopago.ts` cria o pedido de Pix na API Orders do Mercado Pago
  (`POST /v1/orders`, forma de pagamento `pix`, validade de 30 minutos).
- `create-order` chama essa função quando o cliente escolhe Pix e devolve o QR Code e o código Copia e Cola.
- `mp-webhook` recebe o aviso, consulta o pedido direto na API e só marca como pago se o status for
  `processed` com `accredited` e o valor pago cobrir o total.
- Se o Mercado Pago falhar na hora do pedido, o pedido continua salvo e o site avisa que a loja envia a chave no WhatsApp.

Documentação oficial usada:
- Pix pela API Orders: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/pix
- Notificações (webhooks) de Orders: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications
- Status dos pedidos: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/status/order-status

## Passo a passo para ligar

1. Crie a conta no Mercado Pago e uma aplicação em "Suas integrações".
2. Copie o **Access Token** de teste e, depois dos testes, o de produção.
3. Guarde no Supabase (nunca no site):
   ```bash
   supabase secrets set MP_ACCESS_TOKEN=APP_USR-... MP_PAYER_EMAIL=loja@seudominio.com
   ```
   `MP_PAYER_EMAIL` é um e-mail real da loja. O Mercado Pago exige um e-mail do pagador e o site não pede e-mail ao cliente.
4. Em "Webhooks" da sua aplicação, cadastre a URL:
   `https://SEU_PROJECT_REF.supabase.co/functions/v1/mp-webhook`
   e marque o tópico **Order** (pedidos).
5. Faça um pedido de teste com o token de teste e confira se `payment_status` vira `pago` na tabela `orders`.
6. Troque pelo token de produção.

## Pendências conhecidas

- O webhook confirma o pagamento consultando a API do Mercado Pago, mas ainda não valida a assinatura
  `x-signature` do aviso. Para endurecer, valide a assinatura com o segredo do painel de Webhooks
  (a página de notificações não descreve o formato do texto assinado, então confira no manual de
  segurança do Mercado Pago).
- Cartão online ainda não está no site. O caminho mais curto é o **Checkout Pro** (o cliente paga numa
  página do Mercado Pago e volta ao site); posso montar isso como próximo passo.
- Pix vence em 30 minutos. Se vencer, hoje a loja precisa reenviar a chave pelo WhatsApp.
