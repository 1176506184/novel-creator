const header = document.querySelector("[data-header]");
const menuButton = document.querySelector("[data-menu-button]");
const nav = document.querySelector("[data-nav]");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const updateHeader = () => {
  header?.classList.toggle("scrolled", window.scrollY > 16);
};

const closeMenu = () => {
  nav?.classList.remove("open");
  document.body.classList.remove("menu-open");
  menuButton?.setAttribute("aria-expanded", "false");
  menuButton?.setAttribute("aria-label", "打开导航菜单");
};

menuButton?.addEventListener("click", () => {
  const opening = !nav?.classList.contains("open");
  nav?.classList.toggle("open", opening);
  document.body.classList.toggle("menu-open", opening);
  menuButton.setAttribute("aria-expanded", String(opening));
  menuButton.setAttribute("aria-label", opening ? "关闭导航菜单" : "打开导航菜单");
});

nav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", closeMenu);
});

window.addEventListener("scroll", updateHeader, { passive: true });
window.addEventListener("resize", () => {
  if (window.innerWidth > 780) closeMenu();
});
updateHeader();

const revealItems = document.querySelectorAll(".reveal");

if (reduceMotion || !("IntersectionObserver" in window)) {
  revealItems.forEach((item) => item.classList.add("revealed"));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("revealed");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px" },
  );

  revealItems.forEach((item) => observer.observe(item));
}

document.querySelectorAll("[data-year]").forEach((node) => {
  node.textContent = String(new Date().getFullYear());
});

const repository = "1176506184/novel-creator";
const releaseUrl = `https://github.com/${repository}/releases`;

const updateReleaseLinks = async () => {
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });

    if (!response.ok) return;

    const release = await response.json();
    const windowsAsset = release.assets?.find((asset) => /\.exe$/i.test(asset.name));
    const href = windowsAsset?.browser_download_url || release.html_url || releaseUrl;
    const version = release.tag_name?.replace(/^v/i, "");

    document.querySelectorAll("[data-download-link]").forEach((link) => {
      link.href = href;
    });

    document.querySelectorAll("[data-release-link]").forEach((link) => {
      link.href = release.html_url || releaseUrl;
    });

    if (version) {
      document.querySelectorAll("[data-download-label]").forEach((label) => {
        label.textContent = `下载 Windows 版 v${version}`;
      });
      document.querySelectorAll("[data-version-label]").forEach((label) => {
        label.textContent = `v${version}`;
      });
    }

    if (windowsAsset?.size) {
      const sizeInMb = Math.max(1, Math.round(windowsAsset.size / 1024 / 1024));
      document.querySelectorAll("[data-download-meta]").forEach((label) => {
        label.textContent = `Windows x64 · v${version || "最新版"} · ${sizeInMb} MB · 无需安装 Node.js`;
      });
    }
  } catch {
    // GitHub API 暂时不可用或还没有 Release 时，保留版本列表作为可靠降级链接。
  }
};

updateReleaseLinks();
