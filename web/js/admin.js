// Gestor da loja: pedidos, cardápio e configurações. Usa window.JD (js/api.js).
(function () {
  var JD = window.JD, api = JD.api, staff = api.staff;

  var STEPS = [
    { id: 'recebido', t: 'Novos', next: 'Aceitar e preparar' },
    { id: 'preparo', t: 'Em preparo' },
    { id: 'rota', t: 'Saiu / pronto' },
    { id: 'entregue', t: 'Concluídos' }
  ];
  var LABEL = {
    recebido: { entrega: 'Pedido recebido', retirada: 'Pedido recebido' },
    preparo: { entrega: 'Em preparo', retirada: 'Em preparo' },
    rota: { entrega: 'Saiu para entrega', retirada: 'Pronto para retirar' },
    entregue: { entrega: 'Entregue', retirada: 'Retirado' }
  };
  var NEXT = { recebido: 'Começar preparo', preparo: 'Marcar pronto', rota: 'Concluir' };
  var PAY = { pix: 'Pix', cartao: 'Cartão na entrega', dinheiro: 'Dinheiro' };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function brl(n) { return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function fmtPhone(d) {
    d = digits(d).slice(0, 11);
    if (d.length <= 2) return d ? '(' + d : '';
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  function waLink(num, msg) {
    var d = digits(num); if (d.length && d.length <= 11) d = '55' + d;
    return 'https://wa.me/' + d + '?text=' + encodeURIComponent(msg);
  }
  var toastTimer;
  function toast(t) {
    var el = $('#toast'); el.textContent = t; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }
  function ago(ts) {
    var m = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (m < 1) return 'agora'; if (m < 60) return 'há ' + m + ' min';
    var h = Math.floor(m / 60); return h < 24 ? 'há ' + h + ' h' : new Date(ts).toLocaleDateString('pt-BR');
  }

  /* ---------- estado ---------- */
  var tab = 'pedidos', seen = null, sound = false, audio = null, timer = null, orders = [], cat = null;

  function beep() {
    if (!sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.15;
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.25);
    } catch (e) {}
  }

  /* ---------- entrada ---------- */
  function show() {
    var logged = staff.isLoggedIn();
    $('#login').hidden = logged; $('#panel').hidden = !logged;
    clearInterval(timer);
    if (!logged) { renderLogin(); return; }
    loadStore(); go(tab);
    timer = setInterval(function () { if (tab === 'pedidos' && !document.hidden) loadOrders(); }, 15000);
  }
  function renderLogin() {
    $('#login').innerHTML = '<h2>Gestor de pedidos</h2><p class="sub">Entre com o e-mail e a senha da loja.</p>' +
      '<form class="card stack" id="loginForm" novalidate>' +
      '<div class="field"><label for="l-email">E-mail</label><input class="in-t" id="l-email" name="email" type="email" autocomplete="username"></div>' +
      '<div class="field"><label for="l-pass">Senha</label><input class="in-t" id="l-pass" name="password" type="password" autocomplete="current-password"></div>' +
      '<p class="err" id="l-err" role="alert" hidden></p><button class="btn" type="submit">Entrar</button></form>';
  }
  function loadStore() {
    api.getCatalog().then(function (c) {
      var os = JD.openState(c.store), s = $('#sstatus');
      s.className = 'status ' + (os.open ? 'on' : 'off'); s.textContent = os.label;
    }).catch(function () {});
  }
  function go(t) {
    tab = t;
    $$('[data-tab]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tab === t); });
    ['pedidos', 'cardapio', 'loja'].forEach(function (x) { $('#t-' + x).hidden = x !== t; });
    if (t === 'pedidos') loadOrders(); else if (t === 'cardapio') renderCatalog(); else renderSettings();
  }

  /* ---------- pedidos ---------- */
  function loadOrders() {
    staff.list().then(function (list) {
      var fresh = list.filter(function (o) { return o.status === 'recebido'; }).map(function (o) { return o.code; });
      var isNew = {};
      if (seen) fresh.forEach(function (c) { if (seen.indexOf(c) < 0) isNew[c] = true; });
      if (seen && Object.keys(isNew).length) { beep(); toast('Novo pedido recebido'); }
      seen = list.map(function (o) { return o.code; });
      orders = list; drawBoard(isNew);
    }).catch(function (e) {
      if (e.status === 401 || e.status === 403) { staff.logout(); show(); return; }
      $('#t-pedidos').innerHTML = '<div class="card empty">' + esc(e.message) + '</div>';
    });
  }
  function orderCard(o, isNew) {
    var open = o.status !== 'entregue' && o.status !== 'cancelado';
    var lab = o.status === 'cancelado' ? 'Cancelado' : LABEL[o.status][o.tipo];
    var first = (o.name || '').split(' ')[0];
    var msg = 'Oi, ' + first + '! Aqui é da Juntô Doces. Pedido ' + o.code + ': ' + lab + '.';
    return '<article class="ocard' + (isNew ? ' new' : '') + '"><div class="top"><b>' + esc(o.code) + ' · ' + esc(o.name) + '</b><small>' + ago(o.createdAt) + '</small></div>' +
      '<ul>' + o.items.map(function (i) { return '<li>' + i.qty + '× ' + esc(i.name) + (i.detail ? '<small>' + esc(i.detail) + '</small>' : '') + '</li>'; }).join('') + '</ul>' +
      '<div class="meta"><span>' + (o.tipo === 'entrega' ? 'Entrega: <b>' + esc(o.address) + '</b>' : '<b>Retirada na loja</b>') + '</span>' +
      '<span>' + esc(PAY[o.pay]) + (o.payStatus === 'pago' ? ' · <b>pago</b>' : ' · pendente') + (o.troco ? ' · troco p/ R$ ' + esc(o.troco) : '') + ' · <b>' + brl(o.total) + '</b></span>' +
      (o.obs ? '<span>Obs.: ' + esc(o.obs) + '</span>' : '') + '<span>WhatsApp: <b>' + esc(fmtPhone(o.phone)) + '</b></span></div>' +
      '<div class="acts">' +
      (open && NEXT[o.status] ? '<button type="button" class="btn sm" data-adv="' + esc(o.code) + '">' + NEXT[o.status] + '</button>' : '') +
      '<a class="btn sm alt" target="_blank" rel="noopener" href="' + waLink(o.phone, msg) + '">WhatsApp</a>' +
      (o.payStatus === 'pendente' && o.pay !== 'pix' && o.status !== 'cancelado' ? '<button type="button" class="btn sm alt" data-paid="' + esc(o.code) + '">Marcar pago</button>' : '') +
      (open ? '<button type="button" class="btn sm alt" data-cancel="' + esc(o.code) + '">Cancelar</button>' : '') + '</div></article>';
  }
  function drawBoard(isNew) {
    var cols = STEPS.map(function (s) {
      var list = orders.filter(function (o) { return s.id === 'entregue' ? (o.status === 'entregue' || o.status === 'cancelado') : o.status === s.id; });
      if (s.id === 'entregue') list = list.slice(0, 12);
      return '<section class="col" aria-label="' + s.t + '"><h3>' + s.t + '<span>' + list.length + '</span></h3>' +
        (list.length ? list.map(function (o) { return orderCard(o, isNew[o.code]); }).join('') : '<p class="none">Nenhum pedido</p>') + '</section>';
    }).join('');
    $('#t-pedidos').innerHTML = '<div class="board">' + cols + '</div>';
    $('#newDot').hidden = !orders.some(function (o) { return o.status === 'recebido'; });
  }
  function act(p, okMsg) {
    p.then(function (r) { toast(r && r.notified ? 'Cliente avisado no WhatsApp' : okMsg); loadOrders(); })
      .catch(function (e) { toast(e.message || 'Não foi possível atualizar.'); if (e.status === 401) show(); });
  }

  /* ---------- cardápio ---------- */
  function renderCatalog() {
    var box = $('#t-cardapio'); box.innerHTML = '<p class="loading">Carregando…</p>';
    staff.catalog().then(function (c) {
      var groups = {};
      c.categories.forEach(function (ca) { ca.products.forEach(function (p) { p.groups.forEach(function (g) { groups[g.id] = g; }); }); });
      var allGroups = c.groups || Object.keys(groups).map(function (k) { return groups[k]; });
      box.innerHTML = '<p class="sub">Mude o preço, pause o que acabou e crie categorias e produtos novos quando quiser vender mais coisas. A alteração vale na hora para os clientes.</p>' +
        c.categories.map(function (ca) {
          return '<section class="acard"><div class="chead"><h3>' + esc(ca.name) + '</h3><span class="cact">' +
            '<button type="button" class="btn sm alt" data-ren="' + esc(ca.id) + '" data-name="' + esc(ca.name) + '">Renomear</button>' +
            '<button type="button" class="btn sm alt" data-delcat="' + esc(ca.id) + '"' + (ca.products.length ? ' disabled title="Remova os produtos antes"' : '') + '>Remover</button></span></div>' +
            (ca.products.length ? ca.products.map(function (p) {
              return '<div class="arow' + (p.paused ? ' off' : '') + '"><div class="an"><b>' + esc(p.name) + '</b></div>' +
                '<label class="pin">R$ <input type="number" min="0" step="0.5" inputmode="decimal" value="' + p.price.toFixed(2) + '" data-price="' + esc(p.id) + '" aria-label="Preço de ' + esc(p.name) + '"></label>' +
                '<label class="sw"><input type="checkbox" data-avail="' + esc(p.id) + '"' + (p.paused ? '' : ' checked') + '><i></i><span>Disponível</span></label>' +
                '<button type="button" class="btn sm alt" data-delprod="' + esc(p.id) + '" data-name="' + esc(p.name) + '" aria-label="Remover ' + esc(p.name) + '">Remover</button></div>';
            }).join('') : '<p class="none">Nenhum produto nesta categoria.</p>') +
            '<details class="addp"><summary>+ Adicionar produto em ' + esc(ca.name) + '</summary>' +
            '<form class="stack" data-newprod="' + esc(ca.id) + '" novalidate>' +
            '<div class="fgrid"><div class="field"><label>Nome</label><input class="in-t" name="name" maxlength="60"></div>' +
            '<div class="field"><label>Preço (R$)</label><input class="in-t" name="price" type="number" min="0" step="0.5" inputmode="decimal"></div></div>' +
            '<div class="field"><label>Descrição (opcional)</label><input class="in-t" name="desc" maxlength="140"></div>' +
            (allGroups.length ? '<fieldset class="gsel"><legend>Complementos deste produto (opcional)</legend>' + allGroups.map(function (g) {
              return '<label class="chk"><input type="checkbox" name="g" value="' + esc(g.id) + '"> ' + esc(g.title) + '</label>';
            }).join('') + '</fieldset>' : '') +
            '<button type="submit" class="btn sm">Salvar produto</button></form></details></section>';
        }).join('') +
        '<section class="acard"><h3>Nova categoria</h3><p class="hint">Use para vender outras coisas além do açaí (por exemplo, sobremesas ou bebidas). Depois de criar, adicione os produtos dentro dela.</p>' +
        '<form class="newcat" id="newCat" novalidate><input class="in-t" name="name" maxlength="40" placeholder="Nome da categoria" aria-label="Nome da nova categoria"><button type="submit" class="btn sm">Criar categoria</button></form></section>' +
        Object.keys(groups).map(function (k) {
          var g = groups[k];
          return '<section class="acard"><h3>Complementos · ' + esc(g.title) + '</h3>' + g.options.map(function (o) {
            return '<div class="arow' + (o.active ? '' : ' off') + '"><div class="an"><b>' + esc(o.name) + '</b>' + (o.price ? '<small>+ ' + brl(o.price) + '</small>' : '') + '</div><span></span>' +
              '<label class="sw"><input type="checkbox" data-opt="' + esc(o.id) + '"' + (o.active ? ' checked' : '') + '><i></i><span>Disponível</span></label></div>';
          }).join('') + '</section>';
        }).join('');
    }).catch(function (e) {
      if (e.status === 401 || e.status === 403) { staff.logout(); show(); return; }
      box.innerHTML = '<div class="card empty">' + esc(e.message) + '</div>';
    });
  }

  /* ---------- loja ---------- */
  function renderSettings() {
    var box = $('#t-loja'); box.innerHTML = '<p class="loading">Carregando…</p>';
    staff.catalog().then(function (c) {
      var s = c.store;
      box.innerHTML = '<form class="stack" id="storeForm" novalidate style="max-width:760px">' +
        '<section class="acard"><h3>Status da loja</h3><div class="field"><label for="s-mode">Como abrir e fechar</label>' +
        '<select class="in-t" id="s-mode" name="mode"><option value="auto">Automático (segue os horários)</option><option value="aberta">Aberta agora (ignora horários)</option><option value="fechada">Fechada agora (ignora horários)</option></select>' +
        '<p class="hint">Use "Fechada agora" para pausar os pedidos na hora, sem mexer nos horários.</p></div></section>' +
        '<section class="acard"><h3>Dados e entrega</h3><div class="fgrid">' +
        '<div class="field"><label for="s-name">Nome da loja</label><input class="in-t" id="s-name" name="name" maxlength="60"></div>' +
        '<div class="field"><label for="s-wa">WhatsApp da loja (com DDD)</label><input class="in-t" id="s-wa" name="whatsapp" type="tel" inputmode="numeric"></div>' +
        '<div class="field"><label for="s-fee">Taxa de entrega (R$)</label><input class="in-t" id="s-fee" name="fee" type="number" min="0" step="0.5" inputmode="decimal"></div>' +
        '<div class="field"><label for="s-min">Pedido mínimo (R$)</label><input class="in-t" id="s-min" name="min" type="number" min="0" step="0.5" inputmode="decimal"></div>' +
        '<div class="field"><label for="s-emin">Tempo mínimo (min)</label><input class="in-t" id="s-emin" name="etaMin" type="number" min="0" step="5" inputmode="numeric"></div>' +
        '<div class="field"><label for="s-emax">Tempo máximo (min)</label><input class="in-t" id="s-emax" name="etaMax" type="number" min="0" step="5" inputmode="numeric"></div>' +
        '</div></section>' +
        '<section class="acard"><h3>Horários</h3><div class="hours">' +
        [1, 2, 3, 4, 5, 6, 0].map(function (d) {
          var h = (s.hours || {})[d];
          return '<div class="hrow"><label>' + JD.DAYS[d] + '</label><input class="in-t" type="time" name="o' + d + '" value="' + (h ? h[0] : '14:00') + '" aria-label="Abre ' + JD.DAYS[d] + '"><input class="in-t" type="time" name="c' + d + '" value="' + (h ? h[1] : '23:00') + '" aria-label="Fecha ' + JD.DAYS[d] + '">' +
            '<label class="sw"><input type="checkbox" name="x' + d + '"' + (h ? '' : ' checked') + '><i></i><span>Fechado</span></label></div>';
        }).join('') + '<p class="hint">O horário não cobre virada de madrugada (por exemplo, abrir às 18h e fechar às 02h).</p></div></section>' +
        '<button type="submit" class="btn">Salvar alterações</button></form>';
      var f = $('#storeForm').elements;
      f.mode.value = s.mode; f.name.value = s.name; f.whatsapp.value = s.whatsapp;
      f.fee.value = s.fee; f.min.value = s.min; f.etaMin.value = s.etaMin; f.etaMax.value = s.etaMax;
    }).catch(function (e) {
      if (e.status === 401 || e.status === 403) { staff.logout(); show(); return; }
      box.innerHTML = '<div class="card empty">' + esc(e.message) + '</div>';
    });
  }
  function saveSettings(f) {
    var E = f.elements, hours = {};
    for (var d = 0; d < 7; d++) hours[d] = E['x' + d].checked ? null : [E['o' + d].value, E['c' + d].value];
    var s = {
      name: E.name.value.trim() || 'Juntô Doces', whatsapp: digits(E.whatsapp.value), mode: E.mode.value, hours: hours,
      fee: Math.max(0, +E.fee.value || 0), min: Math.max(0, +E.min.value || 0),
      etaMin: Math.max(0, +E.etaMin.value || 0), etaMax: Math.max(0, +E.etaMax.value || 0)
    };
    staff.saveSettings(s).then(function () { toast('Alterações salvas'); loadStore(); })
      .catch(function (e) { toast(e.message || 'Não foi possível salvar.'); });
  }

  function done(p, msg) { p.then(function () { toast(msg); renderCatalog(); }).catch(function (e) { toast(e.message || 'Não foi possível salvar.'); }); }
  // confirmação dentro da página (o preview não mostra confirm())
  function confirmThen(btn, label, fn) {
    if (btn.dataset.sure) { fn(); return; }
    var old = btn.textContent; btn.dataset.sure = '1'; btn.textContent = 'Confirmar';
    setTimeout(function () { delete btn.dataset.sure; btn.textContent = old; }, 3500); toast(label + ' Toque em Confirmar.');
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button,a'); if (!t) return;
    if (t.dataset.tab) { go(t.dataset.tab); return; }
    if (t.id === 'logoutBtn') { staff.logout(); seen = null; show(); return; }
    if (t.id === 'soundBtn') {
      sound = !sound; t.setAttribute('aria-pressed', sound); t.textContent = sound ? 'Som ligado' : 'Som desligado';
      if (sound) beep();
      return;
    }
    if (t.dataset.ren) {
      var h = t.closest('.chead'), cur = t.dataset.name;
      h.innerHTML = '<form class="newcat" data-rename="' + esc(t.dataset.ren) + '" novalidate><input class="in-t" name="name" maxlength="40" value="' + esc(cur) + '" aria-label="Novo nome da categoria"><button class="btn sm" type="submit">Salvar</button></form>';
      h.querySelector('input').focus(); return;
    }
    if (t.dataset.delcat) { confirmThen(t, 'Remover categoria?', function () { done(staff.removeCategory(t.dataset.delcat), 'Categoria removida'); }); return; }
    if (t.dataset.delprod) { confirmThen(t, 'Remover ' + t.dataset.name + '?', function () { done(staff.removeProduct(t.dataset.delprod), 'Produto removido'); }); return; }
    if (t.dataset.adv) { act(staff.advance(t.dataset.adv), 'Pedido atualizado'); return; }
    if (t.dataset.cancel) { act(staff.cancel(t.dataset.cancel), 'Pedido cancelado'); return; }
    if (t.dataset.paid) { act(staff.markPaid(t.dataset.paid), 'Pagamento registrado'); return; }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.avail) {
      staff.setProduct(t.dataset.avail, { paused: !t.checked }).then(function () { t.closest('.arow').classList.toggle('off', !t.checked); toast(t.checked ? 'Item disponível' : 'Item pausado'); })
        .catch(function (er) { t.checked = !t.checked; toast(er.message || 'Não foi possível salvar.'); });
    } else if (t.dataset.opt) {
      staff.setOption(t.dataset.opt, t.checked).then(function () { t.closest('.arow').classList.toggle('off', !t.checked); toast(t.checked ? 'Opção disponível' : 'Opção pausada'); })
        .catch(function (er) { t.checked = !t.checked; toast(er.message || 'Não foi possível salvar.'); });
    } else if (t.dataset.price) {
      var v = +t.value;
      if (!(v >= 0)) { toast('Informe um preço válido.'); return; }
      staff.setProduct(t.dataset.price, { price: v }).then(function () { t.value = v.toFixed(2); toast('Preço atualizado'); })
        .catch(function (er) { toast(er.message || 'Não foi possível salvar.'); });
    }
  });
  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    if (f.id === 'loginForm') {
      var le = $('#l-err'); le.hidden = true;
      staff.login(f.elements.email.value.trim(), f.elements.password.value).then(show)
        .catch(function (er) { le.textContent = er.message; le.hidden = false; });
    } else if (f.id === 'storeForm') saveSettings(f);
    else if (f.id === 'newCat') {
      var n = f.elements.name.value.trim(); if (!n) { toast('Digite o nome da categoria.'); return; }
      done(staff.addCategory(n), 'Categoria criada');
    } else if (f.dataset.rename) {
      var r = f.elements.name.value.trim(); if (!r) { toast('Digite o nome.'); return; }
      done(staff.renameCategory(f.dataset.rename, r), 'Nome alterado');
    } else if (f.dataset.newprod) {
      var E = f.elements, nm = E.name.value.trim(), pr = parseFloat(String(E.price.value).replace(',', '.'));
      if (!nm) { toast('Digite o nome do produto.'); return; }
      if (!(pr >= 0)) { toast('Informe o preço.'); return; }
      var gs = $$('input[name="g"]:checked', f).map(function (x) { return x.value; });
      done(staff.addProduct({ categoryId: f.dataset.newprod, name: nm, desc: E.desc.value.trim(), price: pr, groups: gs }), 'Produto adicionado');
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 's-wa') e.target.value = fmtPhone(e.target.value);
  });

  show();
})();
