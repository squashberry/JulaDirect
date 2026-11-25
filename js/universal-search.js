/* =========================================================
   JULADIRECT UNIVERSAL MARKETPLACE SEARCH
========================================================= */
(function () {
    "use strict";

    const SEARCH_LIMIT = 3;
    const SEARCH_INPUT_IDS = [
        "mobileSearch",
        "desktopHeroSearchInput",
        "desktopHeaderSearchInput",
        "desktopSearchInput",
        "exploreSearch"
    ];

    const normalise = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

    let foodEnabled = false;
    let foodFlagPromise = null;

    function refreshFoodFlag() {
        if (foodFlagPromise) return foodFlagPromise;
        foodFlagPromise = (async () => {
            try {
                if (document.readyState === "loading") {
                    await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
                }
                if (window.JDFood && typeof window.JDFood.enabled === "function") {
                    return (await window.JDFood.enabled(true)) === true;
                }
                if (window.GamBasketAuth) {
                    await window.GamBasketAuth.ready();
                    const client = window.GamBasketAuth.getClient();
                    if (client && client.rpc) {
                        const result = await client.rpc("food_enabled");
                        return !result.error && result.data === true;
                    }
                }
            } catch (_) {}
            return false;
        })().then(enabled => {
            foodEnabled = enabled === true;
            window.dispatchEvent(new CustomEvent("jd:food-flag-updated", { detail: { enabled: foodEnabled } }));
            return foodEnabled;
        }).catch(() => {
            foodEnabled = false;
            return false;
        });
        return foodFlagPromise;
    }

    const SPECIAL_DESTINATIONS = [
        {
            type: "special",
            key: "gift-cards",
            label: "Gift Cards",
            href: "/gift-cards.html",
            keywords: ["giftcard", "giftcards", "giftvoucher", "giftvouchers"]
        },
        {
            type: "special",
            key: "food",
            label: "Food & Restaurants",
            href: "/food",
            keywords: ["food", "foods", "restaurant", "restaurants", "meal", "meals", "takeaway", "takeaways", "takeout", "menu", "menus"]
        }
    ];

    function saveRecentSearch(value) {
        const term = String(value || "").trim();
        if (!term) return;

        let recent = [];
        try {
            recent = JSON.parse(localStorage.getItem("gambasket_recent_searches") || "[]");
        } catch (_) {}

        recent = [term, ...recent.filter(item => normalise(item) !== normalise(term))].slice(0, 2);
        localStorage.setItem("gambasket_recent_searches", JSON.stringify(recent));
    }

    function collectRenderedProducts() {
        return [...document.querySelectorAll(".product-card")]
            .map(card => ({
                type: "product",
                label: card.querySelector(".product-name")?.textContent?.trim() || "",
                category: card.dataset.category || "",
                location: card.querySelector(".product-location")?.textContent?.trim() || ""
            }))
            .filter(item => item.label);
    }

    function collectCategories(products) {
        const available = new Set(products.map(product => normalise(product.category)).filter(Boolean));
        return [...document.querySelectorAll(".category-card, .category-chip")]
            .map(button => ({
                type: "category",
                label: button.querySelector("span:last-child")?.textContent?.trim() || button.textContent.trim(),
                category: button.dataset.category || ""
            }))
            .filter(item => item.label && available.has(normalise(item.category)));
    }

    function collectLiveData() {
        const products = collectRenderedProducts();
        const specials = foodEnabled ? SPECIAL_DESTINATIONS : SPECIAL_DESTINATIONS.filter(item => item.key !== "food");
        return { products, categories: collectCategories(products), specials };
    }

    function scoreMatch(item, query) {
        const label = normalise(item.label);
        const search = normalise(query);
        let score = 0;

        if (label === search) score += 100;
        if (label.startsWith(search)) score += 80;
        if (label.includes(search)) score += 50;
        if (normalise(item.category).includes(search)) score += 20;
        if (normalise(item.location).includes(search)) score += 10;

        if (item.type === "special") {
            const words = search.split(" ").filter(Boolean);
            const compact = words.join("");
            let matched = false;
            if (item.key === "gift-cards") {
                matched = compact.length >= 3 && item.keywords.some(term => term.startsWith(compact) || compact.startsWith(term));
            } else {
                const first = words[0] || "";
                const isFoodTerm = first.length >= 3 && item.keywords.some(term => term === first || term.startsWith(first));
                const placeModifiers = ["in", "near", "nearby", "around", "at"];
                const otherModifiers = ["delivery", "order", "orders", "menu", "menus", "takeaway", "takeout", "pickup", "pick", "up", "online", "please", "the", "me", "here", "and", "from", "to"];
                let placeNameAllowed = false;
                const suffixAllowed = words.slice(1).every(word => {
                    if (placeModifiers.includes(word)) { placeNameAllowed = true; return true; }
                    return placeNameAllowed || otherModifiers.includes(word);
                });
                matched = isFoodTerm && suffixAllowed;
            }
            if (matched) score += 100;
        }

        return { ...item, score };
    }

    function getMatches(query) {
        const search = normalise(query);
        if (!search) return [];

        const { products, categories, specials } = collectLiveData();
        return [...products, ...categories, ...specials]
            .map(item => scoreMatch(item, search))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
            .filter((item, index, items) => items.findIndex(other => normalise(other.label) === normalise(item.label)) === index)
            .slice(0, SEARCH_LIMIT);
    }

    function navigateForMatch(match) {
        saveRecentSearch(match.label);
        if (match.type === "special") {
            window.location.href = match.href;
            return;
        }
        const parameter = match.type === "category" ? "category" : "q";
        const value = match.type === "category" ? match.category || match.label : match.label;
        window.location.href = `explore.html?${parameter}=${encodeURIComponent(value)}`;
    }

    function setupInput(input) {
        if (!input || input.dataset.universalSearchReady === "true") return;
        input.dataset.universalSearchReady = "true";

        const wrapper = input.closest(".mobile-search, .desktop-hero-search, .desktop-search-fake-input") || input.parentElement;
        if (!wrapper) return;
        wrapper.classList.add("search-autocomplete-host");

        let panel = wrapper.querySelector(".home-search-suggestions");
        if (!panel) {
            panel = document.createElement("div");
            panel.className = "home-search-suggestions";
            wrapper.appendChild(panel);
        }

        function render() {
            const matches = getMatches(input.value);
            panel.innerHTML = "";

            if (!normalise(input.value) || !matches.length) {
                panel.classList.remove("show");
                return;
            }

            matches.forEach(match => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "search-suggestion";
                button.innerHTML = `<svg class="ui-icon"><use href="#icon-${match.type === "category" ? "grid" : "search"}"></use></svg><span>${match.label}</span>`;
                button.addEventListener("click", () => navigateForMatch(match));
                panel.appendChild(button);
            });

            panel.classList.add("show");
        }

        input.addEventListener("input", render);
        input.addEventListener("focus", render);
        input.addEventListener("keydown", event => {
            if (event.key === "Escape") panel.classList.remove("show");
            if (event.key === "Enter" && normalise(input.value)) saveRecentSearch(input.value);
        });

        const form = input.closest("form");
        if (form) form.addEventListener("submit", () => saveRecentSearch(input.value));
        document.addEventListener("click", event => {
            if (!wrapper.contains(event.target)) panel.classList.remove("show");
        });
    }

    function setupUniversalSearch() {
        SEARCH_INPUT_IDS
            .map(id => document.getElementById(id))
            .filter(Boolean)
            .forEach(setupInput);
    }

    window.addEventListener("jd:food-flag-updated", event => {
        foodEnabled = !!(event.detail && event.detail.enabled);
        SEARCH_INPUT_IDS
            .map(id => document.getElementById(id))
            .filter(input => input && input.value)
            .forEach(input => input.dispatchEvent(new Event("input", { bubbles: true })));
    });

    refreshFoodFlag();
    setupUniversalSearch();

    const observer = new MutationObserver(mutations => {
        setupUniversalSearch();
        const productsChanged = mutations.some(mutation => [...mutation.addedNodes].some(node => node.nodeType === 1 && (node.matches?.(".product-card") || node.querySelector?.(".product-card"))));
        if (!productsChanged) return;
        SEARCH_INPUT_IDS
            .map(id => document.getElementById(id))
            .filter(input => input && input.value && document.activeElement === input)
            .forEach(input => input.dispatchEvent(new Event("input")));
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
