(() => {
  const mountedProducts = new Set();

  function hideNativePurchaseControls(root) {
    const form = root.closest("section")?.querySelector('form[action*="/cart/add"]') || document.querySelector('form[action*="/cart/add"]');
    if (!form) return;
    form.dataset.cashenzaHidden = "true";
    form.style.display = "none";
  }

  function formatTimer(target) {
    const remaining = Math.max(0, target.getTime() - Date.now());
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function money(value, currency) {
    const amount = Number(value || 0);
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "EUR" }).format(amount);
    } catch {
      return `€${amount.toFixed(2)}`;
    }
  }

  function discountedPrice(base, bundle, tier) {
    const value = Number(tier?.discountValue || bundle.discountValue || 0);
    if (bundle.discountValueType === "FIXED_AMOUNT") return Math.max(0, base - value);
    if (bundle.discountValueType === "FINAL_AMOUNT") return value;
    return Math.max(0, base * (1 - value / 100));
  }

  function track(shopDomain, bundle, type, value) {
    const formData = new FormData();
    formData.set("shop", shopDomain);
    formData.set("bundleId", bundle.id);
    formData.set("productId", bundle.productId || "");
    formData.set("type", type);
    if (value) formData.set("value", String(value));

    if (!navigator.sendBeacon?.("/apps/cashenza/analytics", formData)) {
      fetch("/apps/cashenza/analytics", { method: "POST", body: formData, keepalive: true });
    }
  }

  function optionCard(bundle, variant, option, index) {
    const quantity = Number(option.quantity || 1);
    const unitPrice = Number(variant?.price || 0);
    const compare = unitPrice * quantity;
    const finalPrice = option.isSingle ? compare : discountedPrice(compare, bundle, option);
    const saveText = option.isSingle ? "" : `<span class="cashenza-bundle__save">${escapeHtml(option.vignette || `Save ${option.discountValue || bundle.discountValue}%`)}</span>`;
    const badge = index === 1 && bundle.badgePreset !== "none" ? '<span class="cashenza-bundle__badge">Best seller</span>' : "";
    const checked = index === 1 || (index === 0 && !(bundle.tiers || []).length) ? "checked" : "";

    return `
      <label class="cashenza-bundle__card" data-cashenza-card>
        ${badge}
        <div class="cashenza-bundle__row">
          <span class="cashenza-bundle__thumb">
            ${bundle.imageUrl ? `<img src="${escapeHtml(bundle.imageUrl)}" alt="${escapeHtml(bundle.imageAlt || bundle.productTitle)}">` : ""}
            <span class="cashenza-bundle__thumb-count">x${quantity}</span>
          </span>
          <span class="cashenza-bundle__copy">
            <span class="cashenza-bundle__option-title">${escapeHtml(option.label)}</span>
            <span class="cashenza-bundle__price-row">
              ${option.isSingle ? "" : `<span class="cashenza-bundle__compare">${money(compare, bundle.currencyCode)}</span>`}
              <span class="cashenza-bundle__price">${money(finalPrice, bundle.currencyCode)}</span>
              ${saveText}
            </span>
            <span class="cashenza-bundle__note">${option.isSingle ? "Standard price" : `Buy ${quantity} and save ${option.discountValue || bundle.discountValue}%`}</span>
          </span>
          <input type="radio" name="cashenza-tier-${escapeHtml(bundle.id)}" value="${quantity}" ${checked} hidden>
        </div>
        ${quantity > 1 ? variantSelectors(bundle, quantity) : ""}
      </label>
    `;
  }

  function variantSelectors(bundle, quantity) {
    const firstVariant = Array.isArray(bundle.variants) ? bundle.variants[0] : null;
    const label = firstVariant?.title && firstVariant.title !== "Default Title" ? firstVariant.title : bundle.productTitle;
    return `
      <div class="cashenza-bundle__variant-stack">
        ${Array.from({ length: quantity }).map(() => `
          <button class="cashenza-bundle__variant" type="button">
            <span>${bundle.imageUrl ? `<img src="${escapeHtml(bundle.imageUrl)}" alt="" width="28" height="28">` : ""}</span>
            <span>${escapeHtml(label)}</span>
            <span>v</span>
          </button>
        `).join("")}
      </div>
    `;
  }

  function crossSellCard(bundle) {
    const items = Array.isArray(bundle.items) ? bundle.items : [];
    const compare = items.reduce((sum, item) => sum + Number(item.variantPrice || 0) * Number(item.quantity || 1), 0);
    const finalPrice = discountedPrice(compare, bundle, { discountValue: bundle.discountValue });
    const saveText = `<span class="cashenza-bundle__save">Save ${escapeHtml(bundle.discountValue)}${bundle.discountValueType === "PERCENTAGE" ? "%" : ""}</span>`;

    return `
      <div class="cashenza-bundle__card cashenza-bundle__card--selected" data-cashenza-card>
        ${bundle.badgePreset !== "none" ? '<span class="cashenza-bundle__badge">Best seller</span>' : ""}
        <div class="cashenza-bundle__row">
          <span class="cashenza-bundle__thumb">
            ${bundle.imageUrl ? `<img src="${escapeHtml(bundle.imageUrl)}" alt="${escapeHtml(bundle.imageAlt || bundle.productTitle)}">` : ""}
            <span class="cashenza-bundle__thumb-count">x${items.length}</span>
          </span>
          <span class="cashenza-bundle__copy">
            <span class="cashenza-bundle__option-title">Complete the bundle</span>
            <span class="cashenza-bundle__price-row">
              <span class="cashenza-bundle__compare">${money(compare, bundle.currencyCode)}</span>
              <span class="cashenza-bundle__price">${money(finalPrice, bundle.currencyCode)}</span>
              ${saveText}
            </span>
            <span class="cashenza-bundle__note">${items.map((item) => escapeHtml(item.productTitle)).join(" + ")}</span>
          </span>
        </div>
        <div class="cashenza-bundle__variant-stack">
          ${items.map((item) => `
            <button class="cashenza-bundle__variant" type="button">
              <span>${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="" width="28" height="28">` : ""}</span>
              <span>${escapeHtml(item.productTitle)}</span>
              <span>${money(item.variantPrice, bundle.currencyCode)}</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function refreshSelected(root, bundle) {
    root.querySelectorAll("[data-cashenza-card]").forEach((card) => {
      const input = card.querySelector(`input[name="cashenza-tier-${CSS.escape(bundle.id)}"]`);
      card.classList.toggle("cashenza-bundle__card--selected", input?.checked);
    });
  }

  function renderBundle(root, bundle, shopDomain) {
    const tokens = bundle.designTokens || {};
    const target = bundle.endsAt
      ? new Date(bundle.endsAt)
      : new Date(Date.now() + (bundle.fakeTimerMinutes || 20) * 60000);
    const firstVariant = Array.isArray(bundle.variants) ? bundle.variants[0] : null;
    const tiers = (bundle.tiers || []).sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
    const options = [
      { label: "Single", quantity: 1, isSingle: true },
      ...tiers.map((tier) => ({ ...tier, label: tier.quantity === 2 ? "2 units" : `${tier.quantity} units` })),
    ];
    const optionsHtml = bundle.type === "CROSS_SELL"
      ? crossSellCard(bundle)
      : options.map((option, index) => optionCard(bundle, firstVariant, option, index)).join("");

    root.innerHTML = `
      <div class="cashenza-bundle" data-effect="${escapeHtml(bundle.domEffect || "FADE_UP")}">
        <div class="cashenza-bundle__top">
          <div>
            <p class="cashenza-bundle__eyebrow">Bundle and save</p>
            <h2 class="cashenza-bundle__title">Choose your bundle</h2>
            <p class="cashenza-bundle__subtitle">Pick the offer that fits your customer best.</p>
          </div>
          <div class="cashenza-bundle__timer" data-cashenza-timer>Offer ends in --:--:--</div>
        </div>
        <div class="cashenza-bundle__options">
          ${optionsHtml}
        </div>
        <div class="cashenza-bundle__actions">
          <button class="cashenza-bundle__button" data-cashenza-add type="button">Add to cart</button>
          <button class="cashenza-bundle__button" data-cashenza-buy type="button">Buy it now</button>
        </div>
      </div>
    `;

    const card = root.querySelector(".cashenza-bundle");
    card.style.setProperty("--cashenza-bg", tokens.background || "#eef5ec");
    card.style.setProperty("--cashenza-fg", tokens.foreground || "#1f241f");
    card.style.setProperty("--cashenza-accent", tokens.accent || "#6f8b6d");
    card.style.setProperty("--cashenza-border", tokens.border || "#dfe9dc");
    card.style.setProperty("--cashenza-highlight", tokens.highlight || "#f4d313");
    card.style.setProperty("--cashenza-timer-bg", tokens.timerBackground || "#111a12");
    card.style.setProperty("--cashenza-timer-fg", tokens.timerForeground || "#ffffff");
    card.style.setProperty("--cashenza-muted", tokens.muted || "#5c655c");
    card.style.setProperty("--cashenza-radius", tokens.radius || "20px");
    card.style.setProperty("--cashenza-font", tokens.font || "Aptos, Verdana, sans-serif");

    const timer = root.querySelector("[data-cashenza-timer]");
    const tick = () => {
      if (timer) timer.textContent = `Offer ends in ${formatTimer(target)}`;
    };
    tick();
    window.setInterval(tick, 1000);

    root.querySelectorAll(`input[name="cashenza-tier-${CSS.escape(bundle.id)}"]`).forEach((input) => {
      input.addEventListener("change", () => refreshSelected(root, bundle));
    });
    refreshSelected(root, bundle);

    async function addBundle(redirectToCheckout) {
      if (!firstVariant?.id && bundle.type !== "CROSS_SELL") return;
      const quantityInput = root.querySelector(`input[name="cashenza-tier-${CSS.escape(bundle.id)}"]:checked`);
      const quantity = Number(quantityInput?.value || 1);
      const isCrossSell = bundle.type === "CROSS_SELL";
      const estimatedValue = isCrossSell
        ? (bundle.items || []).reduce((sum, item) => sum + Number(item.variantPrice || 0) * Number(item.quantity || 1), 0)
        : discountedPrice(Number(firstVariant?.price || 0) * quantity, bundle, { discountValue: bundle.discountValue });
      const properties = isCrossSell || quantity > 1 ? { _cashenza_bundle_id: bundle.id } : {};
      const cartItems = isCrossSell
        ? (bundle.items || []).filter((item) => item.variantId).map((item) => ({
            id: String(item.variantId).split("/").pop(),
            quantity: Number(item.quantity || 1),
            properties,
          }))
        : [{ id: firstVariant.id.split("/").pop(), quantity, properties }];
      if (!cartItems.length) return;
      await fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ items: cartItems }),
      });
      track(shopDomain, bundle, redirectToCheckout ? "bundle_buy_now" : "bundle_add_to_cart", estimatedValue);
      window.location.href = redirectToCheckout ? "/checkout" : "/cart";
    }

    root.querySelector("[data-cashenza-add]")?.addEventListener("click", () => addBundle(false));
    root.querySelector("[data-cashenza-buy]")?.addEventListener("click", () => addBundle(true));
    track(shopDomain, bundle, "bundle_impression");
  }

  async function mount(root) {
    const productHandle = root.dataset.productHandle;
    const shopDomain = root.dataset.shopDomain;
    if (!productHandle || !shopDomain || mountedProducts.has(productHandle)) {
      root.dataset.cashenzaIgnoredDuplicate = "true";
      return;
    }
    mountedProducts.add(productHandle);

    const response = await fetch(`/apps/cashenza/bundle/${encodeURIComponent(productHandle)}?shop=${encodeURIComponent(shopDomain)}`);
    if (!response.ok) return;
    const payload = await response.json();
    const bundles = Array.isArray(payload.bundles) ? payload.bundles.slice(0, 2) : [];
    if (!bundles.length) return;

    hideNativePurchaseControls(root);
    bundles.forEach((bundle) => {
      const container = document.createElement("div");
      root.appendChild(container);
      renderBundle(container, bundle, shopDomain);
    });
  }

  document.querySelectorAll("[data-cashenza-root]").forEach((root) => {
    if (root.dataset.cashenzaMounted === "true") return;
    root.dataset.cashenzaMounted = "true";
    mount(root);
  });
})();
