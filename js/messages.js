/* JulaDirect Messages v2. Conversations + chat on the same data layer as before
   (GamBasketAuth.getConversations / getConversation / sendMessage / subscribeToConversation).
   New: presence ("Online"), typing indicator, optimistic sending, grouped bubbles, quick questions,
   emoji tray, and spring physics for every motion (see Spring below). */
(() => {
    "use strict";
    const JD = window.JD;
    const state = { user: null, conversations: [], active: null, messages: [], channel: null, live: null, search: "", subscriptionToken: 0, openToken: 0, seen: new Set(), peerOnline: false, peerTyping: false, typingTimer: 0, lastTypingSent: 0, loaded: false };
    const $ = id => document.getElementById(id);
    const qs = key => new URLSearchParams(location.search).get(key);
    const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
    const money = value => `D ${Number(value || 0).toLocaleString("en-GM")}`;
    const time = value => value ? new Date(value).toLocaleTimeString("en-GM", { hour: "numeric", minute: "2-digit" }) : "";
    const dateKey = value => new Date(value).toDateString();
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const phone = () => window.matchMedia("(max-width: 820px)").matches;

    /* ---------- icons ---------- */
    const S = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
    const IC = {
        back: S('<path d="M15 5 8 12l7 7"/>'),
        search: S('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>', 'width="20" height="20"'),
        chat: S('<path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7a8.5 8.5 0 0 1 7.6-12.3h.5a8.5 8.5 0 0 1 8 8v.5Z"/>'),
        more: S('<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>'),
        bag: S('<path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>'),
        clip: S('<path d="m20 11.5-7.7 7.7a5 5 0 0 1-7-7l8.4-8.4a3.3 3.3 0 0 1 4.7 4.7l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6"/>'),
        smile: S('<circle cx="12" cy="12" r="9"/><path d="M8.2 14.2a4.5 4.5 0 0 0 7.6 0"/><circle cx="9" cy="9.6" r=".9" fill="currentColor"/><circle cx="15" cy="9.6" r=".9" fill="currentColor"/>'),
        mic: S('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>'),
        trash: S('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>'),
        play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>',
        pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>',
        photo: S('<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 3.5 3L15 13l5 4.500"/>'),
        camera: S('<path d="M4 8.5A2.500 2.500 0 0 1 6.500 6H8l1.200-1.800h5.600L16 6h1.500A2.500 2.500 0 0 1 20 8.500v8A2.500 2.500 0 0 1 17.500 19h-11A2.500 2.500 0 0 1 4 16.500v-8Z"/><circle cx="12" cy="12.500" r="3.300"/>'),
        plus: S('<path d="M12 5v14M5 12h14"/>'),
        close: S('<path d="m6 6 12 12M18 6 6 18"/>'),
        send: S('<path d="M21 3 3 10.5l7 2.5 2.5 7L21 3Z" fill="currentColor" stroke="none"/>'),
        user: S('<circle cx="12" cy="8.5" r="4" fill="currentColor" stroke="none"/><path d="M4.5 21c.6-4 3.5-6 7.5-6s6.9 2 7.5 6Z" fill="currentColor" stroke="none"/>'),
        verified: '<svg viewBox="0 0 24 24" width="19" height="19" aria-label="Verified"><path fill="currentColor" d="M12 1.8l2.4 1.8 3-.2 1 2.8 2.6 1.5-.7 2.9 1.4 2.7-2 2.2-.2 3-2.9.8-1.7 2.5-2.8-1.1-2.8 1.1-1.7-2.5-2.9-.8-.2-3-2-2.2 1.4-2.7-.7-2.9 2.6-1.5 1-2.8 3 .2z"/><path d="m8.2 12.2 2.6 2.6 5-5.2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.2 4.2L19 7"/></svg>',
        ticks: '<svg class="rd" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 12.8 4 4L14 8.5"/><path d="m10 15.7.8.8L20 7.5"/></svg>',
        clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
        link: S('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>'),
        chev: S('<path d="m9 6 6 6-6 6"/>', 'width="18" height="18"')
    };

    /* ---------- spring physics ----------
       A damped harmonic oscillator is sampled into Web Animations keyframes, so overshoot,
       squash and settle come from real physics (stiffness k, damping c), not from a bezier. */
    const Spring = {
        curve(k, c) {
            const w = Math.sqrt(k), z = c / (2 * w), key = k + ":" + c;
            if (this._c && this._c[key]) return this._c[key];
            const wd = w * Math.sqrt(Math.max(1e-6, 1 - z * z)), T = Math.min(1.6, Math.log(1 / 0.002) / (z * w)), N = Math.max(18, Math.round(T * 60)), out = [];
            for (let i = 0; i <= N; i++) { const t = T * i / N; out.push(1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t))); }
            out[N] = 1;
            (this._c = this._c || {})[key] = { p: out, ms: T * 1000 };
            return this._c[key];
        },
        /* from/to: { x, y, sx, sy, r, o } */
        run(el, from, to, k = 220, c = 11, delay = 0) {
            if (!el || reduce || !el.animate) { if (to && to.o !== undefined) el.style.opacity = to.o; return null; }
            const d = Object.assign({ x: 0, y: 0, sx: 1, sy: 1, r: 0, o: 1 }, to), f = Object.assign({ x: 0, y: 0, sx: 1, sy: 1, r: 0, o: 1 }, from);
            const { p, ms } = this.curve(k, c);
            const frames = p.map((v, i) => {
                const m = key => f[key] + (d[key] - f[key]) * v;
                return { offset: i / (p.length - 1), transform: `translate(${m("x")}px,${m("y")}px) rotate(${m("r")}deg) scale(${m("sx")},${m("sy")})`, opacity: Math.max(0, Math.min(1, m("o"))) };
            });
            return el.animate(frames, { duration: ms, delay, fill: "backwards", easing: "linear" });
        },
        /* spring a scalar: step(fn(value 0..1)) */
        pop(el, amount = 0.12, k = 300, c = 9) { return this.run(el, { sx: 1 - amount, sy: 1 + amount * .8 }, {}, k, c); }
    };

    /* press physics: squash on touch, spring back on release */
    function bindJelly(root) {
        root.addEventListener("pointerdown", e => {
            const el = e.target.closest("[data-jelly]");
            if (!el || el.disabled) return;
            el.__down = true; el.style.transition = "transform .09s ease-out"; el.style.transform = "scale(.88,.92)";
        });
        const up = e => {
            document.querySelectorAll("[data-jelly]").forEach(el => {
                if (!el.__down) return; el.__down = false; el.style.transition = ""; el.style.transform = "";
                Spring.run(el, { sx: .88, sy: .92 }, {}, 320, 8);
            });
        };
        document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
    }

    /* rubber scroll: a velocity impulse tilts and stretches the message flow, then it springs back */
    const Rubber = {
        x: 0, v: 0, raf: 0, last: 0, t: 0,
        kick(dv) { this.v += dv; if (!this.raf) { this.t = performance.now(); this.raf = requestAnimationFrame(this.step.bind(this)); } },
        step(now) {
            const flow = $("msFlow"); if (!flow) { this.raf = 0; return; }
            const dt = Math.min(0.032, (now - this.t) / 1000); this.t = now;
            const a = -240 * this.x - 14 * this.v; this.v += a * dt; this.x += this.v * dt;
            const x = Math.max(-1.6, Math.min(1.6, this.x));
            flow.style.transform = `skewY(${x * 0.55}deg) scaleY(${1 + Math.abs(x) * 0.004})`;
            if (Math.abs(this.x) < 0.003 && Math.abs(this.v) < 0.01) { this.x = this.v = 0; flow.style.transform = ""; this.raf = 0; return; }
            this.raf = requestAnimationFrame(this.step.bind(this));
        }
    };

    /* ---------- helpers ---------- */
    function avatar(name, url, cls = "", online = false) {
        const ch = esc((name || "G").trim().charAt(0).toUpperCase() || "G");
        const img = url && JD.safeUrl && JD.safeUrl(url);
        return `<span class="ms-av ${cls}${online ? " is-online" : ""}">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ch}<i class="ms-dot"></i></span>`;
    }
    const verifiedBadge = on => on ? `<span class="ms-vf">${IC.verified}</span>` : "";
    function decorateIcons(root) { (root || document).querySelectorAll("[data-ms-ico]").forEach(el => { el.innerHTML = IC[el.getAttribute("data-ms-ico")] || ""; }); }
    function fillStaticIcons() {
        $("mobileChatBack").innerHTML = IC.back; $("chatOrderIcon").innerHTML = IC.bag; $("chatMore").innerHTML = IC.more;
        $("msAttach").innerHTML = IC.plus; $("msEmojiBtn").innerHTML = IC.smile; $("msRecCancel").innerHTML = IC.trash;
        $("sendMessageBtn").innerHTML = `<span class="ms-ic ms-ic--mic">${IC.mic}</span><span class="ms-ic ms-ic--send">${IC.send}</span>`;
        decorateIcons();
    }
    function parseMessage(text) {
        const raw = String(text || "");
        const vn = raw.match(/^\[voice\](https:\/\/\S+)\s+(\d{1,4})\s*$/);
        if (vn) return { voice: JD.safeUrl(vn[1]), secs: Number(vn[2]), img: "", html: "", emoji: false, empty: false };
        const m = raw.match(/^\[img\](https:\/\/\S+)\s*([\s\S]*)$/);
        const body = m ? m[2] : raw, img = m ? JD.safeUrl(m[1]) : "";
        const emoji = !img && /^(?:\p{Extended_Pictographic}️?\s*){1,3}$/u.test(body.trim());
        let html = esc(body).replace(/\n/g, "<br>");
        html = html.replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
        return { img, html, emoji, empty: !body.trim() };
    }
    const previewOf = raw => { const t = String(raw || ""); return /^\[voice\]/.test(t) ? "🎤 Voice message" : /^\[img\]/.test(t) ? "📷 Photo" + (t.replace(/^\[img\]\S+\s*/, "") ? " · " + t.replace(/^\[img\]\S+\s*/, "") : "") : t; };
    function showToast(title, message) { window.GamBasketNotifications?.add({ type: "message", title, message, showToast: true }); }
    function formatDate(value) { const d = new Date(value), t = new Date(); if (d.toDateString() === t.toDateString()) return "Today"; t.setDate(t.getDate() - 1); if (d.toDateString() === t.toDateString()) return "Yesterday"; return d.toLocaleDateString("en-GM", { day: "numeric", month: "short", year: "numeric" }); }

    /* ---------- init ---------- */
    async function init() {
        if (!$("messagesShell")) return;
        fillStaticIcons(); bindUI(); buildPopovers();
        $("conversationList").innerHTML = '<div class="ms-skel"></div><div class="ms-skel"></div><div class="ms-skel"></div>';
        /* Direct-to-chat links (?conversation / ?product): show the chat pane at once and open it first; the list loads after. */
        const direct = /[?&](conversation|product)=/.test(location.search);
        if (direct) {
            document.body.classList.add("ms-open"); $("chatEmpty").hidden = true;
            const chat = $("chatEmpty").parentNode, w = document.createElement("div");
            w.id = "chatOpening"; w.style.cssText = "position:absolute;inset:0;display:grid;place-items:center;color:#66759a;font-weight:600;background:#fff;z-index:2";
            w.innerHTML = "<span>Opening chat…</span>"; chat.appendChild(w);
        }
        const clearOpening = () => { const w = $("chatOpening"); if (w) w.remove(); };
        await window.GamBasketAuth.ready();
        const session = await window.GamBasketAuth.getSession();
        if (!session?.user) { location.href = `login.html?redirect=${encodeURIComponent(location.href)}`; return; }
        state.user = session.user;
        if (direct) {
            try { await routeFromUrl(location.href); } finally { clearOpening(); }
            if (!state.active) { document.body.classList.remove("ms-open"); $("chatEmpty").hidden = false; }
            await loadConversations(); state.loaded = true;
        } else { await loadConversations(); state.loaded = true; await routeFromUrl(location.href); }
    }
    async function routeFromUrl(href) {
        const u = new URL(href, location.href);
        const conversationId = u.searchParams.get("conversation"), productId = u.searchParams.get("product");
        if (conversationId) { if (state.active?.id !== conversationId) await openConversation(conversationId); }
        else if (productId && window.GamBasketAuth.startConversation) await startConversation(productId);
    }

    async function loadConversations() {
        try {
            const result = await window.GamBasketAuth.getConversations();
            state.conversations = result.items || [];
            renderConversations(true);
        } catch (error) {
            console.error("[JulaDirect Conversations]", error);
            $("conversationList").innerHTML = `<div class="ms-none"><strong>Messages couldn't load</strong><span>Check your connection and try again.</span><button id="retryConversations" class="ms-btn" type="button" data-jelly>Try again</button></div>`;
            $("retryConversations")?.addEventListener("click", loadConversations);
        }
    }

    function renderConversations(animate) {
        const query = state.search.toLowerCase().trim();
        const items = state.conversations.filter(i => !query || `${i.other_user_name} ${i.product?.title || ""} ${i.last_message}`.toLowerCase().includes(query));
        const unread = state.conversations.reduce((s, i) => s + Number(i.unread_count || 0), 0);
        const badge = $("unreadTotalBadge"); badge.textContent = unread > 99 ? "99+" : unread; badge.dataset.zero = unread ? "false" : "true";
        $("conversationList").innerHTML = items.length ? items.map(i => `<button class="ms-row${state.active?.id === i.id ? " is-active" : ""}${i.unread_count ? " is-unread" : ""}" data-conversation-id="${esc(i.id)}" type="button">${avatar(i.other_user_name, i.other_user_avatar)}<span class="ms-row__main"><span class="ms-row__n"><span>${esc(i.other_user_name)}</span>${verifiedBadge(i.other_user_verified)}</span>${i.product?.title ? `<span class="ms-row__p">${esc(i.product.title)}</span>` : ""}<span class="ms-row__m">${esc(previewOf(i.last_message))}</span></span><span class="ms-row__meta"><time>${esc(time(i.last_message_at))}</time>${i.unread_count ? `<b class="ms-unread">${i.unread_count > 99 ? "99+" : i.unread_count}</b>` : ""}</span></button>`).join("")
            : `<div class="ms-none"><div class="ms-empty__logo" style="width:64px;height:64px;border-radius:22px">${IC.chat}</div><strong>${query ? "No matches" : "No conversations yet"}</strong><span>${query ? "Try another name or product." : "Tap \"Message seller\" on any product to start chatting."}</span><a class="ms-btn" style="display:grid;place-items:center" href="explore.html">Browse products</a></div>`;
        if (animate) [...$("conversationList").children].slice(0, 9).forEach((el, i) => Spring.run(el, { y: 26, sx: .94, sy: .9, o: 0 }, {}, 170, 10, i * 55));
    }

    async function startConversation(productId) {
        try {
            const result = await window.GamBasketAuth.startConversation(productId);
            const id = result?.conversation?.id || result?.id;
            if (id) { history.replaceState({}, "", `messages.html?conversation=${encodeURIComponent(id)}&product=${encodeURIComponent(productId)}`); await openConversation(id); }
        } catch (error) { console.error("[JulaDirect Start Conversation]", error); showToast("Unable to start conversation", "Please try again."); }
    }

    /* ---------- open / close chat ---------- */
    async function openConversation(id) {
        const request = ++state.openToken;
        await cleanupChannel();
        try {
            const result = await window.GamBasketAuth.getConversation(id);
            if (request !== state.openToken) return;
            state.active = result.conversation || result;
            state.messages = result.messages || [];
            state.seen = new Set(); state.peerOnline = false; state.peerTyping = false; state.firstPaint = false;
            renderActive();
            $("chatEmpty").hidden = true; $("chatActive").hidden = false;
            document.body.classList.add("ms-open");
            animateChatIn();
            window.GamBasketAuth.markConversationRead(id).catch(() => {});
            const listed = state.conversations.find(i => i.id === id); if (listed) listed.unread_count = 0;
            renderConversations();
            await subscribe(id); scrollBottom(true);
        } catch (error) { console.error("[JulaDirect Open Conversation]", error); showToast("Couldn't open conversation", "Please try again."); }
    }
    function animateChatIn() {
        const act = $("chatActive");
        if (phone()) Spring.run(act, { x: window.innerWidth * .55, sx: .94, sy: .98, o: 0 }, {}, 150, 13);
        else Spring.run(act, { y: 18, sx: .985, sy: .985, o: 0 }, {}, 200, 14);
        Spring.run($("chatProductContext"), { y: -30, sx: .9, sy: .6, o: 0 }, {}, 190, 9, 120);
    }
    async function closeChat() {
        if (state.rec) stopRecording(false); if (player) player.pause();
        state.openToken++; await cleanupChannel();
        const act = $("chatActive");
        const finish = () => { document.body.classList.remove("ms-open"); $("chatEmpty").hidden = false; act.hidden = true; state.active = null; renderConversations(); history.replaceState({}, "", "messages.html"); };
        if (phone() && !reduce && act.animate) { const a = Spring.run(act, {}, { x: window.innerWidth, sx: .94, o: 0 }, 260, 26); a.onfinish = () => { finish(); }; setTimeout(finish, 700); } else finish();
    }

    function setStatus() {
        const el = $("chatStatus"), av = $("chatAvatar");
        el.classList.toggle("is-typing", state.peerTyping);
        if (state.peerTyping) el.textContent = "typing…";
        else if (state.peerOnline) el.innerHTML = '<i></i>Online';
        else el.textContent = state.active?.other_user_verified ? "Verified seller" : "JulaDirect member";
        av.classList.toggle("is-online", state.peerOnline);
    }

    function renderActive() {
        const item = state.active || {};
        $("chatName").innerHTML = `<span>${esc(item.other_user_name || "JulaDirect Member")}</span>${verifiedBadge(item.other_user_verified)}`;
        $("chatAvatar").outerHTML = avatar(item.other_user_name, item.other_user_avatar, "", false).replace('class="ms-av', 'id="chatAvatar" class="ms-av');
        setStatus();
        const product = item.product, context = $("chatProductContext"), orderIcon = $("chatOrderIcon");
        if (product) {
            const available = product.status === "approved" && Number(product.stock || 0) > 0;
            context.hidden = false; orderIcon.hidden = !available;
            const img = JD.safeUrl(product.main_image) || JD.placeholder || "";
            context.innerHTML = `<img src="${esc(img)}" alt=""><div class="ms-prod__t"><strong>${esc(product.title)}</strong><b>${money(product.price)}</b><small class="${available ? "" : "bad"}">${available ? `${esc(product.stock)} available` : "Currently unavailable"}</small></div><a class="ms-prod__go" data-jelly href="product.html?id=${encodeURIComponent(product.id)}">View Product ${IC.chev}</a>`;
        } else { context.hidden = true; context.innerHTML = ""; orderIcon.hidden = true; }
        renderMessages();
    }

    /* ---------- messages ---------- */
    function groupInfo(list, i) {
        const m = list[i], p = list[i - 1], n = list[i + 1];
        const same = (a, b) => a && b && String(a.sender_id) === String(b.sender_id) && dateKey(a.created_at) === dateKey(b.created_at) && Math.abs(new Date(b.created_at) - new Date(a.created_at)) < 5 * 60 * 1000;
        return { first: !same(p, m), last: !same(m, n) };
    }
    function tickFor(m) { return m.failed ? '<span class="fail">Not sent</span>' : m.pending ? IC.clock : m.is_read ? IC.ticks : IC.tick; }
    function renderMessages() {
        const flow = $("msFlow"), list = state.messages;
        if (!list.length) { flow.innerHTML = `<div class="ms-start"><div class="ms-empty__logo">${IC.chat}</div><strong>Say hello</strong><span>Ask about availability, delivery, pickup or the price.</span><div class="ms-quick">${QUICK.map(q => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div></div>`; Spring.run(flow.firstChild, { y: 20, sx: .8, sy: .8, o: 0 }, {}, 160, 8); [...flow.querySelectorAll(".ms-quick button")].forEach((b, i) => Spring.run(b, { y: 24, sx: .7, sy: .7, o: 0 }, {}, 220, 10, 120 + i * 60)); return; }
        const meName = state.user?.user_metadata?.first_name || "";
        let last = "", html = "";
        list.forEach((m, i) => {
            const key = dateKey(m.created_at);
            if (key !== last) html += `<div class="ms-day">${formatDate(m.created_at)}</div>`;
            last = key;
            const out = String(m.sender_id) === String(state.user.id), g = groupInfo(list, i), pm = parseMessage(m.content || m.message_text);
            const bubble = `<div class="ms-b${pm.img ? " has-img" : ""}${pm.emoji ? " emoji-only" : ""}">${pm.img ? `<img src="${esc(pm.img)}" alt="Shared photo" loading="lazy">` : ""}${pm.html}</div>`;
            const meta = g.last ? `<div class="ms-t"><time>${esc(time(m.created_at))}</time>${out ? tickFor(m) : ""}</div>` : "";
            const side = out ? (g.last ? `<span class="ms-av ms-av--me">${IC.user}</span>` : '<span class="ms-sp"></span>') : (g.last ? avatar(state.active?.other_user_name, state.active?.other_user_avatar) : '<span class="ms-sp"></span>');
            html += `<div class="ms-m ${out ? "out" : "in"}${g.first ? " is-first" : ""}${g.last ? " is-last" : ""}" data-id="${esc(m.id)}">${out ? `<div class="ms-m__col">${bubble}${meta}</div>${side}` : `${side}<div class="ms-m__col">${bubble}${meta}</div>`}</div>`;
        });
        if (state.peerTyping) html += `<div class="ms-m in is-first is-last" data-typing><span class="ms-sp"></span><div class="ms-m__col"><div class="ms-b ms-typing"><i></i><i></i><i></i></div></div></div>`;
        flow.innerHTML = html;
        /* spring in only the bubbles that are new on screen */
        flow.querySelectorAll(".ms-m").forEach(row => {
            const id = row.getAttribute("data-id") || "typing";
            if (state.seen.has(id)) return; state.seen.add(id);
            if (!state.firstPaint) return;
            const b = row.querySelector(".ms-b"), out = row.classList.contains("out");
            Spring.run(b, { x: out ? 40 : -40, y: 26, sx: .45, sy: .35, o: 0 }, {}, 230, 9.5);
            const t = row.querySelector(".ms-t"); if (t) Spring.run(t, { y: -8, o: 0 }, {}, 200, 14, 90);
        });
        state.firstPaint = true;
        if (typeof renderMessages.afterFirst === "function") { renderMessages.afterFirst(); renderMessages.afterFirst = null; }
        restorePlayback();
    }
    state.firstPaint = false;

    function nearBottom() { const a = $("messagesArea"); return a.scrollHeight - a.scrollTop - a.clientHeight < 140; }
    function scrollBottom(instant) {
        requestAnimationFrame(() => {
            const a = $("messagesArea"); if (!a) return;
            if (instant || reduce) a.scrollTop = a.scrollHeight; else a.scrollTo({ top: a.scrollHeight, behavior: "smooth" });
            hidePill();
        });
    }
    function showPill(n) { const p = $("newMessagesPill"); p.textContent = n > 1 ? `${n} new messages ↓` : "New message ↓"; p.classList.add("show"); p.style.transform = ""; Spring.run(p, { y: 30, sx: .4, sy: .4 }, { y: 0 }, 260, 9); p.style.transform = "translateX(-50%) scale(1)"; }
    function hidePill() { const p = $("newMessagesPill"); p.classList.remove("show"); p.style.transform = "translateX(-50%) scale(0)"; state.unseen = 0; }

    async function sendMessage(preset) {
        const input = $("messageInput"), content = String(preset != null ? preset : input.value).trim();
        if (!content || !state.active) return;
        const tmp = { id: "tmp-" + Date.now(), sender_id: state.user.id, content, created_at: new Date().toISOString(), is_read: false, pending: true };
        state.messages.push(tmp); input.value = ""; input.style.height = "auto"; autosizeState();
        renderMessages(); scrollBottom();
        Spring.run($("sendMessageBtn"), { sx: .7, sy: .7, r: -18 }, {}, 300, 8);
        try {
            await window.GamBasketAuth.sendMessage(state.active.id, content);
            const result = await window.GamBasketAuth.getConversationMessages(state.active.id);
            const real = result.messages || [];
            state.messages = real; state.seen.add("sync");
            real.forEach(m => { /* the optimistic bubble already animated: do not animate its confirmed twin */ if (!state.seen.has(m.id) && String(m.sender_id) === String(state.user.id) && Math.abs(new Date(m.created_at) - new Date(tmp.created_at)) < 15000) state.seen.add(m.id); });
            renderMessages();
            const listed = state.conversations.find(i => i.id === state.active.id); if (listed) { listed.last_message = content; listed.last_message_at = new Date().toISOString(); state.conversations.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at)); renderConversations(); }
        } catch (error) {
            console.error("[JulaDirect Send Message]", error);
            tmp.pending = false; tmp.failed = true; renderMessages();
            state.messages = state.messages.filter(m => m !== tmp); setTimeout(() => { renderMessages(); }, 1600);
            if (preset == null) { input.value = content; autosizeState(); }
            showToast("Message not sent", "Please try again.");
        } finally { input.focus({ preventScroll: true }); }
    }

    /* ---------- realtime: messages + presence + typing ---------- */
    async function removeChannel(channel) {
        if (!channel) return;
        const client = window.GamBasketAuth.getClient?.();
        try { if (client?.removeChannel) await client.removeChannel(channel); else if (channel.unsubscribe) await channel.unsubscribe(); } catch (e) { console.warn("[JulaDirect Realtime Cleanup]", e); }
    }
    async function subscribe(id) {
        const request = ++state.subscriptionToken;
        const previous = state.channel, prevLive = state.live; state.channel = null; state.live = null;
        await removeChannel(previous); await removeChannel(prevLive);
        if (request !== state.subscriptionToken || String(state.active?.id) !== String(id)) return;

        const channel = window.GamBasketAuth.subscribeToConversation?.(id, async message => {
            if (request !== state.subscriptionToken || String(state.active?.id) !== String(id) || String(message.sender_id) === String(state.user.id)) return;
            const stick = nearBottom();
            state.peerTyping = false; setStatus();
            state.messages.push(message); renderMessages();
            window.GamBasketAuth.markConversationRead(id).catch(() => {});
            if (stick) scrollBottom(); else { state.unseen = (state.unseen || 0) + 1; showPill(state.unseen); }
            const listed = state.conversations.find(i => i.id === id); if (listed) { listed.last_message = message.content || message.message_text; listed.last_message_at = message.created_at; renderConversations(); }
        }, () => { if (request === state.subscriptionToken) { $("realtimeError").classList.add("show"); } });
        if (request !== state.subscriptionToken) { await removeChannel(channel); return; }
        state.channel = channel || null; $("realtimeError").classList.remove("show");

        /* presence and typing share a second, lightweight channel */
        try {
            const client = window.GamBasketAuth.getClient?.();
            if (client?.channel) {
                const live = client.channel(`jd-chat-${id}`, { config: { presence: { key: String(state.user.id) } } });
                live.on("presence", { event: "sync" }, () => {
                    if (request !== state.subscriptionToken) return;
                    const st = live.presenceState?.() || {}; const on = Object.keys(st).some(k => k !== String(state.user.id));
                    if (on !== state.peerOnline) { state.peerOnline = on; setStatus(); const av = $("chatAvatar"); if (on) Spring.run(av.querySelector(".ms-dot"), { sx: 0, sy: 0 }, {}, 260, 8); }
                });
                live.on("broadcast", { event: "typing" }, ({ payload }) => {
                    if (request !== state.subscriptionToken || String(payload?.user) === String(state.user.id)) return;
                    const stick = nearBottom(); state.peerTyping = true; setStatus(); renderMessages(); if (stick) scrollBottom();
                    clearTimeout(state.typingTimer); state.typingTimer = setTimeout(() => { state.peerTyping = false; setStatus(); renderMessages(); }, 3200);
                });
                live.subscribe(async status => { if (status === "SUBSCRIBED" && request === state.subscriptionToken) { try { await live.track({ at: Date.now() }); } catch (e) { /* presence is optional */ } } });
                state.live = live;
            }
        } catch (e) { console.warn("[JulaDirect Presence]", e); }
    }
    async function cleanupChannel() {
        state.subscriptionToken++;
        const c = state.channel, l = state.live; state.channel = null; state.live = null;
        clearTimeout(state.typingTimer); state.peerTyping = false; state.peerOnline = false;
        await removeChannel(c); await removeChannel(l);
    }
    function sendTyping() {
        const now = Date.now(); if (!state.live || now - state.lastTypingSent < 1800) return; state.lastTypingSent = now;
        try { state.live.send({ type: "broadcast", event: "typing", payload: { user: String(state.user.id) } }); } catch (e) { /* optional */ }
    }

    /* ---------- voice notes, photos, mic <-> send morph ---------- */
    state.media = []; state.rec = null;
    const MAX_MEDIA = 6, MAX_VOICE = 120;
    const modeOf = () => ($("messageInput").value.trim() || state.media.length) ? "send" : "mic";
    function syncMode() {
        const b = $("sendMessageBtn"), m = state.rec ? "send" : modeOf();
        if (b.dataset.mode !== m) { b.dataset.mode = m; b.setAttribute("aria-label", m === "send" ? "Send" : "Record voice message"); if (!reduce) Spring.run(b, { sx: .72, sy: .72, r: m === "send" ? -25 : 25 }, {}, 330, 8); }
    }
    const fmtSecs = n => Math.floor(n / 60) + ":" + String(Math.floor(n % 60)).padStart(2, "0");

    function addMedia(files) {
        const okT = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        files.forEach(f => {
            if (state.media.length >= MAX_MEDIA) return showToast("Limit reached", `You can send up to ${MAX_MEDIA} photos at once.`);
            if (!okT.includes(String(f.type).toLowerCase())) return showToast("Not supported", "Please choose a JPG, PNG, WEBP or GIF photo.");
            if (f.size > 8 * 1024 * 1024) return showToast("Photo too large", "Please choose a photo under 8MB.");
            state.media.push({ file: f, url: URL.createObjectURL(f) });
        });
        renderTray(true);
    }
    function removeMedia(i) { const m = state.media[i]; if (!m) return; URL.revokeObjectURL(m.url); state.media.splice(i, 1); renderTray(); }
    function renderTray(animate) {
        const t = $("msTray"); t.hidden = !state.media.length;
        t.innerHTML = state.media.map((m, i) => `<div class="ms-tray__i"><img src="${esc(m.url)}" alt="Photo ${i + 1}"><button type="button" class="ms-tray__x" data-rm="${i}" aria-label="Remove photo">${IC.close}</button></div>`).join("") + (state.media.length < MAX_MEDIA ? `<button type="button" class="ms-tray__add" data-add aria-label="Add another photo">${IC.plus}</button>` : "");
        if (animate && !reduce) { const last = t.querySelectorAll(".ms-tray__i"); Spring.run(last[last.length - 1], { sx: .3, sy: .3, o: 0, y: 20 }, {}, 240, 9); }
        syncMode();
        const a = $("messagesArea"); if (a && nearBottom()) scrollBottom(true);
    }

    async function sendComposer() {
        const input = $("messageInput"), caption = input.value.trim(), items = state.media.splice(0);
        if (!items.length) return sendMessage();
        input.value = ""; input.style.height = "auto"; renderTray(); autosizeState();
        for (let i = 0; i < items.length; i++) await sendRich("img", items[i].file, i === 0 ? caption : "", 0, items[i].url);
    }
    async function sendRich(kind, blob, caption, secs, localUrl) {
        if (!state.active) return;
        const convId = state.active.id;
        const tmp = { id: "tmp-" + Date.now() + Math.random().toString(36).slice(2, 5), sender_id: state.user.id, content: kind === "img" ? caption : "", created_at: new Date().toISOString(), is_read: false, pending: true };
        if (kind === "img") tmp.localImg = localUrl; else { tmp.localVoice = localUrl; tmp.localSecs = secs; }
        state.messages.push(tmp); renderMessages(); scrollBottom();
        try {
            const url = await window.GamBasketAuth.uploadChatMedia(blob, kind === "img" ? "image" : "voice");
            const content = kind === "img" ? `[img]${url}${caption ? " " + caption : ""}` : `[voice]${url} ${Math.max(1, Math.round(secs))}`;
            await window.GamBasketAuth.sendMessage(convId, content);
            if (state.active?.id !== convId) return;
            const real = (await window.GamBasketAuth.getConversationMessages(convId)).messages || [];
            state.messages = real; state.seen.add("sync");
            real.forEach(m => { if (!state.seen.has(m.id) && String(m.sender_id) === String(state.user.id) && Math.abs(new Date(m.created_at) - new Date(tmp.created_at)) < 20000) state.seen.add(m.id); });
            renderMessages();
            const listed = state.conversations.find(i => i.id === convId); if (listed) { listed.last_message = content; listed.last_message_at = new Date().toISOString(); state.conversations.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at)); renderConversations(); }
        } catch (error) {
            console.error("[JulaDirect Send Media]", error);
            state.messages = state.messages.filter(m => m !== tmp); renderMessages();
            showToast(kind === "img" ? "Photo not sent" : "Voice note not sent", error?.message || "Please try again.");
        }
    }

    /* ----- recording ----- */
    function pickMime() { const c = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]; return (window.MediaRecorder && c.find(t => MediaRecorder.isTypeSupported(t))) || ""; }
    async function startRecording() {
        if (!state.active) return;
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return showToast("Voice not supported", "Your browser can't record voice notes.");
        let stream;
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return showToast("Microphone blocked", "Allow microphone access to send voice notes."); }
        const mime = pickMime(), rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [];
        const r = state.rec = { rec, stream, chunks, t0: Date.now(), send: false, raf: 0, timer: 0, ctx: null };
        rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = () => {
            stream.getTracks().forEach(t => t.stop()); cancelAnimationFrame(r.raf); clearInterval(r.timer); try { r.ctx && r.ctx.close(); } catch (e) {}
            const secs = (Date.now() - r.t0) / 1000;
            if (state.rec === r) state.rec = null;
            setRecUI(false);
            if (!r.send) return;
            if (secs < 1) return showToast("Too short", "Hold on a little longer to record.");
            const type = (rec.mimeType || mime || "audio/webm").split(";")[0], blob = new Blob(chunks, { type });
            sendRich("voice", blob, "", secs, URL.createObjectURL(blob));
        };
        try { const AC = window.AudioContext || window.webkitAudioContext, ctx = r.ctx = new AC(), an = ctx.createAnalyser(); an.fftSize = 64; ctx.createMediaStreamSource(stream).connect(an); r.an = an; r.data = new Uint8Array(an.frequencyBinCount); } catch (e) {}
        rec.start(250);
        setRecUI(true);
        const bars = [...$("msRecBars").children];
        const tick = () => { if (state.rec !== r) return; if (r.an) { r.an.getByteFrequencyData(r.data); bars.forEach((b, i) => { const v = r.data[Math.min(r.data.length - 1, 1 + i)] / 255; b.style.transform = `scaleY(${(.18 + v * .95).toFixed(2)})`; }); } r.raf = requestAnimationFrame(tick); };
        tick();
        r.timer = setInterval(() => { const s = (Date.now() - r.t0) / 1000; $("msRecTime").textContent = fmtSecs(s); if (s >= MAX_VOICE) stopRecording(true); }, 250);
    }
    function stopRecording(send) { const r = state.rec; if (!r) return; r.send = !!send; try { r.rec.state !== "inactive" && r.rec.stop(); } catch (e) { setRecUI(false); state.rec = null; } }
    function setRecUI(on) {
        const f = $("messageComposer"); f.classList.toggle("is-rec", on);
        $("msRec").hidden = !on; $("msField").hidden = on; $("msAttach").hidden = on;
        if (on) { const w = $("msRecBars"); if (!w.children.length) w.innerHTML = "<i></i>".repeat(22); $("msRecTime").textContent = "0:00"; if (!reduce) Spring.run($("msRec"), { sx: .6, sy: .8, o: 0 }, {}, 240, 11); }
        syncMode();
        if (!on) $("sendMessageBtn").dataset.mode = modeOf();
    }

    /* ----- playback ----- */
    const WAVE = 30;
    function waveBars(seed) { let h = 7, out = ""; for (let i = 0; i < WAVE; i++) { h = (h * 31 + seed.charCodeAt(i % seed.length) + i * 17) % 97; out += `<i style="height:${28 + (h % 72)}%"></i>`; } return out; }
    function voiceBubble(src, secs, pending) { return `<div class="ms-b ms-vn${pending ? " is-up" : ""}" data-src="${esc(src)}" data-secs="${secs || 0}"><button class="ms-vn__p" type="button" aria-label="Play voice message">${IC.play}</button><span class="ms-vn__w">${waveBars(String(secs) + src.slice(-12))}</span><time class="ms-vn__d">${fmtSecs(secs || 0)}</time></div>`; }
    let player = null;
    function paintPlay(el, frac, playing) {
        if (!el) return; const bars = [...el.querySelectorAll(".ms-vn__w i")], n = Math.round(frac * bars.length);
        bars.forEach((b, i) => b.classList.toggle("on", i < n));
        el.querySelector(".ms-vn__p").innerHTML = playing ? IC.pause : IC.play; el.classList.toggle("is-playing", playing);
    }
    function togglePlay(el) {
        if (!el) return; const src = el.dataset.src;
        if (player && player.src === src) { if (player.paused) player.play(); else player.pause(); return; }
        if (player) { player.pause(); }
        const a = player = new Audio(src); a.preload = "auto";
        const cur = () => document.querySelector(`.ms-vn[data-src="${CSS.escape(src)}"]`);
        a.addEventListener("timeupdate", () => { const d = isFinite(a.duration) && a.duration ? a.duration : Number(el.dataset.secs) || 1; paintPlay(cur(), a.currentTime / d, !a.paused); const t = cur()?.querySelector(".ms-vn__d"); if (t) t.textContent = fmtSecs(a.currentTime); });
        a.addEventListener("play", () => paintPlay(cur(), a.currentTime / (a.duration || Number(el.dataset.secs) || 1), true));
        a.addEventListener("pause", () => paintPlay(cur(), a.currentTime / (a.duration || Number(el.dataset.secs) || 1), false));
        a.addEventListener("ended", () => { const c = cur(); paintPlay(c, 0, false); const t = c?.querySelector(".ms-vn__d"); if (t) t.textContent = fmtSecs(Number(c.dataset.secs) || 0); player = null; });
        a.play().catch(() => showToast("Can't play", "This voice note could not be played."));
    }
    function restorePlayback() { if (!player) return; const el = document.querySelector(`.ms-vn[data-src="${CSS.escape(player.src)}"]`); if (el) paintPlay(el, player.currentTime / (player.duration || Number(el.dataset.secs) || 1), !player.paused); }

    /* ---------- popovers ---------- */
    const QUICK = ["Is this still available?", "Is the price final?", "Can you deliver to my area?", "Can you send a real photo?", "Can I pick it up today?"];
    const EMOJI = ["😀", "😂", "😍", "🙏", "👍", "🔥", "🎉", "❤️", "😊", "🤝", "👋", "✅", "😅", "🤔", "😢", "🙌", "💯", "📦", "🚚", "💰", "⭐", "😎", "🥳", "👏"];
    function buildPopovers() {
        $("msQuick").innerHTML = `<h3>Send a photo</h3><button type="button" data-attach="photo">${IC.photo}Photo library</button><button type="button" data-attach="camera">${IC.camera}Take a photo</button>`;
        $("msEmoji").innerHTML = EMOJI.map(e => `<button type="button" data-e="${e}" aria-label="${e}">${e}</button>`).join("");
    }
    function menuHtml() {
        const p = state.active?.product, ok = p && p.status === "approved" && Number(p.stock || 0) > 0;
        return `${p ? `<a href="product.html?id=${encodeURIComponent(p.id)}" role="menuitem">${IC.bag}View product</a>` : ""}${ok ? `<button type="button" data-act="order" role="menuitem">${IC.bag}Order now</button>` : ""}<button type="button" data-act="copy" role="menuitem">${IC.link}Copy chat link</button>`;
    }
    const pops = ["msMenu", "msQuick", "msEmoji"];
    function togglePop(id, btn) {
        const el = $(id), opening = el.hidden;
        closePops(opening ? id : null);
        if (!opening) return;
        if (id === "msMenu") el.innerHTML = menuHtml();
        el.hidden = false; if (btn) btn.setAttribute("aria-expanded", "true");
        const origin = id === "msMenu" ? { x: 20, y: -20 } : id === "msQuick" ? { x: -20, y: 20 } : { x: 20, y: 20 };
        Spring.run(el, { x: origin.x, y: origin.y, sx: .3, sy: .3, o: 0 }, {}, 260, 11);
        [...el.children].forEach((c, i) => Spring.run(c, { y: 10, sx: .85, sy: .85, o: 0 }, {}, 240, 10, 60 + i * 28));
    }
    function closePops(except) { pops.forEach(id => { if (id !== except) $(id).hidden = true; }); ["chatMore", "msAttach", "msEmojiBtn"].forEach(b => $(b).setAttribute("aria-expanded", "false")); }

    async function orderNow() {
        const product = state.active?.product; if (!product) return;
        try {
            const result = await window.GamBasketAuth.addToCart(product.id, 1);
            if (result.success) { if (JD.go) JD.go("cart.html?continue=checkout"); else location.href = "cart.html?continue=checkout"; }
            else showToast("Unable to order", "This product is no longer available.");
        } catch (error) { console.error("[JulaDirect Chat Order]", error); showToast("Unable to order", "Please try again."); }
    }

    /* ---------- UI ---------- */
    function autosizeState() { const i = $("messageInput"); i.style.height = "auto"; i.style.height = "52px"; i.style.height = `${Math.min(Math.max(i.scrollHeight, 52), 100)}px`; syncMode(); }
    function bindUI() {
        bindJelly(document);
        $("conversationSearch").addEventListener("input", e => { state.search = e.target.value; renderConversations(); });
        $("conversationList").addEventListener("click", e => { const row = e.target.closest("[data-conversation-id]"); if (!row) return; Spring.pop(row, .06, 320, 9); openConversation(row.dataset.conversationId); });
        $("messageComposer").addEventListener("submit", e => { e.preventDefault(); if (state.rec) stopRecording(true); else if (modeOf() === "mic") startRecording(); else sendComposer(); });
        const input = $("messageInput");
        input.addEventListener("input", () => { autosizeState(); sendTyping(); });
        input.addEventListener("focus", () => { setTimeout(() => scrollBottom(true), 280); });
        input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !phone()) { e.preventDefault(); sendMessage(); } });
        $("mobileChatBack").addEventListener("click", closeChat);
        $("reconnectBtn").addEventListener("click", () => state.active && subscribe(state.active.id));
        $("chatMore").addEventListener("click", e => { e.stopPropagation(); togglePop("msMenu", $("chatMore")); });
        $("msAttach").addEventListener("click", e => { e.stopPropagation(); togglePop("msQuick", $("msAttach")); });
        $("msEmojiBtn").addEventListener("click", e => { e.stopPropagation(); togglePop("msEmoji", $("msEmojiBtn")); });
        $("chatOrderIcon").addEventListener("click", orderNow);
        $("msQuick").addEventListener("click", e => { const b = e.target.closest("[data-attach]"); if (!b) return; closePops(); $(b.dataset.attach === "camera" ? "msFileCamera" : "msFilePhoto").click(); });
        $("msFlow").addEventListener("click", e => { const q = e.target.closest("[data-q]"); if (q) { Spring.pop(q, .08, 300, 9); sendMessage(q.getAttribute("data-q")); return; } const pb = e.target.closest(".ms-vn__p"); if (pb) togglePlay(pb.closest(".ms-vn")); });
        ["msFilePhoto", "msFileCamera"].forEach(id => $(id).addEventListener("change", e => { addMedia([...e.target.files]); e.target.value = ""; }));
        $("msTray").addEventListener("click", e => { const x = e.target.closest("[data-rm]"); if (x) removeMedia(Number(x.dataset.rm)); else if (e.target.closest("[data-add]")) $("msFilePhoto").click(); });
        input.addEventListener("paste", e => { const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith("image/")); if (files.length) { e.preventDefault(); addMedia(files); } });
        $("msRecCancel").addEventListener("click", () => stopRecording(false));
        $("msEmoji").addEventListener("click", e => { const b = e.target.closest("[data-e]"); if (!b) return; const s = input.selectionStart ?? input.value.length; input.value = input.value.slice(0, s) + b.dataset.e + input.value.slice(input.selectionEnd ?? s); autosizeState(); input.focus({ preventScroll: true }); Spring.pop(b, .3, 400, 8); });
        $("msMenu").addEventListener("click", e => {
            const b = e.target.closest("[data-act]"); if (!b) return; closePops();
            if (b.dataset.act === "order") orderNow();
            else if (b.dataset.act === "copy") { const url = location.origin + location.pathname.replace(/[^/]*$/, "") + `messages.html?conversation=${encodeURIComponent(state.active.id)}`; (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => showToast("Link copied", "Only you and the other person can open this chat."), () => showToast("Couldn't copy", url)); }
        });
        $("newMessagesPill").addEventListener("click", () => scrollBottom());
        document.addEventListener("click", e => { if (!e.target.closest(".ms-pop")) closePops(); });
        document.addEventListener("keydown", e => { if (e.key === "Escape") closePops(); });
        $("messagesArea").addEventListener("scroll", () => {
            const a = $("messagesArea"), dy = a.scrollTop - (a.__last || 0); a.__last = a.scrollTop;
            if (!reduce && Math.abs(dy) > 1) Rubber.kick(Math.max(-14, Math.min(14, dy * 0.12)));
            if (nearBottom()) hidePill();
        }, { passive: true });
        /* jelly poke: tapping any bubble squashes it */
        $("msFlow").addEventListener("pointerdown", e => { const b = e.target.closest(".ms-b"); if (b && !e.target.closest("a")) Spring.run(b, { sx: .93, sy: .88 }, {}, 380, 7); });
        autosizeState();
        window.addEventListener("beforeunload", () => { cleanupChannel(); });
    }

    window.addEventListener("jd:pane:hide", event => { if (event.detail?.route !== "messages") return; state.openToken++; cleanupChannel(); document.body.classList.remove("ms-open"); });
    window.addEventListener("jd:pane:show", async event => {
        if (event.detail?.route !== "messages") return;
        if (!state.loaded) return;
        await loadConversations();
        await routeFromUrl(event.detail.url || location.href);
        if (state.active && !state.channel) { document.body.classList.toggle("ms-open", !$("chatActive").hidden); subscribe(state.active.id); }
    });

    const embedded = /[?&]embed=1\b/.test(location.search);
    if (embedded) {
        document.body.classList.add("ms-embed");
        const base = document.createElement("base"); base.target = "_top"; document.head.appendChild(base);
    } else if (JD && JD.mountShell) JD.mountShell({ active: "account" });
    init();
})();
