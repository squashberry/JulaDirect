/* =========================================================
    JULADIRECT — AUTHENTICATION & AUTHORIZATION GUARD
    Workspace access is based on active public.user_roles rows.
    ========================================================= */

(() => {
    "use strict";

    const Guard = {

        async getSession() {
            if (!window.supabaseClient) {
                if (window.GamBasketAuth && typeof window.GamBasketAuth.getSession === "function") {
                    return await window.GamBasketAuth.getSession();
                }
                return null;
            }

            try {
                const {
                    data: { session },
                    error
                } = await window.supabaseClient.auth.getSession();

                if (error) {
                    console.error("Session error:", error);
                    return null;
                }

                return session;
            } catch (err) {
                console.error("Guard getSession:", err);
                return null;
            }
        },

        async getUserProfile(userId) {
            if (!userId) return null;
            const client = window.supabaseClient || window.GamBasketAuth?.getClient?.();
            if (!client) return { id: userId };

            try {
                const { data: authResult, error: authError } = await client.auth.getUser();
                if (authError) throw authError;
                const currentUser = authResult?.user;
                if (!currentUser || currentUser.id !== userId) {
                    return { id: userId };
                }
                const { data, error } = await client
                    .from("profiles")
                    .select("*")
                    .eq("id", currentUser.id)
                    .maybeSingle();
                if (error) throw error;
                return data || { id: currentUser.id };
            } catch (err) {
                console.error("Profile lookup error:", err.message);
                return { id: userId };
            }
        },

        normalizeRole(profile) {
            if (!profile) return null;

            return (
                profile.role ||
                profile.user_role ||
                profile.account_role ||
                null
            )?.toLowerCase() || null;
        },

        async getAuthContext() {
            const session = await this.getSession();

            if (!session?.user) {
                return null;
            }

            const profile = await this.getUserProfile(session.user.id);
            const roles = window.GamBasketAuth && typeof window.GamBasketAuth.getUserRoles === "function"
                ? await window.GamBasketAuth.getUserRoles()
                : [];
            const role = roles[0] || null;

            return {
                session,
                user: session.user,
                profile,
                roles,
                role,
                isAdmin: roles.includes("admin")
            };
        },

        roleAllowsWorkspace(role, requiredRole) {
            if (!requiredRole) {
                return true;
            }

            const req = requiredRole.toLowerCase();
            const cur = (role || "").toLowerCase();

            return cur === req;
        },

        async gatePage(requiredRole) {
            const context = await this.getAuthContext();

            if (!context) {
                this.showUnauthorized(requiredRole);
                return false;
            }

            if (context.roles.includes(requiredRole) || context.roles.includes("admin")) {
                window.GamBasketAuthContext = context;
                const gate = document.getElementById("authGate");
                const content = document.getElementById("protectedContent") || document.getElementById("sellerProtectedContent");
                if (gate) {
                    gate.hidden = true;
                    gate.style.display = "none";
                }
                if (content) {
                    content.hidden = false;
                    content.style.display = "";
                }
                return true;
            }

            this.showUnauthorized(requiredRole);
            return false;
        },

        redirectToLogin() {
            const current = window.location.pathname + window.location.search;

            const login =
                window.location.pathname.includes("/supplier/") ||
                window.location.pathname.includes("/admin/") ||
                window.location.pathname.includes("/delivery/") ||
                window.location.pathname.includes("/worker/") ||
                window.location.pathname.includes("/restaurant/")
                    ? "../login.html"
                    : "login.html";

            window.location.href = login + "?redirect=" + encodeURIComponent(current);
        },

        showUnauthorized(requiredRole) {
            const role = ["restaurant", "seller", "delivery_worker", "marketplace_worker"].includes(requiredRole) ? requiredRole : "";
            const nested = /\/(supplier|restaurant|delivery|worker|admin)\//.test(window.location.pathname);
            const base = nested ? "../" : "";
            const title = role === "restaurant" ? "Bring your restaurant to JulaDirect" : role === "seller" ? "Start selling on JulaDirect" : role === "delivery_worker" ? "Become a JulaDirect courier" : role === "marketplace_worker" ? "Work with JulaDirect operations" : "Join JulaDirect";
            const copy = role === "restaurant"
                ? "Apply to list your restaurant, publish your menu and receive delivery or pickup orders."
                : role === "seller"
                    ? "Create your seller account, open your store and start selling to customers across The Gambia."
                    : role === "delivery_worker"
                        ? "Apply to deliver orders around your area and manage deliveries in the Courier Workspace."
                        : role === "marketplace_worker"
                            ? "Apply to help review listings, applications and reports in the Operations Workspace."
                            : "Choose a role and apply to work with JulaDirect.";
            const cta = role === "restaurant" ? "Apply as a restaurant" : role === "seller" ? "Become a seller · Start selling" : role === "delivery_worker" ? "Apply as a courier" : role === "marketplace_worker" ? "Apply as an operations worker" : "View opportunities";
            const target = base + "worker-apply.html" + (role ? "?role=" + encodeURIComponent(role) : "");
            const existing = document.getElementById("jd-workspace-apply-modal");
            if (existing) existing.remove();
            const modal = document.createElement("div");
            modal.id = "jd-workspace-apply-modal";
            modal.setAttribute("role", "presentation");
            modal.innerHTML = `<style>
              #jd-workspace-apply-modal{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:rgba(10,18,36,.62);backdrop-filter:blur(8px);font-family:system-ui,-apple-system,Segoe UI,sans-serif}
              #jd-workspace-apply-modal .jd-apply-card{width:min(100%,440px);box-sizing:border-box;background:#fff;border:1px solid rgba(15,23,42,.08);border-radius:24px;padding:32px 26px;text-align:center;box-shadow:0 28px 90px rgba(0,0,0,.24);color:#111827}
              #jd-workspace-apply-modal .jd-apply-icon{width:58px;height:58px;margin:0 auto 18px;display:grid;place-items:center;border-radius:18px;background:#eef7f0;font-size:29px}
              #jd-workspace-apply-modal h2{margin:0 0 10px;font-size:24px;line-height:1.2;font-weight:850;letter-spacing:-.04em}
              #jd-workspace-apply-modal p{margin:0 auto 22px;max-width:340px;color:#64748b;font-size:14px;line-height:1.6}
              #jd-workspace-apply-modal .jd-apply-cta{display:flex;min-height:48px;align-items:center;justify-content:center;padding:0 18px;border-radius:13px;background:#176b3b;color:#fff;text-decoration:none;font-weight:800}
              #jd-workspace-apply-modal .jd-apply-back{display:inline-block;margin-top:16px;color:#64748b;font-size:13px;text-decoration:none;font-weight:650}
              @media(max-width:480px){#jd-workspace-apply-modal .jd-apply-card{padding:28px 20px;border-radius:20px}#jd-workspace-apply-modal h2{font-size:22px}}
            </style><section class="jd-apply-card" role="dialog" aria-modal="true" aria-labelledby="jd-apply-modal-title">
              <div class="jd-apply-icon" aria-hidden="true">${role === "restaurant" ? "🍽️" : role === "seller" ? "🛍️" : "🤝"}</div>
              <h2 id="jd-apply-modal-title">${title}</h2><p>${copy}</p>
              <a class="jd-apply-cta" href="${target}">${cta}</a>
              <a class="jd-apply-back" href="${base}index.html">Not now · Back to JulaDirect</a>
            </section>`;
            document.body.appendChild(modal);
            const link = modal.querySelector(".jd-apply-cta");
            if (link) link.focus();
        },

        requireAuth(actionName, onAuthenticated) {
            this.getAuthContext().then(ctx => {
                if (ctx?.user) {
                    if (typeof onAuthenticated === "function") onAuthenticated(ctx.user);
                } else {
                    this.redirectToLogin();
                }
            });
        },

        navigateProtected(href) {
            this.getAuthContext().then(ctx => {
                if (ctx?.user) {
                    window.location.href = href;
                } else {
                    const login = window.location.pathname.includes("/supplier/") ? "../login.html" : "login.html";
                    window.location.href = login + "?redirect=" + encodeURIComponent(href);
                }
            });
        }
    };

    window.GamBasketGuard = Guard;
    window.navigateProtectedPage = function (destination) {
        if (window.GamBasketGuard) {
            return window.GamBasketGuard.navigateProtected(destination);
        }
        window.location.href = destination;
    };
})();
