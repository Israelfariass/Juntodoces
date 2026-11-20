// Juntô Doces: cardápio digital do cliente. Os dados vêm de window.JD (js/api.js).
(function () {
  var JD = window.JD, api = JD.api, store = JD.store;

  var catalog = null;     // { store, categories }
  var STEPS = [
    { id: 'recebido', t: 'Pedido recebido', d: 'A Juntô Doces recebeu o seu pedido.' },
    { id: 'preparo', t: 'Em preparo', d: 'Estamos montando tudo com carinho.' },
    { id: 'rota', t: 'Saiu para entrega', d: 'Seu pedido está a caminho.', tr: 'Pronto para retirar', dr: 'Pode vir buscar, está esperando por você.' },
    { id: 'entregue', t: 'Entregue', d: 'Bom apetite!', tr: 'Retirado', dr: 'Bom apetite!' }
  ];
  var PAY = { pix: 'Pix', cartao: 'Cartão na entrega', dinheiro: 'Dinheiro' };

  /* ---------- Utilidades ---------- */
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
  var heart = '<svg class="heart" aria-hidden="true"><use href="#heart"/></svg>';
  var whisk = '<svg class="w" aria-hidden="true"><use href="#whisk"/></svg>';
  var toastTimer;
  function toast(t) {
    var el = $('#toast'); el.textContent = t; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }
  function findProduct(id) {
    var f = null;
    catalog.categories.forEach(function (c) { c.products.forEach(function (p) { if (p.id === id) f = p; }); });
    return f;
  }

  /* ---------- Estado ---------- */
  var cart = store.get('jd_cart', []);
  var search = '';
  var justOrdered = null;
  var shownPhone = '';
  function saveCart() { store.set('jd_cart', cart); }
  function subtotal() { return Math.round(cart.reduce(function (s, i) { return s + i.price * i.qty; }, 0) * 100) / 100; }
  function count() { return cart.reduce(function (s, i) { return s + i.qty; }, 0); }
  function isOpen() { return JD.openState(catalog.store).open; }

  /* ---------- Rotas ---------- */
  var VIEWS = ['cardapio', 'finalizar', 'acompanhar'];
  function route() {
    var h = (location.hash || '#cardapio').slice(1);
    if (VIEWS.indexOf(h) < 0) h = 'cardapio';
    VIEWS.forEach(function (v) { $('#v-' + v).hidden = v !== h; });
    closeSheet(); closeModal();
    ({ cardapio: renderMenu, finalizar: renderCheckout, acompanhar: renderTrack })[h]();
    updateBar();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  function backbar(title) {
    return '<div class="backbar"><a href="#cardapio" aria-label="Voltar ao cardápio">← Cardápio</a></div><h2>' + esc(title) + '</h2>';
  }

  /* ---------- Cardápio ---------- */
  function renderMenu() {
    var st = catalog.store, os = JD.openState(st);
    var el = $('#v-cardapio');
    el.innerHTML =
      '<div class="cover">' + whisk + '<a class="mylink" href="#acompanhar">Acompanhar pedido</a></div>' +
      '<div class="shead"><div class="logo"><img src="assets/perfil.jpg" alt="Logo da Juntô Doces"></div><div class="stitle"><h1>' + esc(st.name) + '</h1><p>Feito com amor</p>' +
      '<span class="status ' + (os.open ? 'on' : 'off') + '">' + esc(os.label) + '</span></div></div>' +
      '<ul class="info"><li>Entrega<b>' + st.etaMin + ' a ' + st.etaMax + ' min</b></li><li>Taxa de entrega<b>' + (st.fee ? brl(st.fee) : 'Grátis') + '</b></li>' +
      (st.min ? '<li>Pedido mínimo<b>' + brl(st.min) + '</b></li>' : '') + '</ul>' +
      (os.open ? '' : '<div class="closed" role="status">Estamos fechados agora. Você pode ver o cardápio e voltar no horário de funcionamento.</div>') +
      '<section class="brand-spot" aria-label="Conheça a Juntô Doces"><img src="assets/identidade-visual.jpg" alt="Identidade visual da Juntô Doces e seus produtos" fetchpriority="high">' +
      '<div class="brand-copy"><span>Feito com amor</span><h2>Doce em cada detalhe</h2><p>Açaí e sobremesas preparados com carinho pra você.</p>' +
      '<a href="https://www.instagram.com/juntodoces_" target="_blank" rel="noopener">Acompanhe no Instagram</a></div></section>' +
      '<div class="search"><input id="q" type="search" aria-label="Buscar no cardápio" placeholder="Buscar no cardápio" value="' + esc(search) + '" autocomplete="off"></div>' +
      '<nav class="catnav" aria-label="Categorias"><div class="in" id="catin"></div></nav>' +
      '<div id="plist"></div>';
    drawList();
  }
  function productCard(p) {
    return '<button type="button" class="pcard' + (p.paused ? ' off' : '') + '" data-p="' + esc(p.id) + '"><div><h3>' + esc(p.name) + '</h3><p>' + esc(p.desc) + '</p>' +
      (p.paused ? '<span class="soldout">Indisponível</span>' : '<span class="price">' + brl(p.price) + '</span>') + '</div>' +
      '<div class="pthumb">' + (p.image ? '<img alt="" loading="lazy" src="' + esc(p.image) + '">' : whisk) + '</div></button>';
  }
  function drawList() {
    var q = search.trim().toLowerCase();
    var cats = catalog.categories.map(function (c) {
      return { id: c.id, name: c.name, products: c.products.filter(function (p) { return !q || (p.name + ' ' + p.desc).toLowerCase().indexOf(q) >= 0; }) };
    }).filter(function (c) { return c.products.length; });
    $('.catnav').hidden = catalog.categories.filter(function (c) { return c.products.length; }).length < 2;
    var fc = $('#fcats'); if (fc) fc.textContent = catalog.categories.filter(function (c) { return c.products.length; }).map(function (c) { return c.name; }).join(' · ');
    $('#catin').innerHTML = cats.map(function (c, i) { return '<a class="tab" href="#cat-' + esc(c.id) + '" data-cat="' + esc(c.id) + '"' + (i === 0 ? ' aria-current="true"' : '') + '>' + esc(c.name) + '</a>'; }).join('');
    var showFlyer = !search && (window.JD_CONFIG || {}).mostrarFlyer !== false;
    $('#plist').innerHTML = (cats.length ? cats.map(function (c) {
      return '<section class="csec" id="sec-' + esc(c.id) + '"><h2>' + esc(c.name) + '</h2><div class="pgrid">' + c.products.map(productCard).join('') + '</div></section>';
    }).join('') : '<div class="card empty" style="margin-top:16px">Nada encontrado para "' + esc(search) + '".</div>') +
      (showFlyer ? (      '<section class="menu-highlight" aria-labelledby="flyer-title"><div><h2 id="flyer-title">Nosso cardápio em destaque</h2>' +
      '<p>Um pouquinho do carinho que vai em cada pedido. Toque na imagem para abrir o material completo.</p>' +
      '<small>Os valores podem mudar. Vale o preço mostrado nos produtos acima.</small></div>' +
      '<a href="assets/cardapio-divulgacao.jpg" target="_blank" rel="noopener" aria-label="Abrir o cardápio promocional completo">' +
      '<img src="assets/cardapio-divulgacao.jpg" alt="Cardápio promocional da Juntô Doces com tamanhos de açaí, adicionais e combo" loading="lazy"></a></section>') : '');
  }
  var spyTimer;
  function spy() {
    clearTimeout(spyTimer);
    spyTimer = setTimeout(function () {
      var secs = $$('.csec'); if (!secs.length) return;
      var cur = secs[0].id;
      secs.forEach(function (s) { if (s.getBoundingClientRect().top <= 96) cur = s.id; });
      $$('.tab').forEach(function (t) {
        var on = 'sec-' + t.dataset.cat === cur;
        if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current');
        if (on && t.scrollIntoView && t.parentNode.scrollWidth > t.parentNode.clientWidth) { try { t.parentNode.scrollLeft = t.offsetLeft - 16; } catch (e) {} }
      });
    }, 40);
  }
  window.addEventListener('scroll', spy, { passive: true });

  /* ---------- Janela do produto ---------- */
  var M = null; // { p, qty, sel, note }
  function openProduct(id) {
    var p = findProduct(id); if (!p) return;
    M = { p: p, qty: 1, sel: {}, note: '' };
    p.groups.forEach(function (g) { M.sel[g.id] = []; });
    var open = isOpen();
    var body = '<button type="button" class="mclose" data-mclose aria-label="Fechar">×</button><div class="mbody">' +
      '<div class="mhero' + (p.image ? ' has-img' : '') + '">' + (p.image ? '<img alt="" src="' + esc(p.image) + '">' : whisk) + '</div>' +
      '<h2>' + esc(p.name) + '</h2><p class="mdesc">' + esc(p.desc) + '</p>' +
      p.groups.map(function (g) {
        var single = g.max === 1;
        var rule = single ? 'Escolha 1 opção' : (g.min ? 'Escolha de ' + g.min + ' a ' + g.max : 'Escolha até ' + g.max);
        return '<div class="grp" data-g="' + esc(g.id) + '"><div class="ghead"><div><b>' + esc(g.title) + '</b><small>' + rule + (g.free ? ' · ' + g.free + ' inclusos' : '') + '</small></div>' +
          '<div class="gtag"><span class="cnt" data-cnt></span>' + (g.min ? '<span class="badge" data-req>Obrigatório</span>' : '') + '</div></div>' +
          g.options.map(function (o) {
            return '<label class="orow" data-o="' + esc(o.id) + '"><span class="left"><input type="' + (single ? 'radio' : 'checkbox') + '" name="g-' + esc(g.id) + '" value="' + esc(o.id) + '"><span class="n">' + esc(o.name) + '</span></span>' +
              (o.price > 0 && !g.free ? '<span class="p">+ ' + brl(o.price) + '</span>' : '') + '</label>';
          }).join('') + '</div>';
      }).join('') +
      '<div class="grp"><div class="ghead"><b>Alguma observação?</b></div><textarea class="mnote" id="mnote" maxlength="120" placeholder="Ex.: sem granola, capricha na calda"></textarea></div>' +
      '</div><p class="mhint" id="mhint" hidden></p>' +
      '<div class="mfoot"><div class="qty"><button type="button" data-mq="-1" aria-label="Diminuir">−</button><span id="mqty">1</span><button type="button" data-mq="1" aria-label="Aumentar">+</button></div>' +
      '<button type="button" class="btn" id="madd"><span>Adicionar</span><span id="mtot"></span></button></div>';
    var m = $('#modal'); m.innerHTML = body; m.hidden = false; $('#mbg').hidden = false;
    document.body.style.overflow = 'hidden';
    refreshModal();
    var c = $('.mclose', m); if (c) c.focus();
  }
  function closeModal() { $('#modal').hidden = true; $('#mbg').hidden = true; M = null; document.body.style.overflow = ''; }
  function refreshModal() {
    if (!M) return;
    var p = M.p, firstBad = null;
    p.groups.forEach(function (g) {
      var n = (M.sel[g.id] || []).length, box = $('[data-g="' + g.id + '"]', $('#modal'));
      $('[data-cnt]', box).textContent = n + '/' + g.max;
      var req = $('[data-req]', box);
      var ok = n >= g.min;
      if (req) { req.className = 'badge' + (ok ? ' ok' : ''); req.textContent = ok ? 'Ok' : 'Obrigatório'; }
      if (!ok && !firstBad) firstBad = g;
      $$('.orow', box).forEach(function (row) {
        var inp = $('input', row), checked = M.sel[g.id].indexOf(inp.value) >= 0;
        inp.checked = checked;
        var lock = g.max > 1 && !checked && n >= g.max;
        inp.disabled = lock; row.classList.toggle('dis', lock);
      });
    });
    var unit = JD.unitPrice(p, M.sel), tot = Math.round(unit * M.qty * 100) / 100;
    $('#mtot').textContent = brl(tot); $('#mqty').textContent = M.qty;
    var open = isOpen(), btn = $('#madd'), hint = $('#mhint');
    var msg = !open ? 'A loja está fechada agora.' : p.paused ? 'Este item está indisponível.' : firstBad ? 'Escolha ' + (firstBad.min === 1 ? 'uma opção' : firstBad.min + ' opções') + ' em "' + firstBad.title + '".' : '';
    btn.disabled = !!msg; hint.hidden = !msg; hint.textContent = msg;
  }
  function toggleOption(gid, oid) {
    var g = M.p.groups.filter(function (x) { return x.id === gid; })[0], cur = M.sel[gid], i = cur.indexOf(oid);
    if (g.max === 1) M.sel[gid] = [oid];
    else if (i >= 0) cur.splice(i, 1);
    else if (cur.length < g.max) cur.push(oid);
    refreshModal();
  }
  function addFromModal() {
    var p = M.p, note = M.note.trim();
    var sigs = JSON.stringify(Object.keys(M.sel).sort().map(function (k) { return [k, M.sel[k].slice().sort()]; }));
    var key = p.id + '|' + sigs + '|' + note;
    var found = cart.filter(function (x) { return x.key === key; })[0];
    if (found) found.qty += M.qty;
    else cart.push({ key: key, productId: p.id, name: p.name, detail: JD.describe(p, M.sel, note), price: JD.unitPrice(p, M.sel), qty: M.qty, selections: JSON.parse(JSON.stringify(M.sel)), note: note });
    saveCart(); closeModal(); updateBar(); toast('Adicionado à sacola');
  }

  /* ---------- Sacola ---------- */
  function updateBar() {
    var h = (location.hash || '#cardapio').slice(1), n = count();
    $('#bagbar').hidden = !(n > 0 && (h === 'cardapio' || h === ''));
    $('#bagCount').textContent = 'Ver sacola · ' + n + (n === 1 ? ' item' : ' itens');
    $('#bagTotal').textContent = brl(subtotal());
  }
  function openSheet() {
    var sh = $('#sheet');
    if (!cart.length) { closeSheet(); return; }
    sh.innerHTML = '<div class="in"><h2>Sua sacola</h2><ul class="items">' +
      cart.map(function (i, ix) {
        return '<li class="item"><div class="t"><b>' + esc(i.name) + '</b>' + (i.detail ? '<p>' + esc(i.detail) + '</p>' : '') + '<p class="price">' + brl(i.price * i.qty) + '</p></div>' +
          '<div class="qty"><button type="button" data-q="-1" data-i="' + ix + '" aria-label="Diminuir ' + esc(i.name) + '">−</button><span>' + i.qty + '</span><button type="button" data-q="1" data-i="' + ix + '" aria-label="Aumentar ' + esc(i.name) + '">+</button></div></li>';
      }).join('') +
      '</ul><div class="row total"><span>Subtotal</span><span>' + brl(subtotal()) + '</span></div>' +
      '<a class="btn block" href="#finalizar">Continuar para o pedido</a>' +
      '<button type="button" class="btn alt block" data-close>Continuar escolhendo</button></div>';
    sh.hidden = false; $('#sheetbg').hidden = false;
    var b = $('[data-close]', sh); if (b) b.focus();
  }
  function closeSheet() { $('#sheet').hidden = true; $('#sheetbg').hidden = true; }

  /* ---------- Finalizar pedido ---------- */
  function renderCheckout() {
    var el = $('#v-finalizar');
    if (!cart.length) {
      el.innerHTML = backbar('Sua sacola está vazia') + '<p class="sub">Escolha seus doces para fazer o pedido.</p><a class="btn" href="#cardapio">Ver cardápio</a>';
      return;
    }
    var st = catalog.store, lastPhone = store.get('jd_phone', '');
    el.innerHTML = backbar('Finalizar pedido') + '<p class="sub">Você só precisa do seu WhatsApp. É por lá que avisamos cada etapa.</p>' +
      '<form class="stack" id="co" novalidate>' +
        '<div class="card stack"><h3>Seus dados</h3>' +
          '<div class="field"><label for="f-name">Seu nome</label><input class="in-t" id="f-name" name="name" autocomplete="name" maxlength="80" placeholder="Como podemos te chamar?"><p class="err" id="e-name" hidden>Informe seu nome.</p></div>' +
          '<div class="field"><label for="f-phone">WhatsApp com DDD</label><input class="in-t" id="f-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="(51) 99999-9999" value="' + esc(fmtPhone(lastPhone)) + '"><p class="hint">Use esse mesmo número para acompanhar o pedido no site.</p><p class="err" id="e-phone" hidden>Confira o número: DDD + 9 dígitos.</p></div>' +
        '</div>' +
        '<div class="card stack"><h3>Como você quer receber</h3>' +
          '<div class="seg"><label class="opt"><input type="radio" name="tipo" value="entrega" checked><span class="face"><b>Entrega</b><span>' + (st.fee ? '+ ' + brl(st.fee) : 'grátis') + '</span></span></label><label class="opt"><input type="radio" name="tipo" value="retirada"><span class="face"><b>Retirar na loja</b><span>sem taxa</span></span></label></div>' +
          '<div class="stack" id="addr">' +
            '<div class="field"><label for="f-rua">Rua e número</label><input class="in-t" id="f-rua" name="rua" autocomplete="street-address" maxlength="120"><p class="err" id="e-rua" hidden>Informe a rua e o número.</p></div>' +
            '<div class="two"><div class="field"><label for="f-bairro">Bairro</label><input class="in-t" id="f-bairro" name="bairro" maxlength="60"><p class="err" id="e-bairro" hidden>Informe o bairro.</p></div><div class="field"><label for="f-comp">Complemento</label><input class="in-t" id="f-comp" name="comp" maxlength="60" placeholder="Opcional"></div></div>' +
          '</div>' +
        '</div>' +
        '<div class="card stack"><h3>Pagamento</h3>' +
          '<div class="seg">' + Object.keys(PAY).map(function (k, i) { return '<label class="opt"><input type="radio" name="pay" value="' + k + '"' + (i === 0 ? ' checked' : '') + '><span class="face"><b>' + PAY[k] + '</b></span></label>'; }).join('') + '</div>' +
          '<p class="hint" id="payhint"></p>' +
          '<div class="field" id="trocoF" hidden><label for="f-troco">Troco para quanto?</label><input class="in-t" id="f-troco" name="troco" inputmode="decimal" maxlength="20" placeholder="Ex.: 50"></div>' +
          '<div class="field"><label for="f-obs">Observações</label><textarea class="in-t" id="f-obs" name="obs" maxlength="300" placeholder="Ex.: tocar a campainha"></textarea></div>' +
        '</div>' +
        '<div class="card stack"><h3>Resumo</h3>' +
          cart.map(function (i) { return '<div class="row"><span>' + i.qty + '× ' + esc(i.name) + '</span><span>' + brl(i.price * i.qty) + '</span></div>'; }).join('') +
          '<div class="row"><span>Subtotal</span><span>' + brl(subtotal()) + '</span></div>' +
          '<div class="row"><span>Entrega</span><span id="s-fee"></span></div>' +
          '<div class="row total"><span>Total</span><span id="s-total"></span></div>' +
        '</div>' +
        '<p class="err" id="co-err" role="alert" hidden></p>' +
        '<button type="submit" class="btn block" id="co-btn">Fazer pedido</button>' +
      '</form>';
    updateCheckout();
  }
  function updateCheckout() {
    var f = $('#co'); if (!f) return;
    var st = catalog.store, ent = f.elements.tipo.value === 'entrega';
    $('#addr').hidden = !ent;
    var fee = ent ? st.fee : 0;
    $('#s-fee').textContent = ent ? (fee ? brl(fee) : 'Grátis') : 'Grátis';
    $('#s-total').textContent = brl(subtotal() + fee);
    var p = f.elements.pay.value;
    $('#trocoF').hidden = p !== 'dinheiro';
    $('#payhint').textContent = p === 'pix' ? (api.mode === 'remote' ? 'Depois de fazer o pedido, mostramos o QR Code do Pix aqui na tela.' : 'Enviamos a chave Pix no seu WhatsApp assim que o pedido for confirmado.') :
      p === 'cartao' ? 'A maquininha vai junto com o pedido.' : 'Informe o valor para levarmos o troco certo.';
    var btn = $('#co-btn'), why = '';
    if (!isOpen()) why = 'Loja fechada agora';
    else if (st.min && subtotal() < st.min) why = 'Pedido mínimo ' + brl(st.min);
    btn.disabled = !!why; btn.textContent = why || 'Fazer pedido';
  }
  function showCoError(msg) { var e = $('#co-err'); e.textContent = msg; e.hidden = false; }
  function submitOrder(f) {
    var E = f.elements;
    var name = E.name.value.trim(), ph = digits(E.phone.value), ent = E.tipo.value === 'entrega';
    var bad = { name: !name, phone: !(ph.length === 10 || ph.length === 11), rua: ent && !E.rua.value.trim(), bairro: ent && !E.bairro.value.trim() };
    var first = null;
    Object.keys(bad).forEach(function (k) { var e = $('#e-' + k); if (e) e.hidden = !bad[k]; if (bad[k] && !first) first = E[k]; });
    if (first) { first.focus(); return; }
    $('#co-err').hidden = true;
    var btn = $('#co-btn'); btn.disabled = true; btn.textContent = 'Enviando pedido…';
    var payload = {
      name: name, phone: ph, fulfillment: E.tipo.value,
      address: ent ? (E.rua.value.trim() + ' · ' + E.bairro.value.trim() + (E.comp.value.trim() ? ' · ' + E.comp.value.trim() : '')) : '',
      pay: E.pay.value, cashChangeFor: E.pay.value === 'dinheiro' ? E.troco.value.trim() : '', notes: E.obs.value.trim(),
      items: cart.map(function (i) { return { productId: i.productId, name: i.name, detail: i.detail, price: i.price, qty: i.qty, selections: i.selections, note: i.note }; })
    };
    api.createOrder(payload).then(function (res) {
      justOrdered = { order: res.order, pix: res.pix, pixError: res.pixError, form: payload };
      store.set('jd_phone', ph); shownPhone = ph;
      cart = []; saveCart();
      location.hash = '#acompanhar';
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = 'Fazer pedido';
      showCoError(err && err.message ? err.message : 'Não foi possível enviar o pedido. Tente de novo.');
    });
  }

  /* ---------- Acompanhar ---------- */
  function stepTxt(s, tipo) { return tipo === 'retirada' && s.tr ? s.tr : s.t; }
  function stepDesc(s, tipo) { return tipo === 'retirada' && s.dr ? s.dr : s.d; }
  function timeline(o) {
    if (o.status === 'cancelado') return '<p class="sub" style="margin:0">Este pedido foi cancelado. Fale com a loja pelo WhatsApp se precisar de ajuda.</p>';
    var cur = STEPS.map(function (s) { return s.id; }).indexOf(o.status);
    return '<ol class="tl">' + STEPS.map(function (s, i) {
      var cls = i < cur ? 'done' : i === cur ? (i === STEPS.length - 1 ? 'done' : 'now') : 'todo';
      return '<li class="' + cls + '"><span class="m">' + heart + '</span><div><b>' + esc(stepTxt(s, o.tipo)) + '</b>' + (i <= cur ? '<p>' + esc(stepDesc(s, o.tipo)) + '</p>' : '') + '</div></li>';
    }).join('') + '</ol>';
  }
  function pixBox(pix) {
    if (!pix || !pix.copyPaste) return '';
    return '<div class="pixbox"><b>Pague com Pix</b>' +
      (pix.qrBase64 ? '<img alt="QR Code do Pix" src="data:image/png;base64,' + esc(pix.qrBase64) + '">' : '') +
      '<code>' + esc(pix.copyPaste) + '</code>' +
      '<button type="button" class="btn sm" data-copy="' + esc(pix.copyPaste) + '">Copiar código Pix</button>' +
      '<span class="hint">O código vale por 30 minutos. Abra o app do seu banco e use Pix Copia e Cola.</span></div>';
  }
  function orderCard(o) {
    var d = new Date(o.createdAt);
    var when = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    var payTxt = PAY[o.pay] + (o.payStatus === 'pago' ? ' · pago' : '');
    return '<article class="card"><div class="ohead"><b>Pedido ' + esc(o.code) + '</b><span>' + when + '</span></div>' + timeline(o) + (o.pix ? pixBox(o.pix) : '') +
      '<div class="sum">' + o.items.map(function (i) { return '<span>' + i.qty + '× <b>' + esc(i.name) + '</b>' + (i.detail ? ' · ' + esc(i.detail) : '') + '</span>'; }).join('') +
      '<span>' + (o.tipo === 'entrega' ? (o.address ? 'Entrega em <b>' + esc(o.address) + '</b>' : '<b>Entrega</b>') : '<b>Retirada na loja</b>') + '</span>' +
      '<span>Pagamento: <b>' + esc(payTxt) + '</b> · Total <b>' + brl(o.total) + '</b></span></div></article>';
  }
  function renderTrack() {
    var el = $('#v-acompanhar'), ph = shownPhone || store.get('jd_phone', ''), banner = '';
    if (justOrdered) {
      var o = justOrdered.order, f = justOrdered.form;
      var msg = 'Oi! Acabei de fazer o pedido ' + o.code + ' no site.\n' + o.items.map(function (i) { return i.qty + 'x ' + i.name + (i.detail ? ' (' + i.detail + ')' : ''); }).join('\n') +
        '\nTotal: ' + brl(o.total) + '\n' + (o.tipo === 'entrega' ? 'Entrega: ' + f.address : 'Retirada na loja') + '\nPagamento: ' + PAY[o.pay] + (f.notes ? '\nObs.: ' + f.notes : '');
      var pixInfo = '';
      if (o.pay === 'pix') pixInfo = justOrdered.pix ? pixBox(justOrdered.pix) : '<p>Vamos te enviar a chave Pix no WhatsApp.</p>';
      banner = '<div class="banner">' + heart + '<div><strong>Pedido ' + esc(o.code) + ' feito!</strong><p>Acompanhe cada etapa aqui, só com o seu WhatsApp ' + esc(fmtPhone(o.phone)) + '. A loja também pode te chamar por lá.</p>' + pixInfo +
        '<div class="acts"><a class="btn sm" href="' + waLink(catalog.store.whatsapp, msg) + '" target="_blank" rel="noopener">Falar com a loja no WhatsApp</a></div></div></div>';
    }
    el.innerHTML = backbar('Acompanhar pedido') + '<p class="sub">Digite o WhatsApp que você usou no pedido.</p>' +
      '<div class="stack">' + banner +
      '<form class="card stack" id="tr" novalidate><div class="field"><label for="t-phone">WhatsApp com DDD</label><input class="in-t" id="t-phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="(51) 99999-9999" value="' + esc(fmtPhone(ph)) + '"><p class="err" id="t-err" hidden></p></div><button class="btn" type="submit">Ver meu pedido</button></form>' +
      '<div id="trOut" class="stack"></div></div>';
    if (ph) showOrders(ph, true); else renderSample();
  }
  function renderSample() {
    $('#trOut').innerHTML = '<article class="card sample"><div class="tag2">Assim você acompanha</div>' + timeline({ status: 'preparo', tipo: 'entrega' }) + '</article>';
  }
  function showOrders(ph, quiet) {
    var err = $('#t-err'), out = $('#trOut');
    if (digits(ph).length < 10) { err.textContent = 'Confira o número: DDD + 9 dígitos.'; err.hidden = false; renderSample(); return; }
    err.hidden = true;
    out.innerHTML = '<p class="loading">Buscando seu pedido…</p>';
    api.trackOrders(digits(ph)).then(function (list) {
      if (!list.length) {
        if (quiet) { renderSample(); return; }
        out.innerHTML = '<div class="card empty">Não encontramos pedidos com esse número.<br>Confira o número com DDD ou fale com a loja pelo WhatsApp.</div>'; return;
      }
      store.set('jd_phone', digits(ph));
      out.innerHTML = list.map(orderCard).join('');
    }).catch(function (e) {
      out.innerHTML = '<div class="card empty">' + esc(e && e.message ? e.message : 'Não foi possível buscar o pedido agora.') + '</div>';
    });
  }

  /* ---------- Eventos ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button,a'); if (!t) return;
    if (t.dataset.cat) {
      e.preventDefault();
      var s = document.getElementById('sec-' + t.dataset.cat); if (s && s.scrollIntoView) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (t.dataset.p) { openProduct(t.dataset.p); return; }
    if (t.hasAttribute('data-mclose')) { closeModal(); return; }
    if (t.dataset.mq) { M.qty = Math.min(20, Math.max(1, M.qty + +t.dataset.mq)); refreshModal(); return; }
    if (t.id === 'madd') { addFromModal(); return; }
    if (t.id === 'openBag') { openSheet(); return; }
    if (t.hasAttribute('data-close')) { closeSheet(); return; }
    if (t.dataset.q) {
      var it = cart[+t.dataset.i]; if (!it) return; it.qty += +t.dataset.q;
      if (it.qty <= 0) cart.splice(+t.dataset.i, 1);
      saveCart(); updateBar(); openSheet(); return;
    }
    if (t.dataset.copy) {
      var done = function () { toast('Código Pix copiado'); }, fb = function () { toast('Toque e segure o código para copiar'); };
      try { navigator.clipboard.writeText(t.dataset.copy).then(done, fb); } catch (err) { fb(); }
      return;
    }
    if (t.matches('.sheet a.btn')) closeSheet();
  });
  $('#sheetbg').addEventListener('click', closeSheet);
  $('#mbg').addEventListener('click', closeModal);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeSheet(); closeModal(); } });
  document.addEventListener('change', function (e) {
    if (M && e.target.closest('#modal') && e.target.matches('.orow input')) { toggleOption(e.target.closest('.grp').dataset.g, e.target.value); return; }
    if (e.target.closest('#co')) updateCheckout();
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'f-phone' || e.target.id === 't-phone') e.target.value = fmtPhone(e.target.value);
    if (e.target.id === 'mnote' && M) M.note = e.target.value;
    if (e.target.id === 'q') { search = e.target.value; drawList(); }
  });
  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    if (f.id === 'co') submitOrder(f);
    else if (f.id === 'tr') { shownPhone = digits($('#t-phone').value); justOrdered = null; showOrders(shownPhone, false); }
  });

  /* ---------- Início ---------- */
  function boot() {
    var v = $('#v-cardapio'); v.hidden = false;
    v.innerHTML = '<p class="loading">Carregando o cardápio…</p>';
    api.getCatalog().then(function (c) {
      catalog = c;
      // tira da sacola itens que sumiram do cardápio
      cart = cart.filter(function (i) { return findProduct(i.productId); }); saveCart();
      route();
    }).catch(function () {
      v.innerHTML = '<div class="card empty">Não foi possível carregar o cardápio agora.<br><button type="button" class="btn sm" id="retry" style="margin-top:12px">Tentar de novo</button></div>';
      $('#retry').addEventListener('click', boot);
    });
  }
  boot();
})();
