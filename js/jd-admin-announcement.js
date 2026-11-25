/* JulaDirect admin: slim announcement strip editor. All writes are protected by RLS. */
(function () {
  "use strict";
  const JD = window.JD;
  const $ = id => document.getElementById(id);
  const form = $("jd-announcement-form");
  const blocked = $("jd-announcement-blocked");
  const statusEl = $("jd-announcement-status");
  const stateEl = $("jd-announcement-state");
  const deleteBtn = $("jd-announcement-delete");
  let client = null;
  let user = null;
  let current = null;
  const HEX = /^#[0-9a-f]{6}$/i;

  function status(message, isError) {
    statusEl.textContent = message || "";
    statusEl.classList.toggle("is-error", !!isError);
  }
  function showBlocked(message) {
    form.hidden = true;
    blocked.hidden = false;
    blocked.textContent = message;
  }
  function toLocal(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function fromLocal(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  function validLink(value) {
    const s = String(value || "").trim();
    if (!s) return true;
    if (/^https:\/\/[^\s]+$/i.test(s)) return true;
    if (s.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(s)) return false;
    return /^[A-Za-z0-9._~/-]+(?:[?#][^\s]*)?$/.test(s) || /^#[A-Za-z0-9_-]+$/.test(s);
  }
  function renderPreview() {
    const preview = $("f-preview");
    const message = $("f-preview-message");
    const link = $("f-preview-link");
    const bg = HEX.test($("f-background").value) ? $("f-background").value : "#1451e6";
    const fg = HEX.test($("f-text-color").value) ? $("f-text-color").value : "#ffffff";
    preview.style.backgroundColor = bg;
    preview.style.color = fg;
    message.textContent = $("f-message").value.trim() || "Your announcement will appear here";
    const label = $("f-link-label").value.trim();
    const url = $("f-link-url").value.trim();
    link.textContent = label;
    link.hidden = !(label && url && validLink(url));
    $("f-background-value").textContent = bg.toUpperCase();
    $("f-text-color-value").textContent = fg.toUpperCase();
  }
  function fill(row) {
    current = row || null;
    $("f-message").value = row && row.message || "";
    $("f-link-label").value = row && row.link_label || "";
    $("f-link-url").value = row && row.link_url || "";
    $("f-background").value = row && HEX.test(row.background_color || "") ? row.background_color : "#1451e6";
    $("f-text-color").value = row && HEX.test(row.text_color || "") ? row.text_color : "#ffffff";
    $("f-starts-at").value = toLocal(row && row.starts_at);
    $("f-ends-at").value = toLocal(row && row.ends_at);
    $("f-active").checked = !!(row && row.is_active);
    deleteBtn.hidden = !row;
    stateEl.hidden = !row;
    if (row) {
      const now = Date.now();
      const scheduled = row.starts_at && new Date(row.starts_at).getTime() > now;
      const expired = row.ends_at && new Date(row.ends_at).getTime() <= now;
      stateEl.textContent = !row.is_active ? "Off" : scheduled ? "Scheduled" : expired ? "Expired" : "Live";
      stateEl.className = "jd-badge" + (row.is_active && !scheduled && !expired ? " jd-badge--ok" : scheduled ? " jd-badge--warn" : "");
    }
    renderPreview();
    status("");
  }
  async function load() {
    try {
      const auth = JD.auth();
      if (!auth) { showBlocked("Sign-in is unavailable. Refresh the page and try again."); return; }
      await auth.ready();
      user = await auth.getUser();
      if (!user) { showBlocked("Sign in with a JulaDirect administrator account to edit the announcement strip."); return; }
      const roles = (await auth.getUserRoles()) || [];
      if (!roles.includes("admin")) { showBlocked("Only JulaDirect administrators can edit the storefront announcement strip."); return; }
      client = await JD.client();
      if (!client) throw new Error("The database connection is unavailable.");
      const { data, error } = await client.from("site_announcement_bars").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      blocked.hidden = true;
      form.hidden = false;
      fill(data);
    } catch (e) {
      console.warn("[JulaDirect] announcement editor", e && e.message);
      showBlocked((e && e.message) || "We could not load the announcement settings.");
    }
  }
  async function save(event) {
    if (event) event.preventDefault();
    const message = $("f-message").value.trim();
    const linkLabel = $("f-link-label").value.trim();
    const linkUrl = $("f-link-url").value.trim();
    const starts = fromLocal($("f-starts-at").value);
    const ends = fromLocal($("f-ends-at").value);
    if (!message) { status("Enter an announcement message.", true); $("f-message").focus(); return; }
    if (message.length > 180) { status("The announcement must be 180 characters or fewer.", true); return; }
    if ((linkLabel && !linkUrl) || (!linkLabel && linkUrl)) { status("Fill in both the link label and link URL, or leave both empty.", true); return; }
    if (linkUrl && !validLink(linkUrl)) { status("Use a JulaDirect page path or a full https:// link.", true); return; }
    if (!HEX.test($("f-background").value) || !HEX.test($("f-text-color").value)) { status("Choose valid background and text colours.", true); return; }
    if ($("f-starts-at").value && !starts) { status("The start date is invalid.", true); return; }
    if ($("f-ends-at").value && !ends) { status("The end date is invalid.", true); return; }
    if (starts && ends && new Date(ends) <= new Date(starts)) { status("The end time must be after the start time.", true); return; }
    const button = $("jd-announcement-save");
    button.disabled = true;
    status("Saving announcement…");
    const payload = {
      id: 1, message, link_label: linkLabel || null, link_url: linkUrl || null,
      background_color: $("f-background").value.toLowerCase(),
      text_color: $("f-text-color").value.toLowerCase(),
      is_active: $("f-active").checked, starts_at: starts, ends_at: ends,
      updated_by: user.id, updated_at: new Date().toISOString()
    };
    try {
      const { data, error } = await client.from("site_announcement_bars").upsert(payload, { onConflict: "id" }).select("*").single();
      if (error) throw error;
      fill(data || payload);
      status("Announcement saved. It will appear on the storefront when it is active and within its schedule.");
      if (JD.toast) JD.toast("Announcement saved", "ok");
    } catch (e) {
      console.warn("[JulaDirect] save announcement", e && e.message);
      status((e && e.message) || "The announcement could not be saved.", true);
    } finally { button.disabled = false; }
  }
  async function remove() {
    if (!current) return;
    if (!window.confirm("Remove the announcement strip and its saved settings?")) return;
    deleteBtn.disabled = true;
    status("Removing announcement…");
    try {
      const { error } = await client.from("site_announcement_bars").delete().eq("id", 1);
      if (error) throw error;
      fill(null);
      status("Announcement strip removed.");
      if (JD.toast) JD.toast("Announcement strip removed", "ok");
    } catch (e) {
      status((e && e.message) || "The announcement could not be removed.", true);
    } finally { deleteBtn.disabled = false; }
  }

  form.addEventListener("submit", save);
  ["f-message","f-link-label","f-link-url","f-background","f-text-color"].forEach(id => $(id).addEventListener("input", renderPreview));
  deleteBtn.addEventListener("click", remove);
  $("f-preview-link").addEventListener("click", event => event.preventDefault());
  JD.mountShell({ active: "" });
  load();
})();
