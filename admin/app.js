const API = "http://localhost:3000";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  currentView: "overview",
  conversationId: null,
  conversations: [],
  products: [],
  knowledge: [],
  selectedConversation: null,
  modalType: null,
  busy: false,
};

const faNumber = (value) =>
  new Intl.NumberFormat("fa-IR").format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const escapeHTML = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[char])
  );

function extractError(payload, fallback = "درخواست با خطا مواجه شد.") {
  const candidates = [
    payload?.error?.data?.message,
    payload?.error?.message,
    payload?.data?.message,
    payload?.message,
    payload?.error,
  ];

  const message = candidates.find(
    (item) => typeof item === "string" && item.trim()
  );

  if (message) return message;

  if (Array.isArray(payload?.message)) {
    return payload.message.join("، ");
  }

  return fallback;
}

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("ارتباط با سرور برقرار نشد. وضعیت بک‌اند را بررسی کن.");
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractError(payload, `خطای سرور (${response.status})`));
  }

  if (payload?.success === false) {
    throw new Error(extractError(payload));
  }

  return payload;
}

const getData = (payload) => payload?.data ?? payload;

function toast(message, type = "success") {
  const container = $("#toastContainer");
  const element = document.createElement("div");

  element.className = `toast ${type}`;
  element.textContent = message;

  container.appendChild(element);

  setTimeout(() => {
    element.style.opacity = "0";
    element.style.transform = "translateX(-10px)";
    setTimeout(() => element.remove(), 250);
  }, 3500);
}

function setLoading(element, message = "در حال دریافت اطلاعات...") {
  if (element) {
    element.innerHTML = `<div class="loading-state">${escapeHTML(
      message
    )}</div>`;
  }
}

/* ---------------- NAVIGATION ---------------- */

function navigate(view) {
  const target = $(`#view-${view}`);
  if (!target) return;

  state.currentView = view;

  $$(".view").forEach((item) => item.classList.remove("active"));
  target.classList.add("active");

  $$(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === view);
  });

  const titles = {
    overview: "نمای کلی",
    playground: "آزمایشگاه ایجنت",
    conversations: "مکالمات",
    knowledge: "حافظه و دانش",
    products: "محصولات",
  };

  $("#breadcrumbTitle").textContent = titles[view] || view;
  $("#sidebar").classList.remove("open");

  if (view === "overview") loadDashboard();
  if (view === "conversations") loadConversations();
  if (view === "knowledge") loadKnowledge();
  if (view === "products") loadProducts();
}

$$("[data-view]").forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.view));
});

$$("[data-navigate]").forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.navigate));
});

$("#mobileMenu").addEventListener("click", () => {
  $("#sidebar").classList.toggle("open");
});

$("#refreshButton").addEventListener("click", () => {
  navigate(state.currentView);
  toast("اطلاعات تازه‌سازی شد.");
});

/* ---------------- DASHBOARD ---------------- */

async function loadDashboard() {
  const elements = {
    conversations: $("#statConversations"),
    knowledge: $("#statKnowledge"),
    products: $("#statProducts"),
  };

  Object.values(elements).forEach((el) => {
    el.textContent = "...";
  });

  const results = await Promise.allSettled([
    request("/conversations?limit=100"),
    request("/knowledge?limit=100"),
    request("/products?limit=100"),
  ]);

  if (results[0].status === "fulfilled") {
    const payload = results[0].value;
    const rows = getData(payload) || [];
    const meta = payload?.meta || {};

    elements.conversations.textContent = faNumber(meta.total ?? rows.length);
  } else {
    elements.conversations.textContent = "—";
  }

  if (results[1].status === "fulfilled") {
    const payload = results[1].value;
    const rows = getData(payload) || [];
    const total = rows.filter((item) => item.isActive).length;
    elements.knowledge.textContent = faNumber(total);
  } else {
    elements.knowledge.textContent = "—";
  }

  if (results[2].status === "fulfilled") {
    const payload = results[2].value;
    const rows = getData(payload) || [];
    const total = rows.filter((item) => item.isActive).length;
    elements.products.textContent = faNumber(total);
  } else {
    elements.products.textContent = "—";
  }
}

/* ---------------- CHAT PLAYGROUND ---------------- */

function appendMessage(role, content, time = new Date()) {
  const container = $("#chatMessages");
  $("#welcomeState")?.remove();

  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const label = role === "customer" ? "شما" : "AURA";
  const avatar = role === "customer" ? "M" : "✳";

  row.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-content">
      <div class="message-meta">${label} · ${formatDate(time)}</div>
      <div class="message-bubble">${escapeHTML(content)}</div>
    </div>
  `;

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = $("#chatMessages");
  const row = document.createElement("div");

  row.className = "message-row assistant";
  row.id = "typingIndicator";

  row.innerHTML = `
    <div class="message-avatar">✳</div>
    <div class="message-content">
      <div class="message-meta">AURA · در حال فکر کردن</div>
      <div class="message-bubble typing-bubble">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

function removeTyping() {
  $("#typingIndicator")?.remove();
}

function resetChat() {
  state.conversationId = null;
  $("#chatMessages").innerHTML = `
    <div class="welcome-state" id="welcomeState">
      <div class="welcome-symbol">✳</div>
      <span class="eyebrow">MEET YOUR AGENT</span>
      <h2>چی تو ذهنته؟</h2>
      <p>یک سؤال مثل مشتری بپرس. AURA تلاش می‌کنه با استفاده از اطلاعات فروشگاه جواب بده.</p>
      <div class="suggestion-list">
        <button class="suggestion" data-prompt="لیست محصولات فروشگاه رو بده">لیست محصولات فروشگاه رو بده <span>↖</span></button>
        <button class="suggestion" data-prompt="شرایط ارسال سفارش چیه؟">شرایط ارسال سفارش چیه؟ <span>↖</span></button>
        <button class="suggestion" data-prompt="کفش نایک موجود دارید؟">کفش نایک موجود دارید؟ <span>↖</span></button>
      </div>
    </div>
  `;
}

async function sendChatMessage(message) {
  if (state.busy || !message.trim()) return;

  state.busy = true;

  const input = $("#chatInput");
  const button = $("#sendButton");

  input.value = "";
  button.disabled = true;

  appendMessage("customer", message);
  showTyping();

  try {
    const payload = await request("/conversations/messages", {
      method: "POST",
      body: JSON.stringify({
        message,
        ...(state.conversationId
          ? { conversationId: state.conversationId }
          : {}),
      }),
    });

    const result = getData(payload);

    if (!result?.assistantMessage?.content) {
      throw new Error("پاسخ ایجنت در قالب مورد انتظار دریافت نشد.");
    }

    state.conversationId = result.conversationId;

    removeTyping();

    appendMessage(
      "assistant",
      result.assistantMessage.content,
      result.assistantMessage.createdAt
    );
  } catch (error) {
    removeTyping();

    appendMessage(
      "assistant",
      `متأسفانه دریافت پاسخ با مشکل مواجه شد:\n${error.message}`
    );

    toast(error.message, "error");
  } finally {
    state.busy = false;
    button.disabled = false;
    input.focus();
  }
}

$("#chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  sendChatMessage($("#chatInput").value);
});

$("#chatInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    $("#chatForm").requestSubmit();
  }
});

$("#newChatButton").addEventListener("click", resetChat);

$("#chatMessages").addEventListener("click", (event) => {
  const button = event.target.closest("[data-prompt]");
  if (!button) return;

  sendChatMessage(button.dataset.prompt);
});

/* ---------------- CONVERSATIONS ---------------- */

async function loadConversations() {
  const container = $("#conversationList");
  setLoading(container);

  try {
    const payload = await request("/conversations?limit=100");
    state.conversations = getData(payload) || [];

    const total = payload?.meta?.total ?? state.conversations.length;

    $("#conversationCount").textContent = `${faNumber(total)} مکالمه ثبت‌شده`;

    renderConversations();
  } catch (error) {
    container.innerHTML = `
      <div class="loading-state">${escapeHTML(error.message)}</div>
    `;
    toast(error.message, "error");
  }
}

function renderConversations() {
  const container = $("#conversationList");

  if (!state.conversations.length) {
    container.innerHTML = `
      <div class="loading-state">هنوز مکالمه‌ای ثبت نشده است.</div>
    `;
    return;
  }

  container.innerHTML = state.conversations
    .map((item) => {
      const status = String(item.status || "").toLowerCase();
      const isClosed = status === "closed";
      const selected = state.selectedConversation === item.id;

      return `
      <div class="conversation-item ${selected ? "selected" : ""}"
           data-conversation-id="${escapeHTML(item.id)}">
        <div class="conversation-symbol">▤</div>
        <div class="conversation-copy">
          <strong>مکالمه ${escapeHTML(item.id.slice(0, 8))}</strong>
          <small>${formatDate(item.updatedAt || item.createdAt)} · ${faNumber(
        item.messageCount
      )} پیام</small>
        </div>
        <div class="conversation-meta">
          <span class="status-pill ${isClosed ? "closed" : ""}">
            ${isClosed ? "بسته‌شده" : "باز"}
          </span>
          <span>←</span>
        </div>
      </div>
    `;
    })
    .join("");
}

async function openConversation(id) {
  state.selectedConversation = id;
  renderConversations();

  const detail = $("#conversationDetail");

  detail.innerHTML = `
    <div class="loading-state">در حال دریافت تاریخچه...</div>
  `;

  try {
    const payload = await request(
      `/conversations/${encodeURIComponent(id)}/messages`
    );

    const messages = getData(payload) || [];
    const conversation = state.conversations.find((item) => item.id === id);

    detail.innerHTML = `
      <div class="detail-head">
        <strong>تاریخچه مکالمه ${escapeHTML(id.slice(0, 8))}</strong>
        ${
          String(conversation?.status).toLowerCase() === "closed"
            ? '<span class="status-pill closed">بسته‌شده</span>'
            : `<button class="table-action" data-close-conversation="${escapeHTML(
                id
              )}">بستن مکالمه</button>`
        }
      </div>
      <div class="detail-messages">
        ${
          messages.length
            ? messages
                .map(
                  (item) => `
                <div class="detail-message ${
                  item.role === "assistant" ? "assistant" : ""
                }">
                  <small>${
                    item.role === "assistant" ? "✳ AURA" : "● مشتری"
                  } · ${formatDate(item.createdAt)}</small>
                  ${escapeHTML(item.content)}
                </div>
              `
                )
                .join("")
            : '<div class="loading-state">این مکالمه هنوز پیامی ندارد.</div>'
        }
      </div>
    `;
  } catch (error) {
    detail.innerHTML = `
      <div class="loading-state">${escapeHTML(error.message)}</div>
    `;
    toast(error.message, "error");
  }
}

$("#conversationList").addEventListener("click", (event) => {
  const item = event.target.closest("[data-conversation-id]");
  if (item) openConversation(item.dataset.conversationId);
});

$("#conversationDetail").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-close-conversation]");
  if (!button) return;

  const id = button.dataset.closeConversation;

  if (!confirm("این مکالمه بسته شود؟")) return;

  try {
    await request(`/conversations/${encodeURIComponent(id)}/close`, {
      method: "POST",
    });

    toast("مکالمه بسته شد.");
    await loadConversations();
    await openConversation(id);
  } catch (error) {
    toast(error.message, "error");
  }
});

/* ---------------- KNOWLEDGE ---------------- */

async function loadKnowledge(search = "") {
  const container = $("#knowledgeList");
  setLoading(container);

  try {
    const params = new URLSearchParams({ limit: "100" });
    if (search.trim()) params.set("search", search.trim());

    const payload = await request(`/knowledge?${params}`);
    state.knowledge = getData(payload) || [];

    const total = payload?.meta?.total ?? state.knowledge.length;

    $("#knowledgeCount").textContent = `${faNumber(total)} مورد اطلاعاتی`;

    renderKnowledge();
  } catch (error) {
    container.innerHTML = `<div class="loading-state">${escapeHTML(
      error.message
    )}</div>`;
    toast(error.message, "error");
  }
}

function renderKnowledge() {
  const container = $("#knowledgeList");

  if (!state.knowledge.length) {
    container.innerHTML = '<div class="loading-state">اطلاعاتی پیدا نشد.</div>';
    return;
  }

  container.innerHTML = state.knowledge
    .map(
      (item) => `
    <article class="knowledge-card">
      <div class="knowledge-card-top">
        <span class="knowledge-category">${escapeHTML(item.category)}</span>
        <span class="status-pill ${item.isActive ? "" : "closed"}">
          ${item.isActive ? "فعال" : "غیرفعال"}
        </span>
      </div>
      <h3>${escapeHTML(item.title)}</h3>
      <p>${escapeHTML(item.content)}</p>
      <div class="knowledge-card-actions">
        <small>${formatDate(item.updatedAt || item.createdAt)}</small>
        <div>
          <button class="text-action" data-edit-knowledge="${escapeHTML(
            item.id
          )}">ویرایش</button>
          ${
            item.isActive
              ? `<button class="text-action" data-deactivate-knowledge="${escapeHTML(
                  item.id
                )}">غیرفعال‌سازی</button>`
              : ""
          }
        </div>
      </div>
    </article>
  `
    )
    .join("");
}

$("#knowledgeSearch").addEventListener("input", (event) => {
  clearTimeout(window.knowledgeSearchTimer);
  window.knowledgeSearchTimer = setTimeout(
    () => loadKnowledge(event.target.value),
    350
  );
});

$("#knowledgeList").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-knowledge]");
  const deactivate = event.target.closest("[data-deactivate-knowledge]");

  if (edit) {
    const item = state.knowledge.find(
      (row) => row.id === edit.dataset.editKnowledge
    );
    if (item) openKnowledgeModal(item);
  }

  if (deactivate) {
    const id = deactivate.dataset.deactivateKnowledge;

    if (!confirm("این اطلاعات غیرفعال شود؟")) return;

    try {
      await request(`/knowledge/${encodeURIComponent(id)}/deactivate`, {
        method: "PATCH",
      });
      toast("اطلاعات غیرفعال شد.");
      loadKnowledge($("#knowledgeSearch").value);
    } catch (error) {
      toast(error.message, "error");
    }
  }
});

/* ---------------- PRODUCTS ---------------- */

async function loadProducts(search = "") {
  const container = $("#productTable");

  container.innerHTML = `
    <tr><td colspan="6" class="loading-state">در حال دریافت محصولات...</td></tr>
  `;

  try {
    const params = new URLSearchParams({ limit: "100" });
    if (search.trim()) params.set("search", search.trim());

    const payload = await request(`/products?${params}`);
    state.products = getData(payload) || [];

    const total = payload?.meta?.total ?? state.products.length;

    $("#productCount").textContent = `${faNumber(total)} محصول`;

    renderProducts();
  } catch (error) {
    container.innerHTML = `
      <tr><td colspan="6" class="loading-state">${escapeHTML(
        error.message
      )}</td></tr>
    `;
    toast(error.message, "error");
  }
}

function renderProducts() {
  const container = $("#productTable");

  if (!state.products.length) {
    container.innerHTML = `
      <tr><td colspan="6" class="loading-state">محصولی پیدا نشد.</td></tr>
    `;
    return;
  }

  container.innerHTML = state.products
    .map(
      (item) => `
    <tr>
      <td>
        <span class="product-name">${escapeHTML(item.name)}</span>
        <span class="product-description">${escapeHTML(
          item.description || "بدون توضیحات"
        )}</span>
      </td>
      <td>${escapeHTML(item.sku)}</td>
      <td>${faNumber(item.price)} تومان</td>
      <td class="${
        Number(item.stock) < 5 ? "stock-low" : "stock-good"
      }">${faNumber(item.stock)}</td>
      <td>
        <span class="status-pill ${item.isActive ? "" : "closed"}">
          ${item.isActive ? "فعال" : "غیرفعال"}
        </span>
      </td>
      <td>
        ${
          item.isActive
            ? `<button class="table-action" data-deactivate-product="${escapeHTML(
                item.id
              )}">غیرفعال‌سازی</button>`
            : "—"
        }
      </td>
    </tr>
  `
    )
    .join("");
}

$("#productSearch").addEventListener("input", (event) => {
  clearTimeout(window.productSearchTimer);
  window.productSearchTimer = setTimeout(
    () => loadProducts(event.target.value),
    350
  );
});

$("#productTable").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-deactivate-product]");
  if (!button) return;

  const id = button.dataset.deactivateProduct;

  if (!confirm("این محصول غیرفعال شود؟")) return;

  try {
    await request(`/products/${encodeURIComponent(id)}/deactivate`, {
      method: "PATCH",
    });

    toast("محصول غیرفعال شد.");
    loadProducts($("#productSearch").value);
  } catch (error) {
    toast(error.message, "error");
  }
});

/* ---------------- MODALS & FORMS ---------------- */

function openModal({ type, title, eyebrow, fields, initial = {} }) {
  state.modalType = type;

  $("#modalTitle").textContent = title;
  $("#modalEyebrow").textContent = eyebrow;

  $("#modalFields").innerHTML = fields
    .map((field) => {
      const value = initial[field.name] ?? "";
      const inputId = `field-${field.name}`;

      if (field.type === "textarea") {
        return `
        <div class="form-field">
          <label for="${inputId}">${field.label}</label>
          <textarea id="${inputId}" name="${field.name}" placeholder="${
          field.placeholder || ""
        }" ${field.required ? "required" : ""}>${escapeHTML(value)}</textarea>
        </div>
      `;
      }

      return `
      <div class="form-field">
        <label for="${inputId}">${field.label}</label>
        <input id="${inputId}" name="${field.name}" type="${
        field.type || "text"
      }"
          value="${escapeHTML(value)}" placeholder="${field.placeholder || ""}"
          ${field.required ? "required" : ""} ${
        field.min !== undefined ? `min="${field.min}"` : ""
      } />
      </div>
    `;
    })
    .join("");

  $("#modalBackdrop").classList.add("open");
}

function closeModal() {
  $("#modalBackdrop").classList.remove("open");
  $("#modalForm").reset();
  state.modalType = null;
}

function openKnowledgeModal(item = null) {
  openModal({
    type: item ? `editKnowledge:${item.id}` : "createKnowledge",
    title: item ? "ویرایش دانش" : "افزودن دانش جدید",
    eyebrow: item ? "EDIT KNOWLEDGE" : "NEW KNOWLEDGE",
    initial: item || {},
    fields: [
      {
        name: "title",
        label: "عنوان",
        required: true,
        placeholder: "مثلاً شرایط ارسال سفارش",
      },
      {
        name: "category",
        label: "دسته‌بندی",
        required: true,
        placeholder: "مثلاً shipping",
      },
      {
        name: "content",
        label: "محتوا",
        type: "textarea",
        required: true,
        placeholder: "اطلاعاتی که AURA باید بداند...",
      },
    ],
  });
}

function openProductModal() {
  openModal({
    type: "createProduct",
    title: "افزودن محصول",
    eyebrow: "NEW PRODUCT",
    fields: [
      {
        name: "name",
        label: "نام محصول",
        required: true,
        placeholder: "نام محصول",
      },
      {
        name: "sku",
        label: "کد SKU",
        required: true,
        placeholder: "مثلاً NK-001",
      },
      {
        name: "price",
        label: "قیمت (تومان)",
        type: "number",
        required: true,
        min: 0,
      },
      {
        name: "stock",
        label: "موجودی",
        type: "number",
        required: true,
        min: 0,
      },
      {
        name: "description",
        label: "توضیحات",
        type: "textarea",
        placeholder: "توضیحات محصول...",
      },
    ],
  });
}

$("#addKnowledgeButton").addEventListener("click", () => openKnowledgeModal());
$("#addProductButton").addEventListener("click", openProductModal);
$("#modalClose").addEventListener("click", closeModal);
$("#modalCancel").addEventListener("click", closeModal);

$("#modalBackdrop").addEventListener("click", (event) => {
  if (event.target === $("#modalBackdrop")) closeModal();
});

$("#modalForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const values = Object.fromEntries(formData.entries());

  const submitButton = $("#modalSubmit");
  submitButton.disabled = true;

  try {
    if (state.modalType === "createKnowledge") {
      await request("/knowledge", {
        method: "POST",
        body: JSON.stringify(values),
      });

      toast("دانش جدید ثبت شد.");
      closeModal();
      loadKnowledge();
    } else if (state.modalType?.startsWith("editKnowledge:")) {
      const id = state.modalType.split(":")[1];

      await request(`/knowledge/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });

      toast("اطلاعات ویرایش شد.");
      closeModal();
      loadKnowledge($("#knowledgeSearch").value);
    } else if (state.modalType === "createProduct") {
      const body = {
        ...values,
        price: Number(values.price),
        stock: Number(values.stock),
      };

      await request("/products", {
        method: "POST",
        body: JSON.stringify(body),
      });

      toast("محصول جدید ثبت شد.");
      closeModal();
      loadProducts();
    }
  } catch (error) {
    toast(error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

/* ---------------- REFRESH CONTROLS ---------------- */

$$('[data-refresh="conversations"]').forEach((button) => {
  button.addEventListener("click", loadConversations);
});

/* ---------------- START ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  navigate("overview");
});
