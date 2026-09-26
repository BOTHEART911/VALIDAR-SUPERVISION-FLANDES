/* ============================================================
   VALIDACIÓN DE DOCUMENTOS · ALCALDÍA DE FLANDES
   Una sola lectura: la ficha del código en Firestore (flandes-avisos).
   No llama a Apps Script. La web solo puede leer UNA ficha por su código;
   las reglas de Firestore no dejan listar ni escribir.

   La página que la carga define antes window.VALIDAR:
     { tipo: 'supervision' | 'contrato' }
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.VALIDAR || {};
  var FS = 'https://firestore.googleapis.com/v1/projects/flandes-avisos/databases/(default)/documents/';
  var LLAVE = 'AIzaSyDdGOATvG-tZ5ii5n_U6ExtKzh1CvNTVUE';
  var SONIDO = 'https://botheart911.github.io/ALCALDIA-MEDIOS/sound/';

  var TIPOS = {
    supervision: {
      coleccion: 'firmas', param: 'idFirma', patron: /^IDF\d{1,6}$/i, ejemplo: 'IDF01234',
      nombreDoc: 'Informe de supervisión', articulo: 'Este informe de supervisión fue generado'
    },
    contrato: {
      coleccion: 'certificados', param: 'idDoc', patron: /^CCPS\d{1,6}$/i, ejemplo: 'CCPS00123',
      nombreDoc: 'Certificación del contrato', articulo: 'Esta certificación fue generada'
    }
  };
  var T = TIPOS[CFG.tipo] || TIPOS.supervision;
  // parámetros que traen los QR viejos y nuevos (se aceptan los dos por si acaso)
  var PARAMS = ['idFirma', 'idDoc', 'id', 'codigo'];

  var $ = function (s) { return document.querySelector(s); };
  var ficha = null;

  /* ══════════ utilidades ══════════ */

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function pesos(v) {
    var s = String(v === null || v === undefined ? '' : v).trim();
    if (!s) return '';
    if (/^\$/.test(s)) return s;
    var n = Number(s);
    if (!isFinite(n)) return s;
    var neg = n < 0; n = Math.round(Math.abs(n));
    return (neg ? '- ' : '') + '$ ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function limpiarCodigo(v) { return String(v || '').trim().toUpperCase().replace(/\s+/g, ''); }

  /** Del texto de un QR (URL vieja, nueva o el código solo) saca el código. */
  function codigoDe(texto) {
    var t = String(texto || '').trim();
    try {
      var u = new URL(t);
      for (var i = 0; i < PARAMS.length; i++) { var v = u.searchParams.get(PARAMS[i]); if (v) return limpiarCodigo(v); }
    } catch (e) { /* no es URL */ }
    var m = t.match(/(IDF\d{1,6}|CCPS\d{1,6})/i);
    return m ? m[1].toUpperCase() : '';
  }

  function codigoUrl() {
    var q = new URLSearchParams(location.search);
    for (var i = 0; i < PARAMS.length; i++) { var v = q.get(PARAMS[i]); if (v) return limpiarCodigo(v); }
    return '';
  }

  function sonar(nombre) {
    try { var a = new Audio(SONIDO + nombre); a.volume = .6; a.play().catch(function () {}); } catch (e) {}
  }

  function aviso(texto) {
    var a = $('#aviso');
    a.textContent = texto; a.classList.add('ver');
    clearTimeout(aviso._t); aviso._t = setTimeout(function () { a.classList.remove('ver'); }, 2200);
  }

  /** dd/mm/aaaa -> fecha (o null) */
  function fechaDe(s) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || '').trim());
    return m ? new Date(+m[3], +m[2] - 1, +m[1], 23, 59, 59) : null;
  }

  /* ══════════ lectura ══════════ */

  /* Fin de la vigencia contratada del servicio. Solo se usa si la ficha de
     servicio (servicio/estado, la escribe el CORE) no se puede leer: así, si
     en otra vigencia se apaga o se borra el ecosistema, ningún documento
     auténtico sale como "NO VÁLIDO". Renovar = cambiar la fecha en CONFIG
     (VALIDACION_VIGENCIA_HASTA) y correr FCV_QUE='servicio' en el CORE. */
  var FIN_VIGENCIA = '31/12/2027';

  /** Lee un documento de Firestore. {estado:'ok'|'no'|'api', datos}. Sin red: lanza. */
  function leerDoc(ruta) {
    var url = FS + ruta + '?key=' + LLAVE;
    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var reloj = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    return fetch(url, { signal: ctl ? ctl.signal : undefined, cache: 'no-store' })
      .then(function (r) {
        clearTimeout(reloj);
        if (r.status === 404) return { estado: 'no' };
        if (!r.ok) return { estado: 'api', http: r.status };
        return r.json().then(function (j) {
          var o = {};
          Object.keys(j.fields || {}).forEach(function (k) {
            var f = j.fields[k];
            o[k] = f.stringValue !== undefined ? f.stringValue : (f.integerValue || f.doubleValue || '');
          });
          return { estado: 'ok', datos: o };
        }, function () { return { estado: 'api' }; });
      }, function (e) { clearTimeout(reloj); throw e; });
  }

  /** ¿El servicio sigue contratado? Lee la ficha de servicio a la vez que la del documento. */
  function servicioVigente(s) {
    if (!s || s.estado !== 'ok') return false;
    if (String(s.datos.activo || '').toUpperCase() !== 'SI') return false;
    var hasta = fechaDe(s.datos.vigenciaHasta || '');
    return !hasta || Date.now() <= hasta.getTime();
  }

  function vencidaLocal() {
    var h = fechaDe(FIN_VIGENCIA);
    return !!h && Date.now() > h.getTime();
  }

  /* ══════════ pintar ══════════ */

  var ICO = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    mal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    red: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
    qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="4" height="4" rx=".5"/><rect x="13" y="13" width="4" height="4" rx=".5"/><path d="M13 7h4v2M7 15v2h2"/></svg>'
  };

  function tarjeta(estado, titulo, texto) {
    var t = $('#resultado');
    t.dataset.estado = estado;
    $('#sello').innerHTML = ICO[estado] || '';
    $('#titulo').textContent = titulo;
    $('#subtitulo').textContent = texto;
  }

  function dato(k, v, clase) {
    if (v === undefined || v === null || String(v).trim() === '') return '';
    var ancho = /largo|ancho/.test(clase || '') ? ' dato--ancho' : '';
    return '<div class="dato' + ancho + '"><dt>' + esc(k) + '</dt><dd class="' + esc(clase || '') + '">' + v + '</dd></div>';
  }

  function estadoContrato(f) {
    var fin = fechaDe(f.fechaTermino);
    if (!fin) return '';
    return (Date.now() > fin.getTime())
      ? '<span class="pastilla pastilla--fin">TERMINADO</span>'
      : '<span class="pastilla pastilla--vivo">EN EJECUCIÓN</span>';
  }

  function pintarDatos(f) {
    var h = '';
    if (CFG.tipo === 'contrato') {
      h += dato('Código de verificación', esc(f.idDoc), 'codigo');
      h += dato('Expedida', esc(f.expedida));
      h += dato('Contratista', esc(f.nombre), 'ancho');
      h += dato('Documento', esc(f.documento));
      h += dato('Contrato N°', esc(f.contrato));
      h += dato('Fecha del contrato', esc(f.fechaContrato));
      h += dato('Tipo de contrato', esc(f.tipoContrato));
      h += dato('Secretaría', esc(f.secretaria), 'ancho');
      h += dato('Objeto', esc(f.objeto), 'largo');
      h += dato('Valor inicial', esc(f.valorI));
      h += dato('Adiciones (MRA)', esc(f.mra));
      h += dato('Valor final', esc(f.valorF));
      h += dato('Fecha de inicio', esc(f.fechaInicio));
      h += dato('Fecha de terminación', esc(f.fechaTermino));
      h += dato('Estado del contrato', estadoContrato(f));
      $('#datos').innerHTML = h;
      $('#cifrasCaja').classList.add('oculto');
    } else {
      h += dato('Código de firma', esc(f.idFirma), 'codigo');
      h += dato('Firmado', esc(f.fechaHora));
      h += dato('Contratista', esc(f.contratista), 'ancho');
      h += dato('Documento', esc(f.documento));
      h += dato('Contrato N°', esc(f.contrato));
      h += dato('Informe (cuenta) N°', esc(f.informe));
      h += dato('Radicado', esc(f.radicado));
      h += dato('Supervisor', esc(f.supervisor), 'ancho');
      h += dato('Secretaría', esc(f.secretaria), 'ancho');
      $('#datos').innerHTML = h;
      var a = pesos(f.saldoActual), c = pesos(f.cobro), s = pesos(f.nuevoSaldo);
      if (a || c || s) {
        $('#cifras').innerHTML =
          '<div class="cifra"><span>Saldo anterior</span><b>' + esc(a || '—') + '</b></div>' +
          '<div class="cifra cifra--cobro"><span>Cobro</span><b>' + esc(c || '—') + '</b></div>' +
          '<div class="cifra"><span>Nuevo saldo</span><b>' + esc(s || '—') + '</b></div>';
        $('#cifrasCaja').classList.remove('oculto');
      } else $('#cifrasCaja').classList.add('oculto');
    }
  }

  function pintarAcciones(f) {
    var doc = $('#btnDoc');
    var id = f && (CFG.tipo === 'contrato' ? f.pdfId : f.informeId);
    if (id && /^[\w-]{20,}$/.test(id)) {
      doc.href = CFG.tipo === 'contrato'
        ? 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(id)
        : 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view';
      doc.classList.remove('oculto');
    } else doc.classList.add('oculto');
    $('#btnCopiar').classList.toggle('oculto', !f);
  }

  function esqueleto() {
    var e = '';
    for (var i = 0; i < 6; i++) e += '<div class="dato"><dt><span class="esq" style="width:40%"></span></dt><dd><span class="esq" style="width:' + (55 + (i * 7) % 35) + '%"></span></dd></div>';
    $('#datos').innerHTML = e;
    $('#cifrasCaja').classList.add('oculto');
    pintarAcciones(null);
  }

  /* ══════════ flujo ══════════ */

  function validar(codigo, desdeEscaner) {
    codigo = limpiarCodigo(codigo);
    ficha = null;
    $('#campo').value = codigo;
    if (!codigo) {
      tarjeta('vacio', 'Escanea el código QR', 'Toca «Escanear QR» y apunta la cámara al código del documento, o escribe el código abajo.');
      $('#sello').innerHTML = ICO.qr;
      $('#datos').innerHTML = ''; $('#cifrasCaja').classList.add('oculto'); pintarAcciones(null);
      return Promise.resolve();
    }
    if (!T.patron.test(codigo)) {
      tarjeta('mal', 'CÓDIGO NO VÁLIDO', 'El código «' + codigo + '» no corresponde a un ' + T.nombreDoc.toLowerCase() + '. Debe verse como ' + T.ejemplo + '.');
      $('#datos').innerHTML = ''; $('#cifrasCaja').classList.add('oculto'); pintarAcciones(null);
      if (desdeEscaner) sonar('low_battery.mp3');
      return Promise.resolve();
    }
    tarjeta('carga', 'Verificando…', 'Consultando el código ' + codigo + ' en el sistema de la Alcaldía.');
    esqueleto();
    return Promise.all([leerDoc(T.coleccion + '/' + encodeURIComponent(codigo)), leerDoc('servicio/ESTADO')]).then(function (r) {
      var doc = r[0], srv = r[1];
      if (!servicioVigente(srv) || doc.estado === 'api') return sinServicio(codigo);
      var f = doc.estado === 'ok' ? doc.datos : null;
      if (!f) {
        tarjeta('mal', 'DOCUMENTO NO VÁLIDO', 'El código ' + codigo + ' no existe en el sistema de la Alcaldía de Flandes. No confíe en este documento.');
        $('#datos').innerHTML = dato('Código consultado', esc(codigo), 'codigo');
        pintarAcciones(null);
        if (desdeEscaner) sonar('low_battery.mp3');
        return;
      }
      ficha = f;
      tarjeta('ok', 'DOCUMENTO VÁLIDO', T.articulo + ' por el sistema de la Alcaldía de Flandes.');
      pintarDatos(f);
      pintarAcciones(f);
      if (desdeEscaner) sonar('pay_success.mp3');
    }).catch(function () {
      if (navigator.onLine !== false && vencidaLocal()) return sinServicio(codigo);
      tarjeta('red', 'Sin conexión', 'No pudimos consultar el código ' + codigo + '. Revisa tu conexión a internet y vuelve a intentarlo.');
      $('#datos').innerHTML = '<div class="dato dato--ancho"><dd><button class="btn btn--marca" id="reintentar" type="button">Reintentar</button></dd></div>';
      $('#reintentar').onclick = function () { validar(codigo); };
      pintarAcciones(null);
    });
  }

  /** El ecosistema ya no está contratado (o su base se apagó): nunca se dice "no válido". */
  function sinServicio(codigo) {
    ficha = null;
    tarjeta('red', 'SERVICIO DE VERIFICACIÓN NO DISPONIBLE',
      'El servicio de verificación en línea del ecosistema de gobierno digital desarrollado por Oscar Polania no está contratado en la vigencia actual. Esto no significa que el documento sea falso.');
    $('#datos').innerHTML =
      dato('Código del documento', esc(codigo), 'codigo') +
      dato('Cómo validarlo', 'Solicite la validación de ' + (CFG.tipo === 'contrato' ? 'esta certificación' : 'este informe de supervisión') +
        ' en la <b>Oficina de Contratación de la Alcaldía de Flandes</b>, indicando el código de arriba.', 'largo');
    $('#cifrasCaja').classList.add('oculto');
    pintarAcciones(null);
  }

  function ir(codigo, desdeEscaner) {
    var u = new URL(location.href);
    PARAMS.forEach(function (p) { u.searchParams.delete(p); });
    if (codigo) u.searchParams.set(T.param, codigo);
    try { history.replaceState(null, '', u.toString()); } catch (e) {}
    return validar(codigo, desdeEscaner);
  }

  /* ══════════ copiar ══════════ */

  function textoCopia() {
    if (!ficha) return '';
    var L = [];
    var add = function (k, v) { if (v !== undefined && String(v).trim() !== '') L.push(k + ': ' + v); };
    L.push('ALCALDÍA DE FLANDES · ' + T.nombreDoc.toUpperCase() + ' · DOCUMENTO VÁLIDO');
    if (CFG.tipo === 'contrato') {
      add('CÓDIGO', ficha.idDoc); add('EXPEDIDA', ficha.expedida); add('CONTRATISTA', ficha.nombre); add('DOCUMENTO', ficha.documento);
      add('CONTRATO', ficha.contrato); add('FECHA CONTRATO', ficha.fechaContrato); add('OBJETO', ficha.objeto);
      add('VALOR INICIAL', ficha.valorI); add('MRA', ficha.mra); add('VALOR FINAL', ficha.valorF);
      add('INICIO', ficha.fechaInicio); add('TERMINACIÓN', ficha.fechaTermino);
      var fin = fechaDe(ficha.fechaTermino); if (fin) add('ESTADO', Date.now() > fin.getTime() ? 'TERMINADO' : 'EN EJECUCIÓN');
    } else {
      add('CÓDIGO', ficha.idFirma); add('FIRMADO', ficha.fechaHora); add('CONTRATISTA', ficha.contratista); add('DOCUMENTO', ficha.documento);
      add('CONTRATO', ficha.contrato); add('INFORME', ficha.informe); add('RADICADO', ficha.radicado); add('SUPERVISOR', ficha.supervisor);
      add('SALDO ANTERIOR', pesos(ficha.saldoActual)); add('COBRO', pesos(ficha.cobro)); add('NUEVO SALDO', pesos(ficha.nuevoSaldo));
    }
    L.push('Verificado en: ' + location.href);
    return L.join('\n');
  }

  function copiar() {
    var t = textoCopia();
    if (!t) return;
    var hecho = function () { aviso('Datos copiados'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(hecho, function () { copiarViejo(t); hecho(); });
    } else { copiarViejo(t); hecho(); }
  }
  function copiarViejo(t) {
    var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.left = '-9999px'; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* ══════════ escáner ══════════ */

  var cam = { flujo: null, vivo: false, detector: null, lienzo: null };

  function cargarJsQR() {
    if (window.jsQR) return Promise.resolve();
    return new Promise(function (ok, mal) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
      s.onload = ok; s.onerror = mal; document.head.appendChild(s);
    });
  }

  function abrirEscaner() {
    var capa = $('#escaner'), video = $('#video');
    capa.classList.remove('oculto', 'leido');
    $('#escanerTexto').textContent = 'Apunta la cámara al código QR del documento.';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('#escanerTexto').textContent = 'Este navegador no permite usar la cámara. Escribe el código en el campo de abajo.';
      return;
    }
    var preparar = ('BarcodeDetector' in window)
      ? Promise.resolve(window.BarcodeDetector.getSupportedFormats ? window.BarcodeDetector.getSupportedFormats() : ['qr_code'])
          .then(function (f) { if (f.indexOf('qr_code') >= 0) cam.detector = new window.BarcodeDetector({ formats: ['qr_code'] }); else return cargarJsQR(); })
          .catch(cargarJsQR)
      : cargarJsQR();
    Promise.all([
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false }),
      preparar
    ]).then(function (r) {
      cam.flujo = r[0]; cam.vivo = true;
      video.srcObject = cam.flujo; video.setAttribute('playsinline', ''); video.muted = true;
      return video.play();
    }).then(function () { buscar(); })
      .catch(function (e) {
        cerrarEscaner();
        var msg = (e && e.name === 'NotAllowedError')
          ? 'No diste permiso para usar la cámara. Actívalo en el navegador o escribe el código.'
          : 'No se pudo abrir la cámara. Escribe el código en el campo de abajo.';
        aviso(msg);
      });
  }

  function buscar() {
    if (!cam.vivo) return;
    var video = $('#video');
    var siguiente = function () { if (cam.vivo) setTimeout(function () { requestAnimationFrame(buscar); }, 120); };
    if (video.readyState < 2) return siguiente();
    if (cam.detector) {
      cam.detector.detect(video).then(function (c) {
        if (c && c.length) leido(c[0].rawValue); else siguiente();
      }, siguiente);
      return;
    }
    if (!window.jsQR) return siguiente();
    var w = video.videoWidth, h = video.videoHeight;
    if (!w) return siguiente();
    var esc = Math.min(1, 720 / Math.max(w, h));
    var cw = Math.round(w * esc), ch = Math.round(h * esc);
    if (!cam.lienzo) cam.lienzo = document.createElement('canvas');
    cam.lienzo.width = cw; cam.lienzo.height = ch;
    var ctx = cam.lienzo.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, cw, ch);
    var r = window.jsQR(ctx.getImageData(0, 0, cw, ch).data, cw, ch, { inversionAttempts: 'dontInvert' });
    if (r && r.data) leido(r.data); else siguiente();
  }

  function leido(texto) {
    var codigo = codigoDe(texto);
    if (!codigo) {
      $('#escanerTexto').textContent = 'Ese QR no es de un documento de la Alcaldía. Prueba con otro.';
      setTimeout(function () { if (cam.vivo) buscar(); }, 900);
      return;
    }
    // QR del otro tipo de documento: se manda a su web
    var esIDF = /^IDF/.test(codigo);
    if (esIDF !== (CFG.tipo === 'supervision')) {
      $('#escaner').classList.add('leido');
      cerrarEscaner();
      location.href = (esIDF ? CFG.otraSupervision : CFG.otraContrato) + '?' + (esIDF ? 'idFirma=' : 'idDoc=') + encodeURIComponent(codigo);
      return;
    }
    $('#escaner').classList.add('leido');
    if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} }
    setTimeout(function () { cerrarEscaner(); ir(codigo, true); window.scrollTo({ top: 0, behavior: 'smooth' }); }, 220);
  }

  function cerrarEscaner() {
    cam.vivo = false;
    if (cam.flujo) { cam.flujo.getTracks().forEach(function (t) { t.stop(); }); cam.flujo = null; }
    var v = $('#video'); if (v) v.srcObject = null;
    $('#escaner').classList.add('oculto');
  }

  /* ══════════ tema ══════════ */

  function tema(t) {
    document.documentElement.dataset.tema = t;
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === 'oscuro' ? '#0d1512' : '#06402B';
  }
  function alternarTema() {
    var t = document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro';
    tema(t);
    try { localStorage.setItem('validar.tema', t); } catch (e) {}
  }

  /* ══════════ cielo: burbujas ══════════ */
  function burbujas() {
    var cab = $('.cab'); if (!cab || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (var i = 0; i < 7; i++) {
      var b = document.createElement('span'); b.className = 'burbuja';
      var s = 6 + Math.random() * 16;
      b.style.cssText = 'width:' + s + 'px;height:' + s + 'px;left:' + (Math.random() * 100) + '%;animation-duration:' + (7 + Math.random() * 8) + 's;animation-delay:-' + (Math.random() * 10) + 's';
      cab.appendChild(b);
    }
  }

  /* ══════════ arranque ══════════ */

  function arrancar() {
    $('#btnEscanear').addEventListener('click', abrirEscaner);
    $('#btnEscanear2').addEventListener('click', abrirEscaner);
    $('#cerrarEscaner').addEventListener('click', cerrarEscaner);
    $('#escaner').addEventListener('click', function (e) { if (e.target.id === 'escaner') cerrarEscaner(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && cam.vivo) cerrarEscaner(); });
    $('#btnCopiar').addEventListener('click', copiar);
    $('#btnTema').addEventListener('click', alternarTema);
    $('#formCodigo').addEventListener('submit', function (e) {
      e.preventDefault();
      var c = codigoDe($('#campo').value) || limpiarCodigo($('#campo').value);
      ir(c); $('#campo').blur(); window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('#campo').placeholder = T.ejemplo;
    burbujas();
    validar(codigoUrl(), false);
  }

  // tema antes de pintar (evita el destello)
  (function () {
    var t = null;
    try { t = localStorage.getItem('validar.tema'); } catch (e) {}
    if (!t) t = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'oscuro' : 'claro';
    tema(t);
  }());

  window.VALIDAR_API = { codigoDe: codigoDe, pesos: pesos, validar: validar };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
}());
