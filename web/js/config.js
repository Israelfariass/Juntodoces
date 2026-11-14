// Configuração pública do site (pode ficar no navegador).
// Deixe supabaseUrl vazio para rodar em MODO DEMONSTRAÇÃO (pedidos só neste navegador).
// Para ligar o banco de dados, preencha os dois campos com os valores do painel do Supabase
// (Project Settings > API). A "anon key" é pública por desenho; a segurança está no RLS.
window.JD_CONFIG = {
  supabaseUrl: "",          // ex.: https://abcdefgh.supabase.co
  anonKey: "",              // chave "anon" / publishable
  lojaWhatsapp: "5551998828977"  // WhatsApp da loja (DDI+DDD+número, só dígitos)
};
