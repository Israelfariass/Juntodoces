// Camada de dados. O resto do código só fala com window.JD.
// Dois "motores": remoto (Supabase) e local (demonstração, usa localStorage).
(function () {
  var C = window.JD_CONFIG || {};
  var remote = !!(C.supabaseUrl && C.anonKey);
  var DAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  /* ---------- armazenamento local ---------- */
  var mem = {};
  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); if (v !== null) return JSON.parse(v); } catch (e) {}
      return k in mem ? mem[k] : d;
    },
    set: function (k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  function httpError(message, status) { var e = new Error(message); e.status = status; return e; }
  function uid(name) {
    var slug = String(name || 'item').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'item';
    return slug + '-' + Math.random().toString(36).slice(2, 6);
  }
  function nowSort() { return Math.floor(Date.now() / 1000); }
  function round2(n) { return Math.round(n * 100) / 100; }

  /* ---------- preço de um item (mesma regra do servidor) ---------- */
  // Os "inclusos" do grupo valem para as opções mais caras; as demais cobram o preço da opção.
  function groupCharge(g, ids) {
    var opts = ids.map(function (id) { return g.options.filter(function (o) { return o.id === id; })[0]; })
      .filter(Boolean).sort(function (a, b) { return b.price - a.price; });
    return opts.slice(g.free || 0).reduce(function (s, o) { return s + o.price; }, 0);
  }
  function unitPrice(p, sel) {
    return round2(p.groups.reduce(function (s, g) { return s + groupCharge(g, sel[g.id] || []); }, p.price));
  }
  function describe(p, sel, note) {
    var names = [];
    p.groups.forEach(function (g) {
      (sel[g.id] || []).forEach(function (id) {
        var o = g.options.filter(function (x) { return x.id === id; })[0]; if (o) names.push(o.name);
      });
    });
    if (note) names.push('Obs: ' + note);
    return names.join(', ').replace(', Obs:', ' · Obs:');
  }

  /* ---------- loja aberta? ---------- */
  function parseHM(s) { var p = String(s).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function openState(st, now) {
    now = now || new Date();
    if (st.mode === 'aberta') return { open: true, label: 'Aberto agora' };
    if (st.mode === 'fechada') return { open: false, label: 'Fechado no momento' };
    var hours = st.hours || {}, m = now.getHours() * 60 + now.getMinutes();
    var h = hours[now.getDay()];
    if (h && m >= parseHM(h[0]) && m < parseHM(h[1])) return { open: true, label: 'Aberto até ' + h[1] };
    for (var i = 0; i < 8; i++) {
      var d = (now.getDay() + i) % 7, hh = hours[d];
      if (hh && (i > 0 || m < parseHM(hh[0]))) {
        return { open: false, label: 'Fechado · abre ' + (i === 0 ? 'hoje' : i === 1 ? 'amanhã' : DAYS[d]) + ' às ' + hh[0] };
      }
    }
    return { open: false, label: 'Fechado no momento' };
  }

  /* ---------- cardápio de demonstração (igual ao seed.sql) ---------- */
  var ACOMP = ['Amendoim','Granola','Confete','Coco ralado','Leite em pó','Doce de leite','Paçoca','Cookies','Leite condensado','Creme de kinder','Creme de avelã','Creme de morango'];
  var ADIC = [['Stikadinho',300],['Nutella',500],['Ovomaltine',300],['Creme de leitinho',300]];
  function localGroups() {
    var free = function (pre) { return ACOMP.map(function (n, i) { return { id: pre + i, name: n, price: 0, active: true }; }); };
    return {
      acomp: { id: 'g-acomp', title: 'Acompanhamentos (escolha até 3, grátis)', min: 0, max: 3, free: 3, options: free('o-') },
      barca: { id: 'g-acomp-barca', title: 'Acompanhamentos da barca (escolha até 5, grátis)', min: 0, max: 5, free: 5, options: free('ob-') },
      adic: { id: 'g-adicional', title: 'Adicionais pagos', min: 0, max: 4, free: 0,
        options: ADIC.map(function (a, i) { return { id: 'o-ad-' + i, name: a[0], price: a[1] / 100, active: true }; }) }
    };
  }
  var LOCAL_HOURS = { 0: ['14:00', '23:00'], 1: ['14:00', '23:00'], 2: ['14:00', '23:00'], 3: ['14:00', '23:00'], 4: ['14:00', '23:00'], 5: ['14:00', '23:30'], 6: ['14:00', '23:30'] };
  function emptyOv() { return { paused: {}, price: {}, optOff: {}, settings: {}, gone: {}, catName: {}, cats: [], prods: [] }; }
  function getOv() {
    var o = store.get('jd_local', null) || {}, d = emptyOv();
    Object.keys(d).forEach(function (k) { if (o[k] == null) o[k] = d[k]; });
    return o;
  }
  function buildLocal() {
    var ov = getOv();
    var g = localGroups(), byId = {}, all = [];
    Object.keys(g).forEach(function (k) { g[k].options.forEach(function (o) { o.active = !ov.optOff[o.id]; }); byId[g[k].id] = g[k]; all.push(g[k]); });
    var P = function (id, name, desc, price, groups) {
      return { id: id, name: name, desc: desc, price: ov.price[id] != null ? ov.price[id] : price, image: '', paused: !!ov.paused[id], active: true, groups: groups || [] };
    };
    var st = { name: 'Juntô Doces', whatsapp: C.lojaWhatsapp || '', mode: 'aberta', hours: LOCAL_HOURS, fee: 5, min: 15, etaMin: 30, etaMax: 45 };
    Object.keys(ov.settings || {}).forEach(function (k) { st[k] = ov.settings[k]; });
    var cats = [{ id: 'acai', name: 'Açaí', products: [
      P('acai-300', 'Açaí 300 ml', 'Açaí cremoso com 3 acompanhamentos livres.', 18, [g.acomp, g.adic]),
      P('acai-400', 'Açaí 400 ml', 'Açaí cremoso com 3 acompanhamentos livres.', 20, [g.acomp, g.adic]),
      P('acai-500', 'Açaí 500 ml', 'Açaí cremoso com 3 acompanhamentos livres.', 24, [g.acomp, g.adic]),
      P('acai-700', 'Açaí 700 ml', 'Açaí cremoso com 3 acompanhamentos livres.', 30, [g.acomp, g.adic]),
      P('barca-p', 'Barca P', 'Barca de açaí com 5 acompanhamentos grátis.', 42, [g.barca, g.adic]),
      P('combo-abertura', 'Combo Promo de Abertura', 'Dois copos de 440 ml. Diga os acompanhamentos de cada copo nas observações.', 34, [])] }];
    ov.cats.forEach(function (c) { cats.push({ id: c.id, name: c.name, products: [] }); });
    var byCat = {}; cats.forEach(function (c) { byCat[c.id] = c; });
    ov.prods.forEach(function (p) {
      if (byCat[p.cat]) byCat[p.cat].products.push(P(p.id, p.name, p.desc, p.price, (p.groups || []).map(function (id) { return byId[id]; }).filter(Boolean)));
    });
    cats.forEach(function (c) { if (ov.catName[c.id]) c.name = ov.catName[c.id]; c.products = c.products.filter(function (p) { return !ov.gone[p.id]; }); });
    return { store: st, categories: cats.filter(function (c) { return !ov.gone[c.id]; }), groups: all };
  }

  /* ---------- motor remoto (Supabase) ---------- */
  var SKEY = 'jd_staff_token';
  function token() { try { return sessionStorage.getItem(SKEY) || ''; } catch (e) { return mem[SKEY] || ''; } }
  function setToken(t) { mem[SKEY] = t; try { if (t) sessionStorage.setItem(SKEY, t); else sessionStorage.removeItem(SKEY); } catch (e) {} }

  function sbHeaders(tok) { return { apikey: C.anonKey, Authorization: 'Bearer ' + (tok || C.anonKey), 'Content-Type': 'application/json' }; }
  function parse(res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (!res.ok) throw httpError((data && (data.error || data.message)) || 'Algo deu errado. Tente de novo.', res.status);
      return data;
    });
  }
  function rest(path, tok) { return fetch(C.supabaseUrl + '/rest/v1/' + path, { headers: sbHeaders(tok) }).then(parse); }
  function restWrite(method, path, body, tok, prefer) {
    var h = sbHeaders(tok); h.Prefer = prefer || 'return=minimal';
    return fetch(C.supabaseUrl + '/rest/v1/' + path, { method: method, headers: h, body: JSON.stringify(body) }).then(function (res) {
      if (!res.ok) return parse(res);
      return {};
    });
  }
  function fn(name, body, tok) {
    return fetch(C.supabaseUrl + '/functions/v1/' + name, { method: 'POST', headers: sbHeaders(tok), body: JSON.stringify(body) }).then(parse);
  }

  function normalizeRemote(r, admin) {
    var s = {}; r.settings.forEach(function (x) { s[x.key] = x.value; });
    var store = {
      name: s.loja_nome || 'Juntô Doces', whatsapp: s.loja_whatsapp || C.lojaWhatsapp || '', mode: s.loja_modo || 'aberta',
      hours: s.horarios || {}, fee: (s.taxa_entrega_cents || 0) / 100, min: (s.pedido_minimo_cents || 0) / 100,
      etaMin: s.tempo_min || 30, etaMax: s.tempo_max || 45
    };
    var opts = {}; r.options.forEach(function (o) {
      (opts[o.group_id] = opts[o.group_id] || []).push({ id: o.id, name: o.name, price: o.price_cents / 100, active: o.active !== false });
    });
    var groups = {}; r.groups.forEach(function (g) {
      groups[g.id] = { id: g.id, title: g.title, hint: '', min: g.min_select, max: g.max_select, free: g.free_select, options: opts[g.id] || [] };
    });
    var links = {}; r.links.forEach(function (l) { (links[l.product_id] = links[l.product_id] || []).push(groups[l.group_id]); });
    var cats = r.categories.map(function (c) { return { id: c.id, name: c.name, products: [] }; });
    var byCat = {}; cats.forEach(function (c) { byCat[c.id] = c; });
    r.products.forEach(function (p) {
      var c = byCat[p.category_id]; if (!c) return;
      c.products.push({ id: p.id, name: p.name, desc: p.description || '', price: p.price_cents / 100, image: p.image_url || '', paused: !!p.paused, active: p.active !== false, groups: (links[p.id] || []).filter(Boolean) });
    });
    return { store: store, categories: cats.filter(function (c) { return admin || c.products.length; }), groups: Object.keys(groups).map(function (k) { return groups[k]; }) };
  }
  function remoteCatalog(admin) {
    var tok = admin ? token() : null;
    var f = admin ? '' : '?active=eq.true&';
    return Promise.all([
      rest('categories?active=eq.true&order=sort.asc&select=id,name', tok),
      rest('products?active=eq.true&order=sort.asc&select=id,category_id,name,description,price_cents,image_url,paused,active', tok),
      rest('product_groups?order=sort.asc&select=product_id,group_id', tok),
      rest('option_groups?select=id,title,min_select,max_select,free_select', tok),
      rest('options?' + (admin ? '' : 'active=eq.true&') + 'order=sort.asc&select=id,group_id,name,price_cents,active', tok),
      rest('settings?select=key,value', tok)
    ]).then(function (a) {
      return normalizeRemote({ categories: a[0], products: a[1], links: a[2], groups: a[3], options: a[4], settings: a[5] }, admin);
    });
  }

  function mapRemoteOrder(o) {
    return {
      code: o.code, createdAt: Date.parse(o.created_at), tipo: o.fulfillment, pay: o.payment_method,
      payStatus: o.payment_status, status: o.status, total: o.total_cents / 100,
      name: o.customer_name, phone: o.phone, address: o.address || '', troco: o.cash_change_for || '', obs: o.notes || '',
      items: (o.order_items || o.items || []).map(function (i) { return { name: i.name, detail: i.detail, qty: i.qty, price: i.unit_price_cents / 100 }; }),
      pix: o.pix || null
    };
  }
  function admin(action, code) {
    return fn('admin-orders', { action: action, code: code }, token()).catch(function (e) { if (e.status === 401) setToken(''); throw e; });
  }

  /* ---------- API ---------- */
  var api = { mode: remote ? 'remote' : 'local' };
  var lastCatalog = null;

  api.getCatalog = function () {
    var p = remote ? remoteCatalog(false) : Promise.resolve(buildLocal());
    return p.then(function (c) { lastCatalog = c; return c; });
  };

  api.createOrder = function (p) {
    if (remote) {
      var body = {
        name: p.name, phone: p.phone, fulfillment: p.fulfillment, address: p.address, pay: p.pay, cashChangeFor: p.cashChangeFor, notes: p.notes,
        items: p.items.map(function (i) { return { productId: i.productId, qty: i.qty, selections: i.selections, note: i.note }; })
      };
      return fn('create-order', body).then(function (r) {
        var o = mapRemoteOrder(r.order);
        o.name = p.name; o.phone = p.phone; o.address = p.address || ''; o.obs = p.notes || '';
        return { order: o, pix: r.pix, pixError: !!r.pixError };
      });
    }
    var c = lastCatalog || buildLocal();
    if (!openState(c.store).open) return Promise.reject(httpError('A loja está fechada agora. Volte no horário de funcionamento.', 409));
    var sub = round2(p.items.reduce(function (s, i) { return s + i.price * i.qty; }, 0));
    if (sub < c.store.min) return Promise.reject(httpError('O pedido mínimo é R$ ' + c.store.min.toFixed(2).replace('.', ',') + '.', 400));
    var list = store.get('jd_orders', []);
    var num = list.reduce(function (m, o) { return Math.max(m, o.num); }, 100) + 1;
    var fee = p.fulfillment === 'entrega' ? c.store.fee : 0;
    var o = {
      num: num, code: 'JD-' + num, createdAt: Date.now(), name: p.name, phone: p.phone, tipo: p.fulfillment,
      address: p.address || '', pay: p.pay, payStatus: 'pendente', troco: p.cashChangeFor || '', obs: p.notes || '',
      items: p.items.map(function (i) { return { name: i.name, detail: i.detail, qty: i.qty, price: i.price }; }),
      total: round2(sub + fee), status: 'recebido', pix: null
    };
    list.push(o); store.set('jd_orders', list);
    return Promise.resolve({ order: o, pix: null, pixError: false });
  };

  api.trackOrders = function (phone) {
    if (remote) return fn('track-order', { phone: phone }).then(function (r) { return r.orders.map(mapRemoteOrder); });
    return Promise.resolve(store.get('jd_orders', []).filter(function (o) { return o.phone === phone; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 3));
  };

  var FLOW = ['recebido', 'preparo', 'rota', 'entregue'];
  function localOrder(code) {
    var l = store.get('jd_orders', []);
    return { list: l, o: l.filter(function (x) { return x.code === code; })[0] };
  }
  function localOv() { return getOv(); }

  api.staff = {
    isLoggedIn: function () { return remote ? !!token() : true; },
    login: function (email, password) {
      if (!remote) return Promise.resolve();
      return fetch(C.supabaseUrl + '/auth/v1/token?grant_type=password', { method: 'POST', headers: sbHeaders(), body: JSON.stringify({ email: email, password: password }) })
        .then(function (res) {
          return res.json().then(function (d) {
            if (!res.ok || !d.access_token) throw httpError('E-mail ou senha incorretos.', 400);
            setToken(d.access_token);
          });
        });
    },
    logout: function () { setToken(''); },
    list: function () {
      if (remote) return admin('list').then(function (r) { return r.orders.map(mapRemoteOrder); });
      return Promise.resolve(store.get('jd_orders', []).slice().sort(function (a, b) { return b.createdAt - a.createdAt; }));
    },
    advance: function (code) {
      if (remote) return admin('advance', code);
      var x = localOrder(code), i = FLOW.indexOf(x.o.status);
      if (FLOW[i + 1]) x.o.status = FLOW[i + 1];
      store.set('jd_orders', x.list);
      return Promise.resolve({ ok: true, notified: false });
    },
    cancel: function (code) {
      if (remote) return admin('cancel', code);
      var x = localOrder(code); x.o.status = 'cancelado'; store.set('jd_orders', x.list);
      return Promise.resolve({ ok: true, notified: false });
    },
    markPaid: function (code) {
      if (remote) return admin('mark-paid', code);
      var x = localOrder(code); x.o.payStatus = 'pago'; store.set('jd_orders', x.list);
      return Promise.resolve({ ok: true });
    },
    catalog: function () { return remote ? remoteCatalog(true) : Promise.resolve(buildLocal()); },
    setProduct: function (id, patch) {
      if (remote) {
        var body = {}; if (patch.price != null) body.price_cents = Math.round(patch.price * 100); if (patch.paused != null) body.paused = patch.paused;
        return restWrite('PATCH', 'products?id=eq.' + encodeURIComponent(id), body, token());
      }
      var ov = localOv();
      if (patch.price != null) ov.price[id] = patch.price;
      if (patch.paused != null) { if (patch.paused) ov.paused[id] = true; else delete ov.paused[id]; }
      store.set('jd_local', ov); return Promise.resolve({});
    },
    setOption: function (id, active) {
      if (remote) return restWrite('PATCH', 'options?id=eq.' + encodeURIComponent(id), { active: active }, token());
      var ov = localOv(); if (active) delete ov.optOff[id]; else ov.optOff[id] = true;
      store.set('jd_local', ov); return Promise.resolve({});
    },
    addCategory: function (name) {
      if (remote) return restWrite('POST', 'categories', { id: uid(name), name: name, sort: nowSort(), active: true }, token());
      var ov = localOv(); ov.cats.push({ id: uid(name), name: name }); store.set('jd_local', ov); return Promise.resolve({});
    },
    renameCategory: function (id, name) {
      if (remote) return restWrite('PATCH', 'categories?id=eq.' + encodeURIComponent(id), { name: name }, token());
      var ov = localOv(); ov.catName[id] = name; store.set('jd_local', ov); return Promise.resolve({});
    },
    removeCategory: function (id) {
      if (remote) return restWrite('PATCH', 'categories?id=eq.' + encodeURIComponent(id), { active: false }, token());
      var ov = localOv(); ov.gone[id] = true; store.set('jd_local', ov); return Promise.resolve({});
    },
    addProduct: function (p) {
      var id = uid(p.name);
      if (remote) {
        return restWrite('POST', 'products', { id: id, category_id: p.categoryId, name: p.name, description: p.desc || '', price_cents: Math.round(p.price * 100), sort: nowSort(), active: true }, token())
          .then(function () {
            if (!p.groups.length) return {};
            return restWrite('POST', 'product_groups', p.groups.map(function (gid, i) { return { product_id: id, group_id: gid, sort: i + 1 }; }), token());
          });
      }
      var ov = localOv(); ov.prods.push({ id: id, cat: p.categoryId, name: p.name, desc: p.desc || '', price: p.price, groups: p.groups }); store.set('jd_local', ov); return Promise.resolve({});
    },
    removeProduct: function (id) {
      if (remote) return restWrite('PATCH', 'products?id=eq.' + encodeURIComponent(id), { active: false }, token());
      var ov = localOv(); ov.gone[id] = true; store.set('jd_local', ov); return Promise.resolve({});
    },
    saveSettings: function (s) {
      if (remote) {
        var rows = [
          { key: 'loja_nome', value: s.name }, { key: 'loja_whatsapp', value: s.whatsapp }, { key: 'loja_modo', value: s.mode },
          { key: 'horarios', value: s.hours }, { key: 'taxa_entrega_cents', value: Math.round(s.fee * 100) },
          { key: 'pedido_minimo_cents', value: Math.round(s.min * 100) }, { key: 'tempo_min', value: s.etaMin }, { key: 'tempo_max', value: s.etaMax }
        ];
        return restWrite('POST', 'settings?on_conflict=key', rows, token(), 'resolution=merge-duplicates,return=minimal');
      }
      var ov = localOv(); ov.settings = s; store.set('jd_local', ov); return Promise.resolve({});
    }
  };

  window.JD = { api: api, store: store, openState: openState, unitPrice: unitPrice, describe: describe, DAYS: DAYS };
})();
