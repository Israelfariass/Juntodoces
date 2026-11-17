# Juntô Doces: cardápio digital e gestor de pedidos

Cardápio digital de açaí no estilo dos apps de delivery: capa da loja com status aberto/fechado, categorias fixas
no topo, janela do produto com complementos, sacola, pedido e acompanhamento pelo número do WhatsApp.
A loja usa um gestor (`admin.html`) para receber pedidos, pausar itens e mudar preços e horários.

## Estrutura de pastas

```
juntodoces/
├── README.md                    este guia
├── netlify.toml                 publica a pasta web/ no Netlify
├── .env.example                 modelo das chaves secretas (copie para .env, nunca suba o .env)
├── .gitignore
├── web/                         o site (HTML, CSS e JS puros, sem build)
│   ├── index.html               cardápio do cliente
│   ├── admin.html               gestor da loja (login)
│   ├── css/style.css            visual e cores da marca (variáveis no :root)
│   ├── css/admin.css            estilos só do gestor
│   ├── js/config.js             endereço do Supabase, chave pública e WhatsApp da loja
│   ├── js/api.js                fala com o banco; sem Supabase configurado roda em modo demonstração
│   ├── js/app.js                telas do cliente: cardápio, produto, sacola, finalizar, acompanhar
│   ├── js/admin.js              telas da loja: pedidos, cardápio, configurações
│   └── assets/                  logo e imagens
├── supabase/                    banco de dados e servidor
│   ├── config.toml              quais funções são públicas
│   ├── seed.sql                 loja, categoria Açaí e complementos iniciais (exemplos)
│   ├── migrations/
│   │   ├── 0001_schema.sql      pedidos, itens, histórico, equipe e regras de segurança (RLS)
│   │   └── 0002_catalog_v2.sql  categorias, complementos, permissões da equipe
│   └── functions/               código que roda no servidor (Deno / TypeScript)
│       ├── _shared/             banco, Mercado Pago, WhatsApp, horário da loja, formato público
│       ├── create-order/        recalcula preços e complementos, valida loja aberta e mínimo, gera o Pix
│       ├── track-order/         devolve os pedidos de um número de WhatsApp
│       ├── admin-orders/        gestor: listar, avançar etapa, cancelar, marcar pago (exige login)
│       └── mp-webhook/          recebe o aviso de pagamento do Mercado Pago
└── docs/
    ├── PAGAMENTO.md             opções de pagamento e como ligar o Pix
    └── WHATSAPP.md              avisos automáticos de status pelo WhatsApp
```

## O que o cliente vê

- Capa, logo, status (aberto até que horas, ou quando abre), tempo de entrega, taxa e pedido mínimo.
- Busca e categorias que acompanham a rolagem.
- Janela do produto com grupos de complementos: obrigatórios ou opcionais, com mínimo, máximo e
  quantidade inclusa (açaí: 3 acompanhamentos grátis; Barca P: 5 grátis; adicionais pagos à parte). Campo de observação.
- Sacola, finalização (entrega ou retirada, Pix, cartão na entrega ou dinheiro) e acompanhamento só com o WhatsApp.

## O que a loja vê (`admin.html`)

- **Pedidos:** quadro com Novos, Em preparo, Saiu/pronto e Concluídos. Atualiza a cada 15 segundos e
  toca um aviso quando chega pedido novo (ligue o som no botão do topo). Botões para avançar a etapa,
  chamar o cliente no WhatsApp, marcar pago e cancelar.
- **Cardápio:** muda o preço e pausa itens e complementos que acabaram. Também cria, renomeia e remove
  categorias e produtos (com os complementos que quiser), para quando a loja passar a vender mais do que açaí.
  Vale na hora para os clientes. Enquanto houver só uma categoria, o site não mostra a barra de abas.
- **Loja:** abrir e fechar na hora, ou seguir os horários; taxa de entrega, pedido mínimo, tempo e WhatsApp.

## Segurança em resumo

- As tabelas de pedidos têm RLS ligado e nenhuma política pública: o site não lê nem grava nelas direto.
  Só as Edge Functions (chave `service_role`, guardada no servidor) acessam os pedidos.
- Preços, complementos, loja aberta e pedido mínimo são conferidos no servidor. O preço que o site
  mostra nunca é usado para cobrar.
- Quem acompanha pelo número de WhatsApp vê só código, etapa, itens e total. Nome, endereço e
  observações não saem do servidor.
- O cardápio e as configurações são públicos para leitura. Para escrever, só usuários da tabela `staff`.
- Token do Mercado Pago e `service_role` ficam em secrets do Supabase, nunca no site.
- `track-order` não pede login (é a ideia do "só o número"). Antes de divulgar, ative limite de
  requisições/proteção de bots no Netlify ou no Cloudflare.

## Rodar agora (modo demonstração)

Abra `web/index.html` no navegador, ou rode `npx serve web`. Sem Supabase configurado, os pedidos
ficam só neste navegador e o gestor (`admin.html`) abre sem senha, para você testar o fluxo inteiro.

## Ligar o banco de dados (Supabase)

Pré-requisitos: conta no Supabase e a [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
cd juntodoces
supabase login
supabase link --project-ref SEU_PROJECT_REF

supabase db push                                  # roda 0001 e 0002
psql "$DATABASE_URL" -f supabase/seed.sql         # ou cole o seed.sql no SQL Editor

supabase secrets set MP_ACCESS_TOKEN=... MP_PAYER_EMAIL=loja@seudominio.com ALLOWED_ORIGIN=https://seusite.netlify.app

supabase functions deploy create-order
supabase functions deploy track-order
supabase functions deploy mp-webhook
supabase functions deploy admin-orders
```

Depois:

1. Em `web/js/config.js`, preencha `supabaseUrl` e `anonKey` (Project Settings > API).
2. Crie o usuário da loja em Authentication > Users (e-mail e senha).
3. No SQL Editor, libere esse usuário no gestor:
   ```sql
   insert into public.staff (user_id, name)
   select id, 'Loja' from auth.users where email = 'loja@seudominio.com';
   ```
4. Abra `admin.html`, entre e ajuste preços, horários e WhatsApp da loja. O `seed.sql` deixa a loja em
   modo "aberta"; troque para "Automático" quando preencher os horários.

## Publicar o site

Netlify: arraste a pasta `web/` para o painel, ou conecte o repositório (o `netlify.toml` já aponta para `web/`).

## Fotos dos produtos

A coluna `products.image_url` aceita o endereço de uma imagem. Crie um bucket público no Supabase Storage,
envie as fotos e cole o endereço em `image_url`. Ainda não há envio de foto pelo gestor.

## Próximos passos sugeridos

- Pagamento: `docs/PAGAMENTO.md` (Pix pelo Mercado Pago já está no código; cartão online é o passo seguinte).
- Avisos automáticos no WhatsApp: `docs/WHATSAPP.md`.
- Envio de fotos e criação de novos grupos de complementos pelo gestor, cupons de desconto e taxa de entrega por bairro.
- Trocar a batedeira desenhada em SVG pelo logo oficial (arquivo em `web/assets/`).
