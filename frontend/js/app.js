const API = "";
let restaurants = [];
let selectedTable = null;

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.message && !data.error) {
    data.message = `Request failed (${res.status})`;
  }
  return data;
}

function showMessage(el, text, type = "info") {
  el.innerHTML = text ? `<div class="message ${type}">${text}</div>` : "";
}

function nextWeekDates() {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function formatDateLabel(dateStr, index) {
  const d = new Date(dateStr + "T12:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const label = index === 0 ? "Today" : index === 1 ? "Tomorrow" : days[d.getDay()];
  return `${dateStr} (${label})`;
}

function matchTable(tables, partySize, preference) {
  if (!tables.length) return null;
  const sorted = [...tables].sort((a, b) => a.capacity - b.capacity);
  if (preference) {
    const pref = sorted.find(t => t.location.toLowerCase() === preference.toLowerCase());
    if (pref) return pref;
  }
  return sorted[0];
}

function renderRestaurants(list) {
  const container = document.getElementById("restaurantList");
  if (!list.length) {
    container.innerHTML = '<p class="empty">No restaurants found.</p>';
    return;
  }
  container.innerHTML = list.map(r => `
    <article class="card">
      <h2>${escapeHtml(r.name)}</h2>
      <div class="meta">${escapeHtml(r.cuisine || "")} · ${escapeHtml(r.price_range || "")} · ${r.rating || "—"}/5</div>
      <p>${escapeHtml(r.description || "")}</p>
      <p><strong>Address:</strong> ${escapeHtml(r.address || "N/A")}</p>
      ${r.menu_url ? `<p><a href="${escapeHtml(r.menu_url)}" target="_blank" rel="noopener">View menu</a></p>` : ""}
      <p class="features">${(r.features || []).map(escapeHtml).join(" · ")}</p>
      <p class="features">${Object.keys(r.tables || {}).length} tables · Hours ${(r.timeslots || [])[0] || "—"} – ${(r.timeslots || []).slice(-1)[0] || "—"}</p>
    </article>
  `).join("");
}

function populateCuisineFilter() {
  const cuisines = [...new Set(restaurants.map(r => r.cuisine).filter(Boolean))].sort();
  const sel = document.getElementById("cuisineFilter");
  sel.innerHTML = '<option value="">All cuisines</option>' +
    cuisines.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
}

function populateBookForm() {
  const restSel = document.getElementById("bookRestaurant");
  restSel.innerHTML = restaurants.map(r =>
    `<option value="${escapeHtml(r.restaurant_id)}">${escapeHtml(r.name)}</option>`
  ).join("");

  const dateSel = document.getElementById("bookDate");
  dateSel.innerHTML = nextWeekDates().map((d, i) =>
    `<option value="${d}">${formatDateLabel(d, i)}</option>`
  ).join("");

  updateTimeslots();
}

function updateTimeslots() {
  const rid = document.getElementById("bookRestaurant").value;
  const rest = restaurants.find(r => r.restaurant_id === rid);
  const timeSel = document.getElementById("bookTime");
  const slots = rest ? rest.timeslots || [] : [];
  timeSel.innerHTML = slots.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
}

async function loadRestaurants() {
  const status = document.getElementById("statusBar");
  try {
    const data = await api("/restaurants");
    restaurants = data.restaurants || [];
    status.textContent = restaurants.length
      ? `Connected — ${restaurants.length} restaurants available`
      : "Connected — no restaurants returned";
    status.classList.remove("offline");
    populateCuisineFilter();
    populateBookForm();
    renderRestaurants(restaurants);
  } catch {
    status.textContent = "Cannot reach API. Start the server with: python run_all.py";
    status.classList.add("offline");
    document.getElementById("restaurantList").innerHTML =
      '<p class="empty">Make sure the backend is running on port 5000.</p>';
  }
}

async function checkAvailability() {
  const rid = document.getElementById("bookRestaurant").value;
  const date = document.getElementById("bookDate").value;
  const timeslot = document.getElementById("bookTime").value;
  const partySize = parseInt(document.getElementById("bookParty").value, 10);
  const preference = document.getElementById("bookPreference").value.trim();
  const el = document.getElementById("availResult");

  const resp = await api(
    `/restaurants/${encodeURIComponent(rid)}/availability?date=${date}&timeslot=${encodeURIComponent(timeslot)}&party_size=${partySize}`
  );

  if (resp.status !== "ok") {
    selectedTable = null;
    showMessage(el, resp.message || "Could not check availability", "error");
    return;
  }

  const tables = resp.available_tables || [];
  if (!tables.length) {
    selectedTable = null;
    showMessage(el, "No tables available for that date, time, and party size.", "error");
    return;
  }

  selectedTable = matchTable(tables, partySize, preference);
  const options = tables.map(t =>
    `<li>${escapeHtml(t.table_id)} — ${t.capacity}-seat, ${escapeHtml(t.location)}${t.table_id === selectedTable.table_id ? " (recommended)" : ""}</li>`
  ).join("");

  el.innerHTML = `
    <div class="message success">
      <strong>Table assigned:</strong> ${escapeHtml(selectedTable.table_id)} (${selectedTable.capacity}-seat, ${escapeHtml(selectedTable.location)})
      <ul>${options}</ul>
    </div>`;
}

function activatePanel(panelId) {
  document.querySelectorAll(".app-nav button").forEach(b => {
    b.classList.toggle("active", b.dataset.panel === panelId);
  });
  document.querySelectorAll(".panel").forEach(p => {
    p.classList.toggle("active", p.id === panelId);
  });
}

async function findMyReservations() {
  const name = document.getElementById("searchName").value.trim().toLowerCase();
  const container = document.getElementById("myReservations");
  if (!name) {
    container.innerHTML = '<p class="empty">Enter your name to search.</p>';
    return;
  }

  const matches = [];
  for (const r of restaurants) {
    const resp = await api(`/reservations/${encodeURIComponent(r.restaurant_id)}`);
    if (resp.status === "ok") {
      for (const res of resp.reservations || []) {
        if ((res.customer_name || "").toLowerCase() === name) {
          matches.push({ ...res, restaurant_id: r.restaurant_id, restaurant_name: r.name });
        }
      }
    }
  }

  matches.sort((a, b) => (a.date + a.timeslot).localeCompare(b.date + b.timeslot));

  if (!matches.length) {
    container.innerHTML = `<p class="empty">No reservations found for "${escapeHtml(name)}".</p>`;
    return;
  }

  container.innerHTML = matches.map((res, i) => `
    <article class="card" data-index="${i}">
      <h2>${escapeHtml(res.restaurant_name)}</h2>
      <div class="meta">${escapeHtml(res.date)} at ${escapeHtml(res.timeslot)}</div>
      <p>Table ${escapeHtml(res.table_id)} · Party of ${res.party_size}</p>
      <p>Name: ${escapeHtml(res.customer_name)}</p>
      <div class="reservation-actions">
        <button class="action danger cancel-btn"
          data-rid="${escapeHtml(res.restaurant_id)}"
          data-table="${escapeHtml(res.table_id)}"
          data-date="${escapeHtml(res.date)}"
          data-time="${escapeHtml(res.timeslot)}">
          Cancel
        </button>
      </div>
    </article>
  `).join("");

  container.querySelectorAll(".cancel-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Cancel this reservation?")) return;
      const resp = await api("/reservations", {
        method: "DELETE",
        body: JSON.stringify({
          restaurant_id: btn.dataset.rid,
          table_id: btn.dataset.table,
          date: btn.dataset.date,
          timeslot: btn.dataset.time,
        }),
      });
      if (resp.status === "ok") {
        findMyReservations();
      } else {
        alert(resp.message || "Could not cancel reservation");
      }
    });
  });
}

document.getElementById("bookForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("bookMessage");
  if (!selectedTable) {
    await checkAvailability();
    if (!selectedTable) {
      showMessage(msg, "Check availability first, or no tables are free.", "error");
      return;
    }
  }

  const body = {
    restaurant_id: document.getElementById("bookRestaurant").value,
    table_id: selectedTable.table_id,
    date: document.getElementById("bookDate").value,
    timeslot: document.getElementById("bookTime").value,
    customer_name: document.getElementById("bookName").value.trim(),
    party_size: parseInt(document.getElementById("bookParty").value, 10),
    contact: document.getElementById("bookContact").value.trim(),
  };

  const resp = await api("/reservations", { method: "POST", body: JSON.stringify(body) });
  if (resp.status === "ok") {
    const r = resp.reservation || {};
    const rest = restaurants.find(x => x.restaurant_id === body.restaurant_id);
    showMessage(msg,
      `Reservation confirmed at <strong>${escapeHtml(rest?.name || body.restaurant_id)}</strong> — ` +
      `${escapeHtml(r.date)} at ${escapeHtml(r.timeslot)}, table ${escapeHtml(r.table_id)}`,
      "success"
    );
    selectedTable = null;
    document.getElementById("availResult").innerHTML = "";
  } else {
    showMessage(msg, resp.message || "Booking failed", "error");
  }
});

document.getElementById("checkAvailBtn").addEventListener("click", checkAvailability);

document.getElementById("bookRestaurant").addEventListener("change", () => {
  updateTimeslots();
  selectedTable = null;
  document.getElementById("availResult").innerHTML = "";
});

document.getElementById("cuisineFilter").addEventListener("change", (e) => {
  const cuisine = e.target.value;
  const filtered = cuisine
    ? restaurants.filter(r => r.cuisine === cuisine)
    : restaurants;
  renderRestaurants(filtered);
});

document.querySelectorAll(".app-nav button").forEach(btn => {
  btn.addEventListener("click", () => activatePanel(btn.dataset.panel));
});

document.getElementById("searchResBtn").addEventListener("click", findMyReservations);

document.getElementById("searchName").addEventListener("keydown", (e) => {
  if (e.key === "Enter") findMyReservations();
});

const hash = window.location.hash.replace("#", "");
if (hash === "book" || hash === "mine" || hash === "browse") {
  activatePanel(hash);
}

loadRestaurants();
