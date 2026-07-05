async function loadRestaurants() {
  const grid = document.getElementById("restaurantGrid");
  try {
    const res = await fetch("/restaurants");
    const data = await res.json();
    const restaurants = data.restaurants || [];

    document.getElementById("statRestaurants").textContent = restaurants.length || "0";
    const cuisines = new Set(restaurants.map(r => r.cuisine).filter(Boolean));
    document.getElementById("statCuisines").textContent = cuisines.size || "0";

    if (restaurants.length) {
      const featured = restaurants[Math.floor(Math.random() * restaurants.length)];
      document.getElementById("featuredName").textContent = featured.name;
      document.getElementById("featuredDesc").textContent =
        `${featured.cuisine || "Restaurant"} · ${featured.price_range || ""} · ${featured.rating || "—"}/5`;
    }

    if (!restaurants.length) {
      grid.innerHTML = '<p class="sans loading-msg">No restaurants available. Start the server with <code>python run_all.py</code>.</p>';
      return;
    }

    grid.innerHTML = restaurants.slice(0, 6).map(r => `
      <article class="restaurant-card">
        <h3>${escapeHtml(r.name)}</h3>
        <div class="meta">${escapeHtml(r.cuisine || "")} · ${escapeHtml(r.price_range || "")} · ${r.rating || "—"}/5</div>
        <p>${escapeHtml(r.description || "")}</p>
      </article>
    `).join("");

    document.getElementById("restaurantSubtitle").textContent =
      `${restaurants.length} hand-picked dining experiences`;
  } catch {
    grid.innerHTML = '<p class="sans loading-msg">Cannot reach the API. Run <code>python run_all.py</code> first.</p>';
    document.getElementById("featuredName").textContent = "Server offline";
    document.getElementById("featuredDesc").textContent = "Start the backend to see live restaurants.";
  }
}

loadRestaurants();
