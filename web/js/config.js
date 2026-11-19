// Configuração pública do site (pode ficar no navegador).
// Deixe supabaseUrl vazio para rodar em MODO DEMONSTRAÇÃO (pedidos só neste navegador).
// Para ligar o banco de dados, preencha os dois campos com os valores do painel do Supabase
// (Project Settings > API). A "anon key" é pública por desenho; a segurança está no RLS.
window.JD_CONFIG = {
  supabaseUrl: "https://beavhvqtyrlrmuhajcrg.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlYXZodnF0eXJscm11aGFqY3JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2Mzg2NzksImV4cCI6MjExMDIxNDY3OX0.XjiXQJ7U440K98eIRVFog17SMKAm_pK8-JW_OSwe8rw",  // chave pública "anon"
  lojaWhatsapp: "5551998828977",  // WhatsApp da loja (DDI+DDD+número, só dígitos)
  folgaSeloNetlify: true,         // deixa espaço embaixo para o selo "Powered by Netlify". Ponha false depois de desligar o selo no Netlify
  mostrarFlyer: false             // imagem do cardápio promocional (assets/cardapio-divulgacao.jpg). Desligada: o flyer antigo não tem a Barca P nem os novos adicionais. Ligue de novo com uma imagem atualizada
};
try { if (window.JD_CONFIG.folgaSeloNetlify === false) document.documentElement.style.setProperty('--badge-gap', '0px'); } catch (e) {}
