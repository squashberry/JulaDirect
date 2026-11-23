/* ============================================================
   JULADIRECT — SELLER ORDERS MODULE
   Phase 5 — Fulfillment & Structured Cancellation
============================================================ */

(() => {
    "use strict";

    async function sellerCancelOrder(orderId, reason) {
        const allowedReasons = [
            "customer_request",
            "product_issue",
            "delivery_issue",
            "seller_unavailable",
            "other"
        ];

        if (!allowedReasons.includes(reason)) {
            throw new Error("Invalid cancellation reason.");
        }

        if (!window.supabaseClient) throw new Error("Order service unavailable.");

        const reasonLabels = {
            customer_request: "Customer request",
            product_issue: "Product issue",
            delivery_issue: "Delivery issue",
            seller_unavailable: "Seller unavailable",
            other: "Other"
        };
        const { data, error } = await window.supabaseClient.rpc("seller_update_order_status", {
            p_order_id: orderId,
            p_next_status: "cancelled",
            p_reason: reasonLabels[reason]
        });
        if (error) throw error;
        return { ...data, status: data.order_status, seller_cancel_reason: reason };
    }

    function calculateStats(items) {
        const rows = Array.isArray(items) ? items : [];
        const status = order => order.order_status || order.status || "pending";
        return {
            new: rows.filter(order => status(order) === "pending").length,
            processing: rows.filter(order => status(order) === "processing").length,
            ready: rows.filter(order => ["ready_for_pickup", "ready_for_delivery"].includes(status(order))).length,
            outForDelivery: rows.filter(order => ["delivery_assigned", "picked_up", "out_for_delivery"].includes(status(order))).length,
            revenue: rows.reduce((sum, order) => sum + (
                order.payment_status === "paid"
                    ? Number(order.total_amount || order.total || 0)
                    : 0
            ), 0)
        };
    }

    window.GamBasketSellerOrders = {
        sellerCancelOrder,
        calculateStats,

        async list(options = {}) {
            let user = null;
            if (window.supabaseClient) {
                const res = await window.supabaseClient.auth.getUser();
                user = res?.data?.user;
            } else if (window.GamBasketAuth) {
                user = await window.GamBasketAuth.getUser();
            }

            if (!user) return { items: [], total: 0 };

            if (window.supabaseClient) {
                try {
                    let query = window.supabaseClient
                        .from("orders")
                        .select("*")
                        .eq("seller_id", user.id)
                        .order("created_at", { ascending: false });

                    if (options.status && options.status !== "all") {
                        query = query.eq("order_status", options.status);
                    }

                    const { data, error } = await query;
                    if (!error && data) {
                        return { items: data.map(order => ({ ...order, status: order.order_status })), total: data.length };
                    }
                } catch (e) {
                    console.warn("Orders query:", e);
                }
            }

            return { items: [], total: 0 };
        },

        async updateStatus(orderId, newStatus) {
            if (!window.supabaseClient) throw new Error("Order service unavailable.");
            const { data, error } = await window.supabaseClient.rpc("seller_update_order_status", {
                p_order_id: orderId,
                p_next_status: newStatus,
                p_reason: null
            });
            if (error) throw error;
            return { ...data, status: data.order_status };
        }
    };
})();
