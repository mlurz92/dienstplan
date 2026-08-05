//#region node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs
var e = Math.min, t = Math.max, n = Math.round, r = Math.floor, i = (e) => ({
	x: e,
	y: e
}), a = {
	left: "right",
	right: "left",
	bottom: "top",
	top: "bottom"
};
function o(n, r, i) {
	return t(n, e(r, i));
}
function s(e, t) {
	return typeof e == "function" ? e(t) : e;
}
function c(e) {
	return e.split("-")[0];
}
function l(e) {
	return e.split("-")[1];
}
function u(e) {
	return e === "x" ? "y" : "x";
}
function d(e) {
	return e === "y" ? "height" : "width";
}
function f(e) {
	let t = e[0];
	return t === "t" || t === "b" ? "y" : "x";
}
function p(e) {
	return u(f(e));
}
function m(e, t, n) {
	n === void 0 && (n = !1);
	let r = l(e), i = p(e), a = d(i), o = i === "x" ? r === (n ? "end" : "start") ? "right" : "left" : r === "start" ? "bottom" : "top";
	return t.reference[a] > t.floating[a] && (o = C(o)), [o, C(o)];
}
function h(e) {
	let t = C(e);
	return [
		g(e),
		t,
		g(t)
	];
}
function g(e) {
	return e.includes("start") ? e.replace("start", "end") : e.replace("end", "start");
}
var _ = ["left", "right"], v = ["right", "left"], y = ["top", "bottom"], b = ["bottom", "top"];
function x(e, t, n) {
	switch (e) {
		case "top":
		case "bottom": return n ? t ? v : _ : t ? _ : v;
		case "left":
		case "right": return t ? y : b;
		default: return [];
	}
}
function S(e, t, n, r) {
	let i = l(e), a = x(c(e), n === "start", r);
	return i && (a = a.map((e) => e + "-" + i), t && (a = a.concat(a.map(g)))), a;
}
function C(e) {
	let t = c(e);
	return a[t] + e.slice(t.length);
}
function w(e) {
	return {
		top: e.top ?? 0,
		right: e.right ?? 0,
		bottom: e.bottom ?? 0,
		left: e.left ?? 0
	};
}
function ee(e) {
	return typeof e == "number" ? {
		top: e,
		right: e,
		bottom: e,
		left: e
	} : w(e);
}
function T(e) {
	let { x: t, y: n, width: r, height: i } = e;
	return {
		width: r,
		height: i,
		top: n,
		left: t,
		right: t + r,
		bottom: n + i,
		x: t,
		y: n
	};
}
//#endregion
//#region node_modules/@floating-ui/core/dist/floating-ui.core.mjs
function E(e, t, n) {
	let { reference: r, floating: i } = e, a = f(t), o = p(t), s = d(o), u = c(t), m = a === "y", h = r.x + r.width / 2 - i.width / 2, g = r.y + r.height / 2 - i.height / 2, _ = r[s] / 2 - i[s] / 2, v;
	switch (u) {
		case "top":
			v = {
				x: h,
				y: r.y - i.height
			};
			break;
		case "bottom":
			v = {
				x: h,
				y: r.y + r.height
			};
			break;
		case "right":
			v = {
				x: r.x + r.width,
				y: g
			};
			break;
		case "left":
			v = {
				x: r.x - i.width,
				y: g
			};
			break;
		default: v = {
			x: r.x,
			y: r.y
		};
	}
	let y = l(t);
	return y && (v[o] += _ * (y === "end" ? 1 : -1) * (n && m ? -1 : 1)), v;
}
async function D(e, t) {
	t === void 0 && (t = {});
	let { x: n, y: r, platform: i, rects: a, elements: o, strategy: c } = e, { boundary: l = "clippingAncestors", rootBoundary: u = "viewport", elementContext: d = "floating", altBoundary: f = !1, padding: p = 0 } = s(t, e), m = ee(p), h = o[f ? d === "floating" ? "reference" : "floating" : d], g = T(await i.getClippingRect({
		element: await (i.isElement == null ? void 0 : i.isElement(h)) ?? !0 ? h : h.contextElement || await (i.getDocumentElement == null ? void 0 : i.getDocumentElement(o.floating)),
		boundary: l,
		rootBoundary: u,
		strategy: c
	})), _ = d === "floating" ? {
		x: n,
		y: r,
		width: a.floating.width,
		height: a.floating.height
	} : a.reference, v = await (i.getOffsetParent == null ? void 0 : i.getOffsetParent(o.floating)), y = await (i.isElement == null ? void 0 : i.isElement(v)) && await (i.getScale == null ? void 0 : i.getScale(v)) || {
		x: 1,
		y: 1
	}, b = T(i.convertOffsetParentRelativeRectToViewportRelativeRect ? await i.convertOffsetParentRelativeRectToViewportRelativeRect({
		elements: o,
		rect: _,
		offsetParent: v,
		strategy: c
	}) : _);
	return {
		top: (g.top - b.top + m.top) / y.y,
		bottom: (b.bottom - g.bottom + m.bottom) / y.y,
		left: (g.left - b.left + m.left) / y.x,
		right: (b.right - g.right + m.right) / y.x
	};
}
var te = 50, O = async (e, t, n) => {
	let { placement: r = "bottom", strategy: i = "absolute", middleware: a = [], platform: o } = n, s = o.detectOverflow ? o : {
		...o,
		detectOverflow: D
	}, c = await (o.isRTL == null ? void 0 : o.isRTL(t)), l = await o.getElementRects({
		reference: e,
		floating: t,
		strategy: i
	}), { x: u, y: d } = E(l, r, c), f = r, p = 0, m = {};
	for (let n = 0; n < a.length; n++) {
		let h = a[n];
		if (!h) continue;
		let { name: g, fn: _ } = h, { x: v, y, data: b, reset: x } = await _({
			x: u,
			y: d,
			initialPlacement: r,
			placement: f,
			strategy: i,
			middlewareData: m,
			rects: l,
			platform: s,
			elements: {
				reference: e,
				floating: t
			}
		});
		u = v ?? u, d = y ?? d, m[g] = {
			...m[g],
			...b
		}, x && p < te && (p++, typeof x == "object" && (x.placement && (f = x.placement), x.rects && (l = x.rects === !0 ? await o.getElementRects({
			reference: e,
			floating: t,
			strategy: i
		}) : x.rects), {x: u, y: d} = E(l, f, c)), n = -1);
	}
	return {
		x: u,
		y: d,
		placement: f,
		strategy: i,
		middlewareData: m
	};
}, k = function(e) {
	return e === void 0 && (e = {}), {
		name: "flip",
		options: e,
		async fn(t) {
			var n;
			let { placement: r, middlewareData: i, rects: a, initialPlacement: o, platform: l, elements: u } = t, { mainAxis: d = !0, crossAxis: p = !0, fallbackPlacements: g, fallbackStrategy: _ = "bestFit", fallbackAxisSideDirection: v = "none", flipAlignment: y = !0, ...b } = s(e, t);
			if ((n = i.arrow) != null && n.alignmentOffset) return {};
			let x = c(r), w = f(o), ee = c(o) === o, T = await (l.isRTL == null ? void 0 : l.isRTL(u.floating)), E = g || (ee || !y ? [C(o)] : h(o)), D = v !== "none";
			!g && D && E.push(...S(o, y, v, T));
			let te = [o, ...E], O = await l.detectOverflow(t, b), k = [], A = i.flip?.overflows || [];
			if (d && k.push(O[x]), p) {
				let e = m(r, a, T);
				k.push(O[e[0]], O[e[1]]);
			}
			if (A = [...A, {
				placement: r,
				overflows: k
			}], !k.every((e) => e <= 0)) {
				let e = (i.flip?.index || 0) + 1, t = te[e];
				if (t && (!(p === "alignment" && w !== f(t)) || A.every((e) => f(e.placement) !== w || e.overflows[0] > 0))) return {
					data: {
						index: e,
						overflows: A
					},
					reset: { placement: t }
				};
				let n = A.filter((e) => e.overflows[0] <= 0).sort((e, t) => e.overflows[1] - t.overflows[1])[0]?.placement;
				if (!n) switch (_) {
					case "bestFit": {
						let e = A.filter((e) => {
							if (D) {
								let t = f(e.placement);
								return t === w || t === "y";
							}
							return !0;
						}).map((e) => [e.placement, e.overflows.filter((e) => e > 0).reduce((e, t) => e + t, 0)]).sort((e, t) => e[1] - t[1])[0]?.[0];
						e && (n = e);
						break;
					}
					case "initialPlacement":
						n = o;
						break;
				}
				if (r !== n) return { reset: { placement: n } };
			}
			return {};
		}
	};
}, A = /*#__PURE__*/ new Set(["left", "top"]);
async function ne(e, t) {
	let { placement: n, platform: r, elements: i } = e, a = await (r.isRTL == null ? void 0 : r.isRTL(i.floating)), o = c(n), u = l(n), d = f(n) === "y", p = A.has(o) ? -1 : 1, m = a && d ? -1 : 1, h = s(t, e), { mainAxis: g, crossAxis: _, alignmentAxis: v } = typeof h == "number" ? {
		mainAxis: h,
		crossAxis: 0,
		alignmentAxis: null
	} : {
		mainAxis: h.mainAxis || 0,
		crossAxis: h.crossAxis || 0,
		alignmentAxis: h.alignmentAxis
	};
	return u && typeof v == "number" && (_ = u === "end" ? v * -1 : v), d ? {
		x: _ * m,
		y: g * p
	} : {
		x: g * p,
		y: _ * m
	};
}
var re = function(e) {
	return e === void 0 && (e = 0), {
		name: "offset",
		options: e,
		async fn(t) {
			var n;
			let { x: r, y: i, placement: a, middlewareData: o } = t, s = await ne(t, e);
			return a === o.offset?.placement && (n = o.arrow) != null && n.alignmentOffset ? {} : {
				x: r + s.x,
				y: i + s.y,
				data: {
					...s,
					placement: a
				}
			};
		}
	};
}, ie = function(e) {
	return e === void 0 && (e = {}), {
		name: "shift",
		options: e,
		async fn(t) {
			let { x: n, y: r, placement: i, platform: a } = t, { mainAxis: c = !0, crossAxis: l = !1, limiter: d = { fn: (e) => {
				let { x: t, y: n } = e;
				return {
					x: t,
					y: n
				};
			} }, ...p } = s(e, t), m = {
				x: n,
				y: r
			}, h = await a.detectOverflow(t, p), g = f(i), _ = u(g), v = m[_], y = m[g], b = (e, t) => o(t + h[e === "y" ? "top" : "left"], t, t - h[e === "y" ? "bottom" : "right"]);
			c && (v = b(_, v)), l && (y = b(g, y));
			let x = d.fn({
				...t,
				[_]: v,
				[g]: y
			});
			return {
				...x,
				data: {
					x: x.x - n,
					y: x.y - r,
					enabled: {
						[_]: c,
						[g]: l
					}
				}
			};
		}
	};
};
//#endregion
//#region node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
function j() {
	return typeof window < "u";
}
function M(e) {
	return ae(e) ? (e.nodeName || "").toLowerCase() : "#document";
}
function N(e) {
	var t;
	return (e == null || (t = e.ownerDocument) == null ? void 0 : t.defaultView) || window;
}
function P(e) {
	return ((ae(e) ? e.ownerDocument : e.document) || window.document)?.documentElement;
}
function ae(e) {
	return j() ? e instanceof Node || e instanceof N(e).Node : !1;
}
function F(e) {
	return j() ? e instanceof Element || e instanceof N(e).Element : !1;
}
function I(e) {
	return j() ? e instanceof HTMLElement || e instanceof N(e).HTMLElement : !1;
}
function oe(e) {
	return !j() || typeof ShadowRoot > "u" ? !1 : e instanceof ShadowRoot || e instanceof N(e).ShadowRoot;
}
function L(e) {
	let { overflow: t, overflowX: n, overflowY: r, display: i } = U(e);
	return /auto|scroll|overlay|hidden|clip/.test(t + r + n) && i !== "inline" && i !== "contents";
}
function se(e) {
	return /^(table|td|th)$/.test(M(e));
}
function R(e) {
	try {
		if (e.matches(":popover-open")) return !0;
	} catch {}
	try {
		return e.matches(":modal");
	} catch {
		return !1;
	}
}
var ce = /transform|translate|scale|rotate|perspective|filter/, le = /paint|layout|strict|content/, z = (e) => !!e && e !== "none", ue;
function B(e) {
	let t = F(e) ? U(e) : e;
	return z(t.transform) || z(t.translate) || z(t.scale) || z(t.rotate) || z(t.perspective) || !V() && (z(t.backdropFilter) || z(t.filter)) || ce.test(t.willChange || "") || le.test(t.contain || "");
}
function de(e) {
	let t = G(e);
	for (; I(t) && !H(t);) {
		if (B(t)) return t;
		if (R(t)) return null;
		t = G(t);
	}
	return null;
}
function V() {
	return ue ??= typeof CSS < "u" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none"), ue;
}
function H(e) {
	return /^(html|body|#document)$/.test(M(e));
}
function U(e) {
	return N(e).getComputedStyle(e);
}
function W(e) {
	return F(e) ? {
		scrollLeft: e.scrollLeft,
		scrollTop: e.scrollTop
	} : {
		scrollLeft: e.scrollX,
		scrollTop: e.scrollY
	};
}
function G(e) {
	if (M(e) === "html") return e;
	let t = e.assignedSlot || e.parentNode || oe(e) && e.host || P(e);
	return oe(t) ? t.host : t;
}
function fe(e) {
	let t = G(e);
	return H(t) ? (e.ownerDocument || e).body : I(t) && L(t) ? t : fe(t);
}
function K(e, t, n) {
	t === void 0 && (t = []), n === void 0 && (n = !0);
	let r = fe(e), i = r === e.ownerDocument?.body, a = N(r);
	if (i) {
		let e = q(a);
		return t.concat(a, a.visualViewport || [], L(r) ? r : [], e && n ? K(e) : []);
	} else return t.concat(r, K(r, [], n));
}
function q(e) {
	return e.parent && Object.getPrototypeOf(e.parent) ? e.frameElement : null;
}
//#endregion
//#region node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
function pe(e) {
	let t = U(e), r = parseFloat(t.width) || 0, i = parseFloat(t.height) || 0, a = I(e), o = a ? e.offsetWidth : r, s = a ? e.offsetHeight : i, c = n(r) !== o || n(i) !== s;
	return c && (r = o, i = s), {
		width: r,
		height: i,
		$: c
	};
}
function J(e) {
	return F(e) ? e : e.contextElement;
}
function Y(e) {
	let t = J(e);
	if (!I(t)) return i(1);
	let r = t.getBoundingClientRect(), { width: a, height: o, $: s } = pe(t), c = (s ? n(r.width) : r.width) / a, l = (s ? n(r.height) : r.height) / o;
	return (!c || !Number.isFinite(c)) && (c = 1), (!l || !Number.isFinite(l)) && (l = 1), {
		x: c,
		y: l
	};
}
var me = /*#__PURE__*/ i(0);
function he(e) {
	let t = N(e);
	return !V() || !t.visualViewport ? me : {
		x: t.visualViewport.offsetLeft,
		y: t.visualViewport.offsetTop
	};
}
function ge(e, t, n) {
	return t === void 0 && (t = !1), !!n && t && n === N(e);
}
function X(e, t, n, r) {
	t === void 0 && (t = !1), n === void 0 && (n = !1);
	let a = e.getBoundingClientRect(), o = J(e), s = i(1);
	t && (r ? F(r) && (s = Y(r)) : s = Y(e));
	let c = ge(o, n, r) ? he(o) : i(0), l = (a.left + c.x) / s.x, u = (a.top + c.y) / s.y, d = a.width / s.x, f = a.height / s.y;
	if (o && r) {
		let e = N(o), t = F(r) ? N(r) : r, n = e, i = q(n);
		for (; i && t !== n;) {
			let e = Y(i), t = i.getBoundingClientRect(), r = U(i), a = t.left + (i.clientLeft + parseFloat(r.paddingLeft)) * e.x, o = t.top + (i.clientTop + parseFloat(r.paddingTop)) * e.y;
			l *= e.x, u *= e.y, d *= e.x, f *= e.y, l += a, u += o, n = N(i), i = q(n);
		}
	}
	return T({
		width: d,
		height: f,
		x: l,
		y: u
	});
}
function Z(e, t) {
	let n = W(e).scrollLeft;
	return t ? t.left + n : X(P(e)).left + n;
}
function _e(e, t) {
	let n = e.getBoundingClientRect();
	return {
		x: n.left + t.scrollLeft - Z(e, n),
		y: n.top + t.scrollTop
	};
}
function ve(e) {
	let { elements: t, rect: n, offsetParent: r, strategy: a } = e, o = a === "fixed", s = P(r), c = t ? R(t.floating) : !1;
	if (r === s || c && o) return n;
	let l = {
		scrollLeft: 0,
		scrollTop: 0
	}, u = i(1), d = i(0), f = I(r);
	if ((f || !o) && ((M(r) !== "body" || L(s)) && (l = W(r)), f)) {
		let e = X(r);
		u = Y(r), d.x = e.x + r.clientLeft, d.y = e.y + r.clientTop;
	}
	let p = s && !f && !o ? _e(s, l) : i(0);
	return {
		width: n.width * u.x,
		height: n.height * u.y,
		x: n.x * u.x - l.scrollLeft * u.x + d.x + p.x,
		y: n.y * u.y - l.scrollTop * u.y + d.y + p.y
	};
}
function ye(e) {
	return e.getClientRects ? Array.from(e.getClientRects()) : [];
}
function be(e) {
	let n = W(e), r = e.ownerDocument.body, i = t(e.scrollWidth, e.clientWidth, r.scrollWidth, r.clientWidth), a = t(e.scrollHeight, e.clientHeight, r.scrollHeight, r.clientHeight), o = -n.scrollLeft + Z(e), s = -n.scrollTop;
	return U(r).direction === "rtl" && (o += t(e.clientWidth, r.clientWidth) - i), {
		width: i,
		height: a,
		x: o,
		y: s
	};
}
var xe = 25;
function Se(e, t, n) {
	n === void 0 && (n = "viewport");
	let r = n === "layoutViewport", i = N(e), a = P(e), o = i.visualViewport, s = a.clientWidth, c = a.clientHeight, l = 0, u = 0;
	if (o) {
		let e = !V() || t === "fixed";
		r ? e || (l = -o.offsetLeft, u = -o.offsetTop) : (s = o.width, c = o.height, e && (l = o.offsetLeft, u = o.offsetTop));
	}
	if (Z(a) <= 0) {
		let e = a.ownerDocument, t = e.body, n = getComputedStyle(t), r = e.compatMode === "CSS1Compat" && parseFloat(n.marginLeft) + parseFloat(n.marginRight) || 0, i = Math.abs(a.clientWidth - t.clientWidth - r), o = getComputedStyle(a).scrollbarGutter === "stable both-edges" ? i / 2 : i;
		o <= xe && (s -= o);
	}
	return {
		width: s,
		height: c,
		x: l,
		y: u
	};
}
function Ce(e, t) {
	let n = X(e, !0, t === "fixed"), r = n.top + e.clientTop, i = n.left + e.clientLeft, a = Y(e);
	return {
		width: e.clientWidth * a.x,
		height: e.clientHeight * a.y,
		x: i * a.x,
		y: r * a.y
	};
}
function we(e, t, n) {
	let r;
	if (t === "viewport" || t === "layoutViewport") r = Se(e, n, t);
	else if (t === "document") r = be(P(e));
	else if (F(t)) r = Ce(t, n);
	else {
		let n = he(e);
		r = {
			x: t.x - n.x,
			y: t.y - n.y,
			width: t.width,
			height: t.height
		};
	}
	return T(r);
}
function Te(e, t) {
	let n = t.get(e);
	if (n) return n;
	let r = K(e, [], !1).filter((e) => F(e) && M(e) !== "body"), i = null, a = U(e).position === "fixed", o = a ? G(e) : e;
	for (; F(o) && !H(o);) {
		let e = U(o), t = B(o), n = i ? i.position : a ? "fixed" : "";
		!t && (n === "fixed" || n === "absolute" && e.position === "static") ? r = r.filter((e) => e !== o) : i = e, o = G(o);
	}
	return t.set(e, r), r;
}
function Ee(n) {
	let { element: r, boundary: i, rootBoundary: a, strategy: o } = n, s = [...i === "clippingAncestors" ? R(r) ? [] : Te(r, this._c) : [].concat(i), a], c = we(r, s[0], o), l = c.top, u = c.right, d = c.bottom, f = c.left;
	for (let n = 1; n < s.length; n++) {
		let i = we(r, s[n], o);
		l = t(i.top, l), u = e(i.right, u), d = e(i.bottom, d), f = t(i.left, f);
	}
	return {
		width: u - f,
		height: d - l,
		x: f,
		y: l
	};
}
function De(e) {
	let { width: t, height: n } = pe(e);
	return {
		width: t,
		height: n
	};
}
function Oe(e, t, n) {
	let r = I(t), a = P(t), o = n === "fixed", s = X(e, !0, o, t), c = {
		scrollLeft: 0,
		scrollTop: 0
	}, l = i(0);
	if ((r || !o) && ((M(t) !== "body" || L(a)) && (c = W(t)), r)) {
		let e = X(t, !0, o, t);
		l.x = e.x + t.clientLeft, l.y = e.y + t.clientTop;
	}
	!r && a && (l.x = Z(a));
	let u = a && !r && !o ? _e(a, c) : i(0);
	return {
		x: s.left + c.scrollLeft - l.x - u.x,
		y: s.top + c.scrollTop - l.y - u.y,
		width: s.width,
		height: s.height
	};
}
function Q(e) {
	return U(e).position === "static";
}
function ke(e, t) {
	if (!I(e) || U(e).position === "fixed") return null;
	if (t) return t(e);
	let n = e.offsetParent;
	return P(e) === n && (n = n.ownerDocument.body), n;
}
function Ae(e, t) {
	let n = N(e);
	if (R(e)) return n;
	if (!I(e)) {
		let t = G(e);
		for (; t && !H(t);) {
			if (F(t) && !Q(t)) return t;
			t = G(t);
		}
		return n;
	}
	let r = ke(e, t);
	for (; r && se(r) && Q(r);) r = ke(r, t);
	return r && H(r) && Q(r) && !B(r) ? n : r || de(e) || n;
}
var je = async function(e) {
	let t = this.getOffsetParent || Ae, n = this.getDimensions, r = await n(e.floating);
	return {
		reference: Oe(e.reference, await t(e.floating), e.strategy),
		floating: {
			x: 0,
			y: 0,
			width: r.width,
			height: r.height
		}
	};
};
function Me(e) {
	return U(e).direction === "rtl";
}
var Ne = {
	convertOffsetParentRelativeRectToViewportRelativeRect: ve,
	getDocumentElement: P,
	getClippingRect: Ee,
	getOffsetParent: Ae,
	getElementRects: je,
	getClientRects: ye,
	getDimensions: De,
	getScale: Y,
	isElement: F,
	isRTL: Me
};
function $(e, t) {
	return e.x === t.x && e.y === t.y && e.width === t.width && e.height === t.height;
}
function Pe(n, i, a) {
	let o = null, s, c = P(n);
	function l() {
		var e;
		clearTimeout(s), (e = o) == null || e.disconnect(), o = null;
	}
	function u(a, d) {
		a === void 0 && (a = !1), d === void 0 && (d = 1), l();
		let f = n.getBoundingClientRect(), { left: p, top: m, width: h, height: g } = f;
		if (a || i(), !h || !g) return;
		let _ = r(m), v = r(c.clientWidth - (p + h)), y = r(c.clientHeight - (m + g)), b = r(p), x = {
			rootMargin: -_ + "px " + -v + "px " + -y + "px " + -b + "px",
			threshold: t(0, e(1, d)) || 1
		}, S = !0;
		function C(e) {
			let t = e[0].intersectionRatio;
			if (!$(f, n.getBoundingClientRect())) return u();
			if (t !== d) {
				if (!S) return u();
				t ? u(!1, t) : s = setTimeout(() => {
					u(!1, 1e-7);
				}, 1e3);
			}
			S = !1;
		}
		try {
			o = new IntersectionObserver(C, {
				...x,
				root: c.ownerDocument
			});
		} catch {
			o = new IntersectionObserver(C, x);
		}
		o.observe(n);
	}
	let d = N(n), f = () => u(a);
	return d.addEventListener("resize", f), u(!0), () => {
		d.removeEventListener("resize", f), l();
	};
}
function Fe(e, t, n, r) {
	r === void 0 && (r = {});
	let { ancestorScroll: i = !0, ancestorResize: a = !0, elementResize: o = typeof ResizeObserver == "function", layoutShift: s = typeof IntersectionObserver == "function", animationFrame: c = !1 } = r, l = J(e), u = i || a ? [...l ? K(l) : [], ...t ? K(t) : []] : [];
	u.forEach((e) => {
		i && e.addEventListener("scroll", n), a && e.addEventListener("resize", n);
	});
	let d = l && s ? Pe(l, n, a) : null, f = -1, p = null;
	o && (p = new ResizeObserver((e) => {
		let [r] = e;
		r && r.target === l && p && t && (p.unobserve(t), cancelAnimationFrame(f), f = requestAnimationFrame(() => {
			var e;
			(e = p) == null || e.observe(t);
		})), n();
	}), l && !c && p.observe(l), t && p.observe(t));
	let m, h = c ? X(e) : null;
	c && g();
	function g() {
		let t = X(e);
		h && !$(h, t) && n(), h = t, m = requestAnimationFrame(g);
	}
	return n(), () => {
		var e;
		u.forEach((e) => {
			i && e.removeEventListener("scroll", n), a && e.removeEventListener("resize", n);
		}), d?.(), (e = p) == null || e.disconnect(), p = null, c && cancelAnimationFrame(m);
	};
}
var Ie = re, Le = ie, Re = k, ze = (e, t, n) => {
	let r = /* @__PURE__ */ new Map(), i = n ?? {}, a = {
		...Ne,
		...i.platform,
		_c: r
	};
	return O(e, t, {
		...i,
		platform: a
	});
};
//#endregion
export { Fe as autoUpdate, ze as computePosition, Re as flip, Ie as offset, Le as shift };
