/* JulaDirect checkout. A guided, three-part flow (delivery, online payment, review).
   Payment intents are created by ModemPay; order totals and stock are re-verified server side. */
(() => {
    "use strict";

    const state = { cart: [], coupon: null, deliveryFee: 0, submitting: false, open: 1, done: { 1: false, 2: false }, pickupStations: [] };
    const $ = id => document.getElementById(id);
    const JD = window.JD;
    const money = value => `D ${Number(value || 0).toLocaleString("en-GM")}`;
    const productFor = item => item.product || item.products || item;
    const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
    const ADDRESS_KEY = "jd-ck-addr";
    const PAY_LABEL = { wave: "Wave", qmoney: "QMoney", afrimoney: "Afrimoney" };
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const isDelivery = () => document.querySelector('input[name="fulfillment"]:checked')?.value === "delivery";
    const isPickupStation = () => document.querySelector('input[name="fulfillment"]:checked')?.value === "pickup_station";
    const canDeliverCart = () => state.cart.length > 0;
    const canUsePickupStation = () => state.pickupStations.length > 0;

    function applyFulfillmentAvailability() {
        const canDeliver = canDeliverCart();
        const canPickupStation = canUsePickupStation();
        const deliveryChoice = $("deliveryChoice");
        const stationChoice = $("pickupStationChoice");
        const delivery = $("delivery");
        const station = $("pickup");

        if (deliveryChoice) deliveryChoice.hidden = !canDeliver;
        if (stationChoice) stationChoice.hidden = !canPickupStation;
        if (delivery) delivery.disabled = !canDeliver;
        if (station) station.disabled = !canPickupStation;

        const selected = document.querySelector('input[name="fulfillment"]:checked');
        const selectionInvalid = !selected ||
            !["delivery", "pickup_station"].includes(selected.value) ||
            (selected.value === "delivery" && !canDeliver) ||
            (selected.value === "pickup_station" && !canPickupStation);
        if (selectionInvalid) {
            if (canDeliver && delivery) delivery.checked = true;
            else if (canPickupStation && station) station.checked = true;
            else {
                if (delivery) delivery.checked = false;
                if (station) station.checked = false;
            }
        }

        const note = $("fulfillmentAvailabilityNote");
        if (note) {
            if (!canDeliver && canPickupStation) {
                note.textContent = "Delivery is unavailable for one or more items in your cart. Please choose an available pickup station.";
                note.hidden = false;
            } else if (!canDeliver && !canPickupStation) {
                note.textContent = "Neither delivery nor a pickup station is currently available for this cart. Please remove these items or contact support.";
                note.hidden = false;
            } else {
                note.hidden = true;
                note.textContent = "";
            }
        }
    }
    const selectedPayment = () => document.querySelector('input[name="payment"]:checked');

    // Match the six service areas linked from the homepage "Shop near you" section.
    const DELIVERY_AREAS = Object.freeze({
        "Greater Banjul Area": ["Banjul", "Serrekunda", "Bakau", "Kololi", "Fajara"],
        "West Coast Region": ["Brikama"]
    });

    function normalizeDeliveryRegion(value) {
        const region = String(value || "").trim().toLowerCase();
        if (["greater banjul area", "greater banjul", "banjul", "kanifing"].includes(region)) {
            return "Greater Banjul Area";
        }
        if (["west coast region", "west coast", "western region"].includes(region)) {
            return "West Coast Region";
        }
        return "";
    }

    function populateDeliveryAreas(preferredArea = "") {
        const region = $("region")?.value || "";
        const areaSelect = $("area");
        if (!areaSelect) return;

        const areas = DELIVERY_AREAS[region] || [];
        areaSelect.innerHTML = '<option value="">' +
            (region ? "Select area / town" : "Select region first") +
            '</option>' +
            areas.map(area => '<option value="' + escapeHTML(area) + '">' +
                escapeHTML(area) + '</option>').join("");
        areaSelect.disabled = areas.length === 0;
        if (areas.includes(preferredArea)) areaSelect.value = preferredArea;
    }

    /* ---------- cart helpers ---------- */
    async function migrateGuestCart() {
        let guestItems = [];
        try { guestItems = JSON.parse(localStorage.getItem("gambasket_cart") || "[]"); } catch { return; }
        if (!guestItems.length) return;
        const remaining = [];
        for (const item of guestItems) {
            const productId = await window.GamBasketAuth.resolveProductId(item.id, item.name);
            if (!productId) {
                remaining.push(item);
                continue;
            }
            const result = await window.GamBasketAuth.addToCart(productId, Number(item.quantity || 1));
            if (!result.success) remaining.push(item);
        }
        if (remaining.length) localStorage.setItem("gambasket_cart", JSON.stringify(remaining));
        else localStorage.removeItem("gambasket_cart");
    }

    const stockOf = p => (p && p.stock !== undefined && p.stock !== null ? Number(p.stock) : null);
    const unavailable = item => { const p = productFor(item); const st = stockOf(p); return (p.status && p.status !== "approved") || (st !== null && st < 1); };
    const overStock = item => { const st = stockOf(productFor(item)); return st !== null && Number(item.quantity || 1) > st; };
    const blocked = () => state.cart.some(item => unavailable(item) || overStock(item));

    function subtotal() { return state.cart.reduce((sum, item) => { const p = productFor(item); return sum + Number(p.price || 0) * Number(item.quantity || 1); }, 0); }
    function discount() { return Number(state.coupon?.discount_amount || 0); }
    function total() { return Math.max(0, subtotal() + state.deliveryFee - discount()); }

    /* ---------- payment configuration ---------- */
    async function loadModemPayConfig() {
        const note = $("paymentAvailabilityNote");
        const client = window.GamBasketAuth?.getClient?.() || window.supabaseClient;
        if (!client?.functions) {
            if (note) note.textContent = "Secure online payment is temporarily unavailable. Please try again later.";
            return;
        }
        try {
            const { data, error } = await client.functions.invoke("gambasket-modempay-config", { method: "GET" });
            if (error || !data?.checkout_enabled) {
                if (note) note.textContent = "Secure online payment is temporarily unavailable. Please try again later.";
                return;
            }
            const available = new Set(
                Array.isArray(data.payment_methods)
                    ? data.payment_methods.filter(method => ["wave", "qmoney", "afrimoney"].includes(method))
                    : []
            );
            ["wave", "qmoney", "afrimoney"].forEach(method => {
                const input = $(method);
                const enabled = available.has(method);
                if (input) input.disabled = !enabled;
                const label = document.querySelector('label[for="' + method + '"]');
                const badge = label?.querySelector(".payment-coming-soon-badge, .payment-availability-badge");
                if (badge && enabled) {
                    badge.className = "payment-availability-badge";
                    badge.textContent = "Secure online";
                }
                const hint = $(method + "ComingSoon");
                if (hint) hint.textContent = enabled
                    ? `Select the same ${PAY_LABEL[method] || method} wallet again on ModemPay and enter its registered number.`
                    : "This payment method is temporarily unavailable.";
            });
            if (note) {
                note.textContent = available.size
                    ? "On ModemPay, select the same wallet you chose here and enter its registered number. Your JulaDirect contact number is not used for payment."
                    : "No online payment methods are available right now. Please try again later.";
            }
        } catch (error) {
            if (note) note.textContent = "Secure online payment is temporarily unavailable. Please try again later.";
            console.warn("[JulaDirect ModemPay] configuration could not be loaded:", error);
        }
    }

    function selectedPickupStation() {
        const id = $("pickupStationSelect")?.value || "";
        return state.pickupStations.find(station => String(station.id) === id) || null;
    }

    function renderPickupStationsForArea() {
        const areaSelect = $("pickupStationArea");
        const stationSelect = $("pickupStationSelect");
        const details = $("pickupStationDetails");
        if (!areaSelect || !stationSelect) return;

        const [region, area] = String(areaSelect.value || "").split("|||");
        const matches = state.pickupStations.filter(station =>
            station.region === region && station.area === area
        );

        stationSelect.innerHTML = '<option value="">Choose a pickup station</option>' +
            matches.map(station => '<option value="' + escapeHTML(station.id) + '">' +
                escapeHTML(station.station_name) + '</option>').join("");
        stationSelect.disabled = matches.length === 0;
        if (details) {
            details.textContent = matches.length
                ? "Select a station to view its collection location."
                : "No active pickup stations are listed for this area.";
        }
        syncPlaceOrderAvailability();
    }

    function renderPickupStationDetails() {
        const station = selectedPickupStation();
        const details = $("pickupStationDetails");
        if (!details) return;
        if (!station) {
            details.textContent = "Choose a station to view its collection location.";
            return;
        }
        details.textContent = [station.address, station.region].filter(Boolean).join(" · ");
        fillSummaries();
        syncPlaceOrderAvailability();
    }

    async function loadPickupStationConfig() {
        const input = $("pickup");
        const badge = $("pickupStationAvailability");
        const areaSelect = $("pickupStationArea");
        const stationSelect = $("pickupStationSelect");
        if (!input || !areaSelect || !stationSelect) return;
        input.disabled = true;
        areaSelect.disabled = true;
        stationSelect.disabled = true;

        try {
            const client = window.GamBasketAuth?.getClient?.() || window.supabaseClient;
            if (!client) throw new Error("Pickup station configuration is unavailable.");
            const { data, error } = await client.rpc("gambasket_get_pickup_station_config");
            if (error) throw error;

            const stations = Array.isArray(data?.stations) ? data.stations.filter(station =>
                station?.id && station?.station_name && station?.region && station?.area && station?.is_active !== false
            ) : [];
            state.pickupStations = stations;
            const areaKeys = [...new Set(stations.map(station => station.region + "|||" + station.area))];

            areaSelect.innerHTML = '<option value="">Choose an area</option>' +
                areaKeys.map(key => {
                    const [region, area] = key.split("|||");
                    return '<option value="' + escapeHTML(key) + '">' +
                        escapeHTML(area) + ' — ' + escapeHTML(region) + '</option>';
                }).join("");

            const available = data?.available === true && stations.length > 0;
            input.disabled = !available;
            areaSelect.disabled = !available;
            if (badge) {
                badge.textContent = available
                    ? stations.length + (stations.length === 1 ? " station" : " stations")
                    : "Temporarily unavailable";
                badge.className = available ? "payment-availability-badge" : "payment-coming-soon-badge";
            }
            stationSelect.innerHTML = '<option value="">Choose an area first</option>';
            if (!available) $("pickupStationDetails").textContent = "No pickup stations are currently available.";
        } catch (error) {
            input.disabled = true;
            areaSelect.disabled = true;
            stationSelect.disabled = true;
            if (badge) {
                badge.textContent = "Temporarily unavailable";
                badge.className = "payment-coming-soon-badge";
            }
            console.warn("[JulaDirect Pickup Station] configuration is not available:", error);
        }
    }

    /* ---------- init ---------- */
    async function init() {
        decorate();
        $("backButton").innerHTML = JD.icon("chevronRight", 22);
        $("ck-secure").innerHTML = JD.icon("lock", 15) + "<span>Secure checkout</span>";
        $("ck-flow").innerHTML = JD.flowSteps(2);
        await window.GamBasketAuth.ready();
        const session = await window.GamBasketAuth.getSession();
        if (!session?.user) {
            window.location.replace(`login.html?redirect=${encodeURIComponent("checkout.html")}`);
            return;
        }
        try {
            await migrateGuestCart();
            const profile = await window.GamBasketAuth.fetchUserProfile();
            let saved = {};
            try { saved = JSON.parse(localStorage.getItem(ADDRESS_KEY) || "{}") || {}; } catch { saved = {}; }
            if (profile) {
                $("fullName").value = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
                $("email").value = profile.email || session.user.email || "";
                $("phone").value = profile.phone || saved.phone || "";
            }
            if (!$("email").value) $("email").value = session.user.email || "";
            $("region").value = normalizeDeliveryRegion(profile?.region) || normalizeDeliveryRegion(saved.region);
            populateDeliveryAreas(profile?.area || saved.area || "");
            if (saved.address) $("address").value = saved.address;
            if (saved.landmark) $("landmark").value = saved.landmark;
            if (saved.instructions) $("instructions").value = saved.instructions;
            const result = await window.GamBasketAuth.getCart();
            state.cart = result.items || [];
            await loadModemPayConfig();
            await loadPickupStationConfig();
            if (!state.cart.length) {
                const placed = new URLSearchParams(location.search).get("placed");
                window.location.replace(placed ? `orders.html?order=${encodeURIComponent(placed)}&placed=1` : "cart.html");
                return;
            }
            bindEvents();
            render();
            /* a returning buyer with a saved, complete address starts on payment */
            if (state.cart.length && completeDelivery()) { state.done[1] = true; fillSummaries(); openStep(2, true); }
        } catch (error) {
            console.error("[JulaDirect Checkout]", error);
            showError("We couldn't load checkout. Please try again.");
        }
    }

    function decorate() {
        document.querySelectorAll("[data-ico]").forEach(el => {
            const ic = JD.icon(el.getAttribute("data-ico"), el.matches("li") ? 18 : 22);
            if (el.matches("li")) el.insertAdjacentHTML("afterbegin", `<span class="ck-assure__i">${ic}</span>`);
            else el.innerHTML = ic;
        });
        $("ck-coupon-ico").innerHTML = JD.icon("tag", 18);
    }

    /* ---------- rendering ---------- */
    function itemRow(item) {
        const p = productFor(item);
        const q = Number(item.quantity || 1);
        const st = stockOf(p);
        const bad = unavailable(item) ? "Unavailable" : overStock(item) ? `Only ${st} left` : "";
        const img = (JD.safeUrl && JD.safeUrl(p.main_image)) || JD.placeholder || "";
        const pid = escapeHTML(String(item.product_id || p.id));
        return `<div class="summary-item${bad ? " is-bad" : ""}" data-pid="${pid}">` +
            `<a class="summary-item-img" href="product.html?id=${encodeURIComponent(item.product_id || p.id)}"><img src="${escapeHTML(img)}" alt="" loading="lazy"></a>` +
            `<div class="summary-item-info"><div class="summary-item-name">${escapeHTML(p.title || "Product")}</div>` +
            `<div class="summary-item-qty">${money(p.price)} each${bad ? ` · <b class="ck-bad">${escapeHTML(bad)}</b>` : ""}</div>` +
            `<div class="ck-qty" role="group" aria-label="Quantity"><button type="button" data-q="-1" aria-label="Decrease quantity"${q <= 1 ? " disabled" : ""}>${JD.icon("minus", 15)}</button><output>${q}</output><button type="button" data-q="1" aria-label="Increase quantity"${st !== null && q >= st ? " disabled" : ""}>${JD.icon("plus", 15)}</button>` +
            `<button type="button" class="ck-rm" data-rm aria-label="Remove ${escapeHTML(p.title || "item")}">${JD.icon("trash", 16)}</button></div></div>` +
            `<strong class="summary-item-total">${money(Number(p.price || 0) * q)}</strong></div>`;
    }

    function render() {
        $("summaryItems").innerHTML = state.cart.map(itemRow).join("");
        $("summarySubtotal").textContent = money(subtotal());
        const activeStation = isPickupStation() ? selectedPickupStation() : null;
        $("summaryDeliveryLabel").textContent = activeStation
            ? "Pickup station · " + activeStation.area
            : (isPickupStation() ? "Pickup station" : (isDelivery() ? "Delivery" : "Choose fulfilment"));
        $("summaryDelivery").textContent = state.deliveryFee ? money(state.deliveryFee) : "Free";
        const d = discount();
        $("ck-discount-row").hidden = !d;
        $("summaryDiscount").textContent = `- ${money(d)}`;
        $("summaryTotal").textContent = money(total());
        $("ck-dock-total").textContent = money(total());
        applyFulfillmentAvailability();
        const del = isDelivery();
        $("deliveryFields").hidden = !del;
        $("pickupStationFields").hidden = !isPickupStation();
        const warn = blocked();
        const box = $("checkoutError");
        if (warn) { box.innerHTML = `Some items are unavailable or exceed the stock left. <a href="cart.html">Review your cart</a> or adjust the quantities below.`; box.hidden = false; }
        else if (box.dataset.kind === "stock") { box.hidden = true; }
        box.dataset.kind = warn ? "stock" : box.dataset.kind || "";
        labelPrimary();
        syncPlaceOrderAvailability();
    }

    function calculateDelivery() {
        applyFulfillmentAvailability();
        const delivery = isDelivery();
        const stationPickup = isPickupStation();
        state.deliveryFee = delivery ? 100 : 0;
        $("deliveryFields").hidden = !delivery;
        $("pickupStationFields").hidden = !stationPickup;
        ["region", "area", "address"].forEach(id => {
            if ($(id)) $(id).required = delivery;
        });
        if ($("pickupStationArea")) $("pickupStationArea").required = stationPickup;
        if ($("pickupStationSelect")) $("pickupStationSelect").required = stationPickup;
        render();
        fillSummaries();
    }

    function completeDelivery() {
        const base = ["fullName", "phone", "email"].every(id => $(id).value.trim());
        const fulfillmentValid = (isDelivery() && canDeliverCart()) ||
            (isPickupStation() && Boolean(selectedPickupStation()));
        const destination = isDelivery()
            ? ["region", "area", "address"].every(id => $(id).value.trim())
            : isPickupStation()
                ? Boolean(selectedPickupStation())
                : false;
        return base && fulfillmentValid && destination &&
            $("phone").value.replace(/\D/g, "").length >= 7;
    }

    function fillSummaries() {
        const name = $("fullName").value.trim(), phone = $("phone").value.trim();
        $("ck-s1-sum").textContent = state.done[1]
            ? (isDelivery()
                ? `${name} · ${phone} · ${[$("address").value.trim(), $("area").value.trim()].filter(Boolean).join(", ")}`
                : isPickupStation()
                    ? (() => {
                        const station = selectedPickupStation();
                        return station
                            ? `Pickup station · ${station.station_name} · ${station.area} · ${name} · ${phone}`
                            : "Choose a pickup station";
                    })()
                    : "Choose delivery or a pickup station")
            : "Who is receiving this order and where it goes.";
        const pay = selectedPayment();
        $("ck-s2-sum").textContent = state.done[2] && pay
            ? `Pay online with ${PAY_LABEL[pay.value] || pay.value}`
            : "Choose how you want to pay.";
        [1, 2].forEach(n => { const el = $("ck-n" + n); el.innerHTML = state.done[n] ? JD.icon("check", 16) : String(n); $("ck-s" + n).classList.toggle("is-done", state.done[n]); });
    }

    function labelPrimary() {
        let label;
        if (state.submitting) label = "Securing your order…";
        else if (state.open === 1) label = "Continue to payment";
        else if (state.open === 2) label = "Review your order";
        else if (!state.done[1]) label = "Add order details";
        else if (!state.done[2]) label = "Choose payment";
        else {
            const pay = selectedPayment();
            label = pay ? `Pay ${money(total())} online` : "Choose payment";
        }
        $("placeOrderBtn").textContent = label;
        $("ck-dock-btn").textContent = label;
    }

    function syncPlaceOrderAvailability() {
        const fulfillmentValid = (isDelivery() && canDeliverCart()) ||
            (isPickupStation() && canUsePickupStation());
        const off = state.submitting || blocked() || !fulfillmentValid;
        $("placeOrderBtn").disabled = off;
        $("ck-dock-btn").disabled = off;
        labelPrimary();
    }

    /* ---------- steps ---------- */
    function openStep(n, quiet) {
        state.open = n;
        [1, 2].forEach(i => {
            const sec = $("ck-s" + i), on = i === n;
            sec.classList.toggle("is-open", on);
            sec.querySelector(".ck-step__head").setAttribute("aria-expanded", String(on));
        });
        $("ck-summary").classList.toggle("is-review", n === 0);
        labelPrimary();
        if (quiet) return;
        const target = n ? $("ck-s" + n) : $("ck-summary");
        const phone = window.matchMedia("(max-width: 960px)").matches;
        if (n || phone) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        if (n) setTimeout(() => { const f = target.querySelector("input:not([type=radio]):not([type=checkbox]):not([disabled]), select"); if (f && n === 1 && !f.value) f.focus({ preventScroll: true }); }, 350);
    }

    function rememberAddress() {
        if (!isDelivery()) return;
        const saved = {
            phone: $("phone").value.trim(),
            region: $("region").value,
            area: $("area").value.trim(),
            address: $("address").value.trim(),
            landmark: $("landmark").value.trim(),
            instructions: $("instructions").value.trim()
        };
        try { localStorage.setItem(ADDRESS_KEY, JSON.stringify(saved)); } catch (error) {
            console.warn("[JulaDirect Checkout] address could not be saved on this device:", error);
        }
    }

    function validateDelivery() {
        if (!isDelivery() && !isPickupStation()) {
            showError("Choose delivery or an available pickup station.");
            return false;
        }
        if (isDelivery() && !canDeliverCart()) {
            showError("Delivery is unavailable for one or more items. Choose a pickup station instead.");
            return false;
        }
        if (isPickupStation() && !canUsePickupStation()) {
            showError("No pickup station is currently available. Choose delivery instead.");
            return false;
        }
        const destinationIds = isDelivery()
            ? ["region", "area", "address"]
            : ["pickupStationArea", "pickupStationSelect"];
        const ids = ["fullName", "phone", "email"].concat(destinationIds);
        for (const id of ids) {
            const el = $(id);
            if (!el.checkValidity()) { el.reportValidity(); el.focus(); return false; }
        }
        if (isPickupStation() && !selectedPickupStation()) {
            showError("Choose an available pickup station for your selected area.");
            $("pickupStationSelect")?.focus();
            return false;
        }
        const phone = $("phone");
        if (phone.value.replace(/\D/g, "").length < 7) {
            phone.setCustomValidity("Enter a phone number the seller can use to contact you.");
            phone.reportValidity();
            phone.addEventListener("input", () => phone.setCustomValidity(""), { once: true });
            phone.focus();
            return false;
        }
        return true;
    }

    function paymentOk() {
        const pay = selectedPayment();
        if (!pay || pay.disabled) { showError("Choose an available payment method."); return false; }
        clearError();
        return true;
    }

    function primary() {
        if (state.submitting || blocked()) return;
        if (state.open === 1) {
            if (!validateDelivery()) return;
            state.done[1] = true; fillSummaries();
            openStep(state.done[2] ? 0 : 2);
        } else if (state.open === 2) {
            if (!paymentOk()) return;
            state.done[2] = true; fillSummaries();
            openStep(0);
        } else if (!state.done[1]) { openStep(1); }
        else if (!state.done[2]) { openStep(2); }
        else submitOrder();
    }

    /* ---------- coupon ---------- */
    async function applyCoupon() {
        const code = $("couponInput").value.trim();
        if (!code) return;
        $("couponMessage").textContent = "Checking coupon…";
        try {
            const coupon = await window.GamBasketAuth.validateCoupon(code, subtotal());
            state.coupon = coupon;
            $("couponMessage").textContent = coupon ? `Coupon ${coupon.code} applied.` : "This coupon is invalid or unavailable.";
            render(); fillSummaries();
        } catch (error) {
            console.error("[JulaDirect Coupon]", error);
            state.coupon = null;
            $("couponMessage").textContent = "Unable to validate this coupon.";
            render();
        }
    }

    /* ---------- cart edits ---------- */
    async function changeQty(pid, delta) {
        const item = state.cart.find(i => String(i.product_id || productFor(i).id) === pid);
        if (!item) return;
        const st = stockOf(productFor(item));
        const next = Math.max(1, Math.min(Number(item.quantity || 1) + delta, st !== null ? Math.max(st, 1) : 99));
        if (next === Number(item.quantity)) return;
        const prev = item.quantity;
        item.quantity = next; state.coupon = null; $("couponMessage").textContent = ""; render();
        try { await window.GamBasketAuth.updateCartItem(pid, next); fillSummaries();  }
        catch (error) { item.quantity = prev; render(); showError("We couldn't update that quantity."); }
    }
    async function removeItem(pid) {
        const item = state.cart.find(i => String(i.product_id || productFor(i).id) === pid);
        if (!item) return;
        try {
            await window.GamBasketAuth.removeCartItem(pid);
            state.cart = state.cart.filter(i => i !== item); state.coupon = null;
            if (!state.cart.length) { window.location.replace("cart.html"); return; }
            render(); fillSummaries(); 
        } catch (error) { showError("We couldn't remove that item."); }
    }

    /* ---------- order ---------- */
    async function submitOrder() {
        if (state.submitting) return;
        const pay = selectedPayment();
        const permittedMethods = ["wave", "qmoney", "afrimoney"];
        if (!validateDelivery()) { openStep(1); return; }
        if (!pay || pay.disabled || !permittedMethods.includes(pay.value)) {
            openStep(2);
            showError("Choose an available online payment method.");
            return;
        }
        clearError();

        state.submitting = true;
        syncPlaceOrderAvailability();
        try {
            const selectedFulfillment = document.querySelector('input[name="fulfillment"]:checked');
            const fulfillment = selectedFulfillment?.value || "";
            const payment = pay.value;
            if (!["delivery", "pickup_station"].includes(fulfillment)) {
                throw new Error("Choose delivery or an available pickup station.");
            }
            if (fulfillment === "delivery" && !canDeliverCart()) {
                throw new Error("Delivery is unavailable for one or more items. Choose a pickup station instead.");
            }
            const station = fulfillment === "pickup_station" ? selectedPickupStation() : null;
            if (fulfillment === "pickup_station" && !station) {
                throw new Error("Choose an available pickup station.");
            }
            const result = await window.GamBasketAuth.createOrder({
                fulfillment_type: fulfillment,
                pickup_station_id: station?.id || null,
                payment_method: payment,
                delivery_address: fulfillment === "delivery" ? `${$("address").value.trim()}${$("landmark").value.trim() ? `, ${$("landmark").value.trim()}` : ""}` : null,
                delivery_region: station ? station.region : (fulfillment === "delivery" ? $("region").value : null),
                delivery_area: station ? station.area : (fulfillment === "delivery" ? $("area").value.trim() : null),
                delivery_phone: $("phone").value.trim(),
                delivery_instructions: fulfillment === "delivery" ? $("instructions").value.trim() : null,
                coupon_code: state.coupon?.code || null
            });
            const order = result.order || result;
            rememberAddress();

            if (order?.id) {
                try {
                    await window.GamBasketAffiliate?.attachAttribution();
                    await window.GamBasketAffiliate?.recordConversion(order.id);
                } catch (affiliateError) {
                    console.warn("[JulaDirect Affiliate] Conversion attribution failed:", affiliateError);
                }
            }

            const client = window.GamBasketAuth?.getClient?.() || window.supabaseClient;
            if (!client?.functions || !window.crypto?.randomUUID) {
                throw new Error("Secure online checkout is not available in this browser.");
            }
            $("placeOrderBtn").textContent = "Opening secure payment…";
            $("ck-dock-btn").textContent = "Opening secure payment…";
            const { data: paymentIntent, error: paymentError } = await client.functions.invoke("gambasket-modempay-checkout", {
                body: {
                    order_id: order.id,
                    payment_method: payment,
                    idempotency_key: window.crypto.randomUUID()
                }
            });
            if (paymentError || !paymentIntent?.payment_url) {
                showError((paymentIntent?.error || paymentError?.message || "ModemPay could not open checkout.") + " Your order is saved in My orders. You can retry the payment from there.");
                state.submitting = false;
                syncPlaceOrderAvailability();
                setTimeout(() => window.location.assign(`orders.html?order=${encodeURIComponent(order.id)}&placed=1`), 2600);
                return;
            }
            window.GamBasketAffiliate?.clearReferral();
            window.location.assign(paymentIntent.payment_url);
        } catch (error) {
            console.error("[JulaDirect Create Order]", error);
            showError(window.getAuthErrorMessage ? window.getAuthErrorMessage(error) : "We couldn't place the order. Please try again.");
            state.submitting = false;
            syncPlaceOrderAvailability();
        }
    }

    function showError(message) {
        const target = $("checkoutError");
        if (target) { target.textContent = message; target.dataset.kind = "error"; target.hidden = false; target.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" }); }
        else window.alert(message);
    }
    function clearError() { const t = $("checkoutError"); if (t && t.dataset.kind === "error") { t.hidden = true; t.dataset.kind = ""; } }

    /* ---------- events ---------- */
    function bindEvents() {
        $("backButton")?.addEventListener("click", () => {
            if (state.open === 2 && state.done[1] === false) { openStep(1); return; }
            if (document.referrer && history.length > 1) history.back(); else window.location.href = "cart.html";
        });
        document.querySelectorAll('input[name="fulfillment"]').forEach(input => input.addEventListener("change", () => { state.done[1] = false; calculateDelivery(); }));
        $("region")?.addEventListener("change", () => {
            state.done[1] = false;
            populateDeliveryAreas();
            fillSummaries();
        });
        $("area")?.addEventListener("change", () => {
            state.done[1] = false;
            fillSummaries();
        });
        $("pickupStationArea")?.addEventListener("change", () => {
            state.done[1] = false;
            renderPickupStationsForArea();
            fillSummaries();
        });
        $("pickupStationSelect")?.addEventListener("change", () => {
            state.done[1] = false;
            renderPickupStationDetails();
        });
        document.querySelectorAll('input[name="payment"]').forEach(input => input.addEventListener("change", () => { state.done[2] = false; clearError(); fillSummaries(); syncPlaceOrderAvailability(); }));
        $("checkoutForm").addEventListener("input", e => { if (e.target.closest("#ck-s1") && state.done[1]) { state.done[1] = false; fillSummaries(); } });
        document.querySelectorAll(".ck-step__head").forEach(h => h.addEventListener("click", () => {
            const n = Number(h.getAttribute("data-open"));
            openStep(state.open === n ? 0 : n);
        }));
        $("summaryItems").addEventListener("click", e => {
            const row = e.target.closest(".summary-item"); if (!row) return;
            const pid = row.getAttribute("data-pid");
            const q = e.target.closest("[data-q]");
            if (q) changeQty(pid, Number(q.getAttribute("data-q")));
            else if (e.target.closest("[data-rm]")) removeItem(pid);
        });
        $("applyCouponBtn")?.addEventListener("click", applyCoupon);
        $("couponInput")?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } });
        $("placeOrderBtn").addEventListener("click", primary);
        $("ck-dock-btn").addEventListener("click", primary);
        $("checkoutForm")?.addEventListener("submit", e => { e.preventDefault(); primary(); });
        calculateDelivery();
    }

    init();
})();
