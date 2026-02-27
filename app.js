const state = {
  slides: [],
  currentIndex: 0,
  folderContext: null,
  singleFileName: null,
  presentationMetadata: {},
  renderContext: {
    markdownPath: "",
    resolveAssetUrl: (src) => src,
  },
  debugLayout: false,
};

const dom = {
  markdownFileInput: document.getElementById("markdownFileInput"),
  folderInput: document.getElementById("folderInput"),
  markdownSelect: document.getElementById("markdownSelect"),
  aspectRatioSelect: document.getElementById("aspectRatioSelect"),
  pageNumberToggle: document.getElementById("pageNumberToggle"),
  fullscreenButton: document.getElementById("fullscreenButton"),
  printButton: document.getElementById("printButton"),
  prevButton: document.getElementById("prevButton"),
  nextButton: document.getElementById("nextButton"),
  slideCounter: document.getElementById("slideCounter"),
  thumbnailList: document.getElementById("thumbnailList"),
  viewer: document.querySelector(".viewer"),
  presentationRoot: document.getElementById("presentationRoot"),
  emptyState: document.getElementById("emptyState"),
};

if (window.marked) {
  window.marked.setOptions({
    gfm: true,
    breaks: false,
    headerIds: false,
    mangle: false,
  });
}

initialize();

function initialize() {
  const savedToggle = localStorage.getItem("showPageNumbers");
  const savedAspectRatio = localStorage.getItem("slideAspectRatio");
  if (savedToggle !== null) {
    dom.pageNumberToggle.checked = savedToggle === "true";
  }
  if (savedAspectRatio && dom.aspectRatioSelect.querySelector(`option[value="${savedAspectRatio}"]`)) {
    dom.aspectRatioSelect.value = savedAspectRatio;
  }
  syncPageNumberToggle();
  applyAspectRatio(dom.aspectRatioSelect.value);

  dom.markdownFileInput.addEventListener("change", onMarkdownFilePicked);
  dom.folderInput.addEventListener("change", onFolderPicked);
  dom.markdownSelect.addEventListener("change", onMarkdownSelectionChanged);
  dom.aspectRatioSelect.addEventListener("change", () => {
    localStorage.setItem("slideAspectRatio", dom.aspectRatioSelect.value);
    applyAspectRatio(dom.aspectRatioSelect.value);
    scheduleRelayout();
  });
  dom.pageNumberToggle.addEventListener("change", () => {
    localStorage.setItem("showPageNumbers", String(dom.pageNumberToggle.checked));
    syncPageNumberToggle();
  });
  dom.printButton.addEventListener("click", () => {
    window.print();
  });
  dom.fullscreenButton.addEventListener("click", toggleFullscreenPresentation);
  dom.prevButton.addEventListener("click", () => moveSlide(-1));
  dom.nextButton.addEventListener("click", () => moveSlide(1));
  document.addEventListener("fullscreenchange", onFullscreenChanged);
  window.addEventListener("beforeprint", preparePrintImageFit);
  window.addEventListener("afterprint", cleanupPrintImageFit);
  window.addEventListener("resize", () => {
    scheduleRelayout();
  });
  window.visualViewport?.addEventListener("resize", () => {
    scheduleRelayout();
  });
  syncTopbarHeightVar();

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSlide(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveSlide(1);
    } else if (event.key === "PageUp") {
      event.preventDefault();
      moveSlide(-1);
    } else if (event.key === "PageDown" || event.key === " ") {
      event.preventDefault();
      moveSlide(1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setCurrentSlide(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setCurrentSlide(state.slides.length - 1);
    } else if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      toggleFullscreenPresentation();
    }
  });
}

function syncPageNumberToggle() {
  document.body.classList.toggle("hide-page-numbers", !dom.pageNumberToggle.checked);
}

function applyAspectRatio(value) {
  const [wRaw, hRaw] = String(value || "16:9").split(":");
  const w = Number(wRaw);
  const h = Number(hRaw);
  const safeW = Number.isFinite(w) && w > 0 ? w : 16;
  const safeH = Number.isFinite(h) && h > 0 ? h : 9;
  document.documentElement.style.setProperty("--slide-ratio-w", String(safeW));
  document.documentElement.style.setProperty("--slide-ratio-h", String(safeH));
}

if (typeof window !== "undefined") {
  window.__mdSlideViewerTest = {
    loadMarkdown(markdown) {
      loadMarkdown(markdown, {
        markdownPath: "test.md",
        resolveAssetUrl: (src) => src,
      });
      scheduleRelayout();
    },
    setAspectRatio(value) {
      if (dom.aspectRatioSelect.querySelector(`option[value="${value}"]`)) {
        dom.aspectRatioSelect.value = value;
      }
      applyAspectRatio(value);
      scheduleRelayout();
    },
    setDebug(enabled) {
      state.debugLayout = Boolean(enabled);
    },
    goToSlide(indexOneBased) {
      const idx = Math.max(1, Number(indexOneBased || 1)) - 1;
      setCurrentSlide(idx);
      scheduleRelayout();
    },
    getLayoutSnapshot(activeOnly = false) {
      const all = Array.from(document.querySelectorAll(".slide"));
      const targetSlides = activeOnly ? all.filter((s) => s.classList.contains("is-active")) : all;
      const slides = targetSlides.map((slideEl) => {
        const contentEl = slideEl.querySelector(".slide__content");
        const contentRect = contentEl?.getBoundingClientRect();
        const figures = Array.from(slideEl.querySelectorAll(".md-figure")).map((figure) => {
          const figRect = figure.getBoundingClientRect();
          const img = figure.querySelector("img");
          const cap = figure.querySelector(".md-figure__caption");
          const imgRect = img?.getBoundingClientRect();
          const capRect = cap?.getBoundingClientRect();
          const captionGap =
            imgRect && capRect ? Math.max(0, capRect.top - imgRect.bottom) : 0;
          const inBounds = contentRect
            ? figRect.left >= contentRect.left - 1 &&
              figRect.right <= contentRect.right + 1 &&
              figRect.top >= contentRect.top - 1 &&
              figRect.bottom <= contentRect.bottom + 1
            : true;
          return {
            figureW: round1(figRect.width),
            figureH: round1(figRect.height),
            imgW: round1(imgRect?.width || 0),
            imgH: round1(imgRect?.height || 0),
            captionText: cap?.textContent || "",
            captionH: round1(capRect?.height || 0),
            captionGap: round1(captionGap),
            captionVisible: !!(cap && capRect && capRect.height > 0),
            inBounds,
          };
        });
        const overflow =
          !contentEl || contentEl.clientHeight === 0
            ? 0
            : Math.max(0, contentEl.scrollHeight - contentEl.clientHeight);
        return {
          index: Number(slideEl.dataset.index || 0) + 1,
          title: slideEl.querySelector(".slide__header h2")?.textContent || "",
          overflow: round1(overflow),
          figureCount: figures.length,
          figures,
        };
      });
      return { slides };
    },
  };
}

async function onMarkdownFilePicked(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  clearFolderContext();
  state.singleFileName = file.name;
  dom.markdownSelect.innerHTML = '<option value="">.md ファイルを選択</option>';
  dom.markdownSelect.disabled = true;

  const markdown = await file.text();
  loadMarkdown(markdown, {
    markdownPath: file.name,
    resolveAssetUrl: (src) => src,
  });
}

async function onFolderPicked(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    return;
  }

  buildFolderContext(files);
  populateMarkdownSelect();

  const firstMd = state.folderContext.markdownFiles[0];
  if (firstMd) {
    dom.markdownSelect.value = firstMd.webkitRelativePath || firstMd.name;
    await loadFromFolderMarkdown(firstMd);
  }
}

async function onMarkdownSelectionChanged() {
  if (!state.folderContext) {
    return;
  }
  const key = dom.markdownSelect.value;
  if (!key) {
    return;
  }
  const file = state.folderContext.markdownByRelativePath.get(key);
  if (file) {
    await loadFromFolderMarkdown(file);
  }
}

function buildFolderContext(files) {
  clearFolderContext();

  const objectUrlByFile = new Map();
  const fileByPath = new Map();
  const markdownFiles = [];
  const markdownByRelativePath = new Map();

  for (const file of files) {
    const relativePath = normalizePath(file.webkitRelativePath || file.name);
    const shortenedPath = stripRootFolder(relativePath);
    fileByPath.set(relativePath, file);
    fileByPath.set(shortenedPath, file);

    if (isMarkdownFile(file.name)) {
      markdownFiles.push(file);
      markdownByRelativePath.set(relativePath, file);
      markdownByRelativePath.set(shortenedPath, file);
    }

    objectUrlByFile.set(file, URL.createObjectURL(file));
  }

  state.folderContext = { files, objectUrlByFile, fileByPath, markdownFiles, markdownByRelativePath };
}

function clearFolderContext() {
  if (!state.folderContext) {
    return;
  }
  for (const url of state.folderContext.objectUrlByFile.values()) {
    URL.revokeObjectURL(url);
  }
  state.folderContext = null;
}

function populateMarkdownSelect() {
  const select = dom.markdownSelect;
  select.innerHTML = "";

  if (!state.folderContext || state.folderContext.markdownFiles.length === 0) {
    select.disabled = true;
    select.innerHTML = '<option value="">.md ファイルが見つかりません</option>';
    return;
  }

  const seen = new Set();
  for (const file of state.folderContext.markdownFiles) {
    const value = normalizePath(file.webkitRelativePath || file.name);
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);

    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
  select.disabled = false;
}

async function loadFromFolderMarkdown(file) {
  const markdown = await file.text();
  const markdownPath = normalizePath(file.webkitRelativePath || file.name);
  loadMarkdown(markdown, {
    markdownPath,
    resolveAssetUrl: (src) => resolveFolderAssetUrl(src, markdownPath),
  });
}

function loadMarkdown(markdown, options) {
  const parsed = parseMarkdownToSlides(markdown);
  state.presentationMetadata = parsed.metadata;
  state.renderContext = options;
  state.slides = parsed.slides.map((slide) => ({
    ...slide,
    commonFooter: getFooterText(parsed.metadata),
  }));
  state.currentIndex = 0;
  renderSlides(options);
}

function getFooterText(metadata) {
  return metadata.footer || "";
}

function rerenderSlides() {
  if (state.slides.length === 0) {
    return;
  }
  for (const slide of state.slides) {
    slide.commonFooter = getFooterText(state.presentationMetadata);
  }
  renderSlides(state.renderContext);
}

function parseMarkdownToSlides(markdownText) {
  const normalized = markdownText.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  let titleSection = null;
  let currentPage = null;
  const pages = [];
  const preambleLines = [];

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+?)\s*$/);
    if (h1Match) {
      if (!titleSection) {
        titleSection = { title: h1Match[1], lines: [] };
      } else {
        if (currentPage) pages.push(currentPage);
        currentPage = { title: h1Match[1], lines: [] };
      }
      continue;
    }

    const h2Match = line.match(/^##\s+(.+?)\s*$/);
    if (h2Match) {
      if (currentPage) pages.push(currentPage);
      currentPage = { title: h2Match[1], lines: [] };
      continue;
    }

    if (currentPage) {
      currentPage.lines.push(line);
    } else if (titleSection) {
      titleSection.lines.push(line);
    } else {
      preambleLines.push(line);
    }
  }
  if (currentPage) pages.push(currentPage);

  const metadata = {};
  const slides = [];

  if (titleSection) {
    const titleBody = titleSection.lines.join("\n").trim();
    const { metadata: titleMeta, restMarkdown } = extractTitleMetadata(titleBody);
    Object.assign(metadata, titleMeta);
    slides.push({
      type: "title",
      title: titleSection.title,
      markdown: restMarkdown,
      metadata: titleMeta,
    });
  }

  for (const page of pages) {
    slides.push({
      type: "content",
      title: page.title,
      markdown: page.lines.join("\n").trim(),
      metadata: {},
    });
  }

  if (slides.length === 0) {
    slides.push({
      type: "title",
      title: "Untitled",
      markdown: preambleLines.join("\n").trim() || normalized.trim(),
      metadata: {},
    });
  } else if (preambleLines.join("\n").trim()) {
    if (slides[0].type === "title") {
      slides[0].markdown = [slides[0].markdown, preambleLines.join("\n").trim()].filter(Boolean).join("\n\n");
    }
  }

  return { metadata, slides };
}

function extractTitleMetadata(markdownBody) {
  const keys = new Set(["author", "organization", "position", "date", "footer"]);
  const metadata = {};
  const restLines = [];

  for (const line of markdownBody.split("\n")) {
    const match = line.match(/^\s*[-*]\s*(author|organization|position|date|footer)\s*:\s*(.*?)\s*$/i);
    if (match) {
      metadata[match[1].toLowerCase()] = match[2];
      continue;
    }
    restLines.push(line);
  }

  return { metadata, restMarkdown: restLines.join("\n").trim() };
}

function renderSlides(renderOptions) {
  dom.presentationRoot.innerHTML = "";
  dom.thumbnailList.innerHTML = "";
  dom.emptyState.hidden = state.slides.length > 0;

  if (state.slides.length === 0) {
    updateCounter();
    return;
  }

  state.slides.forEach((slide, index) => {
    const section = document.createElement("section");
    section.className = "slide";
    section.dataset.index = String(index);
    if (index === state.currentIndex) section.classList.add("is-active");

    const inner = document.createElement("div");
    inner.className = "slide__inner";

    const header = document.createElement("header");
    header.className = "slide__header";
    const title = document.createElement("h2");
    title.textContent = slide.title;
    header.append(title);

    const content = document.createElement("div");
    content.className = "slide__content";

    if (slide.type === "title") {
      section.classList.add("slide--title");
      content.append(buildTitleMeta(slide.metadata));
      if (slide.markdown) {
        const bodyBlock = document.createElement("div");
        bodyBlock.className = "title-body";
        bodyBlock.innerHTML = renderMarkdown(slide.markdown);
        rewriteImageUrls(bodyBlock, renderOptions, slide);
        groupConsecutiveFigures(bodyBlock);
        content.append(bodyBlock);
      }
    } else {
      content.innerHTML = renderMarkdown(slide.markdown);
      rewriteImageUrls(content, renderOptions, slide);
      groupConsecutiveFigures(content);
    }

    const footer = document.createElement("footer");
    footer.className = "slide__footer";
    const footerText = document.createElement("div");
    footerText.textContent = slide.commonFooter || "";
    const pageNumber = document.createElement("div");
    pageNumber.className = "slide__page-number";
    pageNumber.textContent = `${index + 1} / ${state.slides.length}`;
    footer.append(footerText, pageNumber);

    if (slide.type === "title") {
      const hero = document.createElement("div");
      hero.className = "slide__hero";
      hero.append(header, content);
      inner.append(hero, footer);
    } else {
      inner.append(header, content, footer);
    }
    section.append(inner);
    dom.presentationRoot.append(section);

    const thumbItem = document.createElement("li");
    const thumbButton = document.createElement("button");
    thumbButton.type = "button";
    if (index === state.currentIndex) thumbButton.classList.add("is-active");
    thumbButton.addEventListener("click", () => setCurrentSlide(index));
    thumbButton.innerHTML =
      `<span class="thumb-index">${index + 1}.</span><span class="thumb-title">${escapeHtml(slide.title)}</span>`;
    thumbItem.append(thumbButton);
    dom.thumbnailList.append(thumbItem);
  });

  applyAutoFitToSlides();
  updateCounter();
}

function buildTitleMeta(metadata) {
  const container = document.createElement("div");
  container.className = "title-meta";

  const labels = [
    ["author", "Author"],
    ["organization", "Organization"],
    ["position", "Position"],
    ["date", "Date"],
  ];

  let hasAny = false;
  for (const [key, label] of labels) {
    const value = metadata?.[key];
    if (!value) continue;
    hasAny = true;
    const row = document.createElement("div");
    row.className = "title-meta__row";
    row.innerHTML =
      `<div class="title-meta__label">${label}</div><div class="title-meta__value">${escapeHtml(value)}</div>`;
    container.append(row);
  }

  if (!hasAny) {
    return document.createElement("div");
  }
  return container;
}

function renderMarkdown(markdown) {
  if (!markdown.trim()) {
    return "";
  }
  if (!window.marked) {
    return `<pre>${escapeHtml(markdown)}</pre>`;
  }
  return window.marked.parse(markdown);
}

function rewriteImageUrls(rootElement, renderOptions) {
  const images = rootElement.querySelectorAll("img");
  images.forEach((img) => {
    const src = img.getAttribute("src");
    if (!src) return;
    decorateImageWithCaption(img);
    img.addEventListener(
      "load",
      () => {
        scheduleRelayout();
      },
      { once: true }
    );
    img.src = renderOptions.resolveAssetUrl(src) || src;
  });
  normalizeListEmbeddedFigures(rootElement);
}

function decorateImageWithCaption(img) {
  const captionText = (img.getAttribute("alt") || img.getAttribute("title") || "").trim();
  if (!captionText) return;

  const parent = img.parentElement;
  if (!parent) return;

  const figure = document.createElement("figure");
  figure.className = "md-figure";
  const inner = document.createElement("div");
  inner.className = "md-figure__inner";

  const figcaption = document.createElement("figcaption");
  figcaption.className = "md-figure__caption";
  figcaption.textContent = captionText;

  if (isParagraphWithOnlyThisImage(parent, img)) {
    parent.replaceWith(figure);
    inner.append(img);
    figure.append(inner, figcaption);
    return;
  }

  img.replaceWith(figure);
  inner.append(img);
  figure.append(inner, figcaption);
}

function isParagraphWithOnlyThisImage(parent, img) {
  if (!parent || parent.tagName !== "P") return false;
  const meaningful = Array.from(parent.childNodes).filter((node) => {
    if (node === img) return true;
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent || "").trim().length > 0;
    }
    return true;
  });
  return meaningful.length === 1 && meaningful[0] === img;
}

function normalizeListEmbeddedFigures(rootElement) {
  const listItems = Array.from(rootElement.querySelectorAll("li"));
  listItems.forEach((li) => {
    const list = li.closest("ul, ol");
    if (!list) return;

    const figures = Array.from(li.children).filter(
      (el) => el.classList?.contains("md-figure") || el.classList?.contains("md-figure-group")
    );
    if (!figures.length) return;

    // Lift media blocks outside the list so slide-wide image fit/centering can apply.
    let anchor = list;
    figures.forEach((figure) => {
      figure.remove();
      anchor.after(figure);
      anchor = figure;
    });

    const hasMeaningfulContent = Array.from(li.childNodes).some((node) => {
      if (node.nodeType === Node.TEXT_NODE) return Boolean((node.textContent || "").trim());
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      const el = node;
      if (el.tagName === "BR") return false;
      if (el.classList?.contains("md-figure") || el.classList?.contains("md-figure-group")) return false;
      return Boolean((el.textContent || "").trim()) || el.children.length > 0;
    });
    if (!hasMeaningfulContent) {
      li.remove();
    }
  });
}

function setCurrentSlide(index) {
  if (index < 0 || index >= state.slides.length) return;
  state.currentIndex = index;

  for (const slideEl of dom.presentationRoot.querySelectorAll(".slide")) {
    slideEl.classList.toggle("is-active", Number(slideEl.dataset.index) === index);
  }

  const thumbButtons = dom.thumbnailList.querySelectorAll("button");
  thumbButtons.forEach((button, i) => button.classList.toggle("is-active", i === index));

  applyAutoFitToSlides();
  updateCounter();
  if (!document.fullscreenElement) {
    dom.presentationRoot.querySelector(`.slide[data-index="${index}"]`)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }
}

function moveSlide(delta) {
  if (!state.slides.length) return;
  setCurrentSlide(Math.max(0, Math.min(state.currentIndex + delta, state.slides.length - 1)));
}

function updateCounter() {
  const total = state.slides.length;
  const current = total ? state.currentIndex + 1 : 0;
  dom.slideCounter.textContent = `${current} / ${total}`;
}

function syncTopbarHeightVar() {
  const topbar = document.querySelector(".topbar");
  const height = Math.ceil(topbar?.getBoundingClientRect().height || 86);
  document.documentElement.style.setProperty("--topbar-h", `${height}px`);
}

function applyAutoFitToSlides() {
  const slides = dom.presentationRoot.querySelectorAll(".slide");
  slides.forEach((slideEl) => {
    slideEl.classList.remove("fit-loose", "fit-tight-1", "fit-tight-2");
    slideEl.style.removeProperty("--dynamic-image-max-h");
    resetFigureBlockSizing(slideEl);
    const inner = slideEl.querySelector(".slide__inner");
    const content = slideEl.querySelector(".slide__content");
    if (!inner || !content) return;
    if (inner.clientHeight < 10) return;
    clearScreenMediaSpacing(content);
    optimizeFigureGroups(content, slideEl.classList.contains("slide--title"));

    fitFigureBlocks(slideEl, inner, content);
    applyScreenMediaCentering(content);
    logSlideLayoutDebug(slideEl, inner, content);
  });
}

function groupConsecutiveFigures(rootElement) {
  const parentCandidates = [rootElement, ...rootElement.querySelectorAll(".title-body")];
  parentCandidates.forEach((parent) => {
    if (!(parent instanceof HTMLElement)) return;
    unwrapFigureOnlyParagraphs(parent);
    const children = Array.from(parent.children);
    let run = [];

    const flush = () => {
      if (run.length < 2) {
        run = [];
        return;
      }
      const wrapper = document.createElement("div");
      wrapper.className = "md-figure-group";
      run[0].before(wrapper);
      run.forEach((node) => wrapper.append(node));
      run = [];
    };

    for (const child of children) {
      if (child.classList.contains("md-figure")) {
        run.push(child);
      } else {
        flush();
      }
    }
    flush();
  });
}

function unwrapFigureOnlyParagraphs(parent) {
  const paragraphs = Array.from(parent.querySelectorAll(":scope > p"));
  paragraphs.forEach((p) => {
    const figures = Array.from(p.children).filter((el) => el.classList?.contains("md-figure"));
    const hasOnlyFigureAndWhitespace = Array.from(p.childNodes).every((node) => {
      if (node.nodeType === Node.TEXT_NODE) return !(node.textContent || "").trim();
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      const el = node;
      if (el.classList?.contains("md-figure")) return true;
      return el.tagName === "BR";
    });
    if (!hasOnlyFigureAndWhitespace || figures.length === 0) return;
    if (figures.length === 1) {
      p.replaceWith(figures[0]);
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "md-figure-group";
    wrapper.dataset.fromParagraph = "true";
    figures.forEach((figure) => wrapper.append(figure));
    p.replaceWith(wrapper);
  });
}

function optimizeFigureGroups(contentEl, isTitleSlide) {
  const groups = contentEl.querySelectorAll(".md-figure-group");
  groups.forEach((group) => {
    const figures = Array.from(group.querySelectorAll(":scope > .md-figure"));
    if (figures.length < 2) return;
    const cols = chooseFigureGroupColumns(figures, isTitleSlide);
    group.style.setProperty("--figure-group-cols", String(cols));
    group.dataset.cols = String(cols);
  });
}

function chooseFigureGroupColumns(figures, isTitleSlide) {
  const count = figures.length;
  if (count <= 1) return 1;
  if (isTitleSlide) return Math.min(2, count);

  const imageMetrics = figures
    .map((figure) => figure.querySelector("img"))
    .filter(Boolean)
    .map((img) => {
      const w = img.naturalWidth || img.width || 1;
      const h = img.naturalHeight || img.height || 1;
      return { aspect: w / Math.max(1, h), loaded: Boolean(img.naturalWidth && img.naturalHeight) };
    });

  const loadedCount = imageMetrics.filter((m) => m.loaded).length;
  if (loadedCount === 0) {
    if (count === 2) return 2;
    if (count === 3) return 2;
    return Math.min(3, Math.max(2, Math.ceil(Math.sqrt(count))));
  }

  const avgAspect = imageMetrics.reduce((sum, m) => sum + m.aspect, 0) / imageMetrics.length;
  const wideCount = imageMetrics.filter((m) => m.aspect >= 1.2).length;
  const portraitCount = imageMetrics.filter((m) => m.aspect < 0.9).length;

  if (count === 2) {
    return avgAspect < 0.75 ? 1 : 2;
  }
  if (count === 3) {
    if (portraitCount >= 2) return 3;
    return 2;
  }
  if (count === 4) {
    return 2;
  }
  if (count <= 6) {
    return wideCount >= Math.ceil(count / 2) ? 3 : 2;
  }
  return 3;
}

async function toggleFullscreenPresentation() {
  if (!state.slides.length) return;

  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }

  try {
    await dom.viewer?.requestFullscreen();
  } catch {
    // Ignore API failures; UI stays in normal mode.
  }
}

function onFullscreenChanged() {
  const isFs = Boolean(document.fullscreenElement);
  document.body.classList.toggle("is-fullscreen", isFs);
  dom.fullscreenButton.textContent = isFs ? "フルスクリーン終了" : "フルスクリーン";
  syncTopbarHeightVar();
  applyAutoFitToSlides();
}

let relayoutTimer = 0;
let relayoutTimer2 = 0;
let relayoutRaf = 0;

function scheduleRelayout() {
  window.cancelAnimationFrame(relayoutRaf);
  relayoutRaf = window.requestAnimationFrame(() => {
    syncTopbarHeightVar();
    applyAutoFitToSlides();
  });
  window.clearTimeout(relayoutTimer);
  window.clearTimeout(relayoutTimer2);
  relayoutTimer = window.setTimeout(() => {
    syncTopbarHeightVar();
    applyAutoFitToSlides();
  }, 90);
  relayoutTimer2 = window.setTimeout(() => {
    syncTopbarHeightVar();
    applyAutoFitToSlides();
  }, 220);
}

function preparePrintImageFit() {
  document.body.classList.add("print-mode");
  document.body.classList.add("print-prep");
  // Ensure print-like layout is measurable before opening the dialog.
  void document.body.offsetHeight;
  const slides = Array.from(document.querySelectorAll(".slide"));

  for (const slide of slides) {
    const content = slide.querySelector(".slide__content");
    if (!content) continue;
    const figures = Array.from(content.querySelectorAll(".md-figure"));
    if (!figures.length) continue;
    clearPrintMediaSpacing(content);

    for (const img of content.querySelectorAll("img")) {
      img.style.removeProperty("--print-single-max-h");
    }

    setPrintFigureScale(figures, 1);
    const totalAtScale1 = content.scrollHeight;
    const available = content.clientHeight || 0;
    if (!available) continue;

    // Measure non-media (text/table/header within content flow).
    content.classList.add("print-measure-no-media");
    void content.offsetHeight;
    const fixedHeight = content.scrollHeight;
    content.classList.remove("print-measure-no-media");
    void content.offsetHeight;

    // If the page overflows even without media, image scaling cannot fix it.
    if (fixedHeight - available > 1) {
      setPrintFigureScale(figures, 1);
      continue;
    }

    if (figures.length === 1 && fixedHeight / available < 0.75) {
      const img = figures[0].querySelector("img");
      if (!img) continue;
      const baseH = Math.max(1, Math.floor(img.getBoundingClientRect().height || 1));
      const maxByScale = Math.floor(baseH * 2);
      let cap = Math.max(120, Math.min(Math.floor((available - fixedHeight) * 0.98), maxByScale));
      img.style.setProperty("--print-single-max-h", `${cap}px`);
      let guard = 0;
      while (guard < 8 && !printSlideFits(content, figures)) {
        guard += 1;
        cap = Math.max(64, Math.floor(cap * 0.92));
        img.style.setProperty("--print-single-max-h", `${cap}px`);
      }
      applyPrintMediaCentering(content);
      continue;
    }

    const mediaHeightAtScale1 = Math.max(1, totalAtScale1 - fixedHeight);
    const rawTarget = (available - fixedHeight) / mediaHeightAtScale1;
    const minScale = 0.2;
    const maxScale = 2;
    let target = Math.max(minScale, Math.min(maxScale, rawTarget));
    setPrintFigureScale(figures, target);

    // Refine to largest fitting scale.
    let low;
    let high;
    if (printSlideFits(content, figures)) {
      low = target;
      high = maxScale;
    } else {
      low = minScale;
      high = target;
      setPrintFigureScale(figures, low);
      if (!printSlideFits(content, figures)) {
        continue;
      }
    }

    for (let i = 0; i < 12; i += 1) {
      const mid = (low + high) / 2;
      setPrintFigureScale(figures, mid);
      if (printSlideFits(content, figures)) {
        low = mid;
      } else {
        high = mid;
      }
    }
    setPrintFigureScale(figures, low);
    applyPrintMediaCentering(content);
  }
  document.body.classList.remove("print-prep");
}

function cleanupPrintImageFit() {
  document.body.classList.remove("print-mode");
  document.body.classList.remove("print-prep");
  for (const figure of document.querySelectorAll(".slide__content .md-figure")) {
    figure.style.removeProperty("--print-figure-scale");
    figure.style.removeProperty("--print-media-extra-space-top");
    figure.style.removeProperty("--print-media-extra-space-bottom");
  }
  for (const group of document.querySelectorAll(".slide__content .md-figure-group")) {
    group.style.removeProperty("--print-media-extra-space-top");
    group.style.removeProperty("--print-media-extra-space-bottom");
  }
  for (const img of document.querySelectorAll(".slide__content img")) {
    img.style.removeProperty("--print-single-max-h");
  }
}

function setPrintFigureScale(figures, scale) {
  for (const figure of figures) {
    figure.style.setProperty("--print-figure-scale", String(scale));
  }
}

function printSlideFits(content, figures) {
  if (!content) return true;
  if (content.scrollHeight > content.clientHeight + 1) return false;
  if (content.scrollWidth > content.clientWidth + 1) return false;
  return true;
}

function clearPrintMediaSpacing(content) {
  const blocks = content.querySelectorAll(".md-figure, .md-figure-group");
  for (const block of blocks) {
    block.style.removeProperty("--print-media-extra-space-top");
    block.style.removeProperty("--print-media-extra-space-bottom");
  }
}

function applyPrintMediaCentering(content) {
  applyMediaCenteringByMeasuredSpace(content, "--print-media-extra-space-top", "--print-media-extra-space-bottom");
}

function resetFigureBlockSizing(slideEl) {
  slideEl.querySelectorAll(".md-figure").forEach((figure) => {
    figure.style.removeProperty("--figure-scale");
    figure.style.removeProperty("--media-extra-space-top");
    figure.style.removeProperty("--media-extra-space-bottom");
    figure.style.height = "";
  });
  slideEl.querySelectorAll(".md-figure-group").forEach((group) => {
    group.style.removeProperty("--media-extra-space-top");
    group.style.removeProperty("--media-extra-space-bottom");
  });
  slideEl.querySelectorAll(".md-figure img").forEach((img) => {
    img.style.maxHeight = "";
    img.style.maxWidth = "";
    img.style.width = "";
    img.style.height = "";
  });
  slideEl.querySelectorAll(".slide__content > img").forEach((img) => {
    img.style.maxHeight = "";
    img.style.maxWidth = "";
  });
}

function fitFigureBlocks(slideEl, innerEl, contentEl) {
  const figures = Array.from(slideEl.querySelectorAll(".md-figure")).filter((figure) =>
    figure.querySelector(".md-figure__inner")
  );
  if (figures.length === 0) return;
  if (figures.length === 1) {
    fitSingleFigureBlock(figures[0], innerEl, contentEl);
    return;
  }

  const isTitle = slideEl.classList.contains("slide--title");
  const minScale = isTitle ? 0.35 : 0.4;
  const maxScaleCap = 1;

  // Start from 1 and then search the largest scale that still fits.
  applyFigureBlockScale(figures, 1);

  if (slideOverflows(innerEl, contentEl, figures)) {
    let low = minScale;
    let high = 1;

    applyFigureBlockScale(figures, low);
    if (slideOverflows(innerEl, contentEl, figures)) {
      // Extreme fallback: keep shrinking until it fits or we hit a hard floor.
      for (let s = low; s >= 0.2; s -= 0.05) {
        applyFigureBlockScale(figures, s);
        if (!slideOverflows(innerEl, contentEl, figures)) return;
      }
      return;
    }

    for (let i = 0; i < 10; i += 1) {
      const mid = (low + high) / 2;
      applyFigureBlockScale(figures, mid);
      if (slideOverflows(innerEl, contentEl, figures)) {
        high = mid;
      } else {
        low = mid;
      }
    }
    applyFigureBlockScale(figures, low);
    return;
  }

  // If it already fits, keep scale=1 for stability. (Grouping/layout should handle space usage.)
  applyFigureBlockScale(figures, 1);
  return;
}

function fitSingleFigureBlock(figure, innerEl, contentEl) {
  const img = figure.querySelector("img");
  if (!img) return;

  img.style.width = "auto";
  img.style.maxWidth = "96%";
  img.style.maxHeight = "none";

  const baseH = Math.max(1, Math.floor(img.getBoundingClientRect().height || img.naturalHeight || 1));
  const viewportCap = Math.max(64, Math.floor(contentEl.clientHeight * 0.98));
  const maxH = Math.max(48, Math.min(viewportCap, Math.floor(baseH * 2)));
  img.style.maxHeight = `${maxH}px`;

  if (!slideOverflows(innerEl, contentEl, [figure])) {
    return;
  }

  let low = 32;
  let high = maxH;
  for (let i = 0; i < 12; i += 1) {
    const mid = (low + high) / 2;
    img.style.maxHeight = `${Math.floor(mid)}px`;
    if (slideOverflows(innerEl, contentEl, [figure])) {
      high = mid;
    } else {
      low = mid;
    }
  }
  img.style.maxHeight = `${Math.floor(low)}px`;
  ensureSingleFigureMinPadding(figure, img, innerEl, contentEl, 18);
}

function clearScreenMediaSpacing(content) {
  const blocks = content.querySelectorAll(".md-figure, .md-figure-group");
  for (const block of blocks) {
    block.style.removeProperty("--media-extra-space-top");
    block.style.removeProperty("--media-extra-space-bottom");
  }
}

function applyScreenMediaCentering(content) {
  applyMediaCenteringByMeasuredSpace(content, "--media-extra-space-top", "--media-extra-space-bottom");
}

function applyMediaCenteringByMeasuredSpace(content, topVar, bottomVar) {
  const blocks = Array.from(content.children).filter(
    (el) => el.classList?.contains("md-figure") || el.classList?.contains("md-figure-group")
  );
  if (blocks.length !== 1) return;
  const mediaBlock = blocks[0];
  const metrics = getMediaRegionMetrics(content, mediaBlock);
  if (!metrics) return;
  const extra = metrics.extra;
  if (extra < 6) return;
  const top = Math.floor(extra / 2);
  const bottom = extra - top;
  mediaBlock.style.setProperty(topVar, `${top}px`);
  mediaBlock.style.setProperty(bottomVar, `${bottom}px`);
}

function ensureSingleFigureMinPadding(figure, img, innerEl, contentEl, minEach = 18) {
  if (!figure || !img) return;
  const minTotal = minEach * 2;
  let guard = 0;
  while (guard < 10) {
    guard += 1;
    const metrics = getMediaRegionMetrics(contentEl, figure);
    if (!metrics || metrics.extra >= minTotal - 1) return;

    const current = Number.parseFloat(img.style.maxHeight || "0");
    if (!Number.isFinite(current) || current <= 72) return;
    const shortage = minTotal - metrics.extra;
    const next = Math.max(72, Math.floor(current - Math.max(6, shortage / 2)));
    if (next >= current) return;
    img.style.maxHeight = `${next}px`;
    if (slideOverflows(innerEl, contentEl, [figure])) {
      img.style.maxHeight = `${Math.max(72, next - 8)}px`;
    }
  }
}

function getMediaRegionMetrics(content, mediaBlock) {
  if (!content || !mediaBlock) return null;
  const contentRect = content.getBoundingClientRect();
  const blockRect = mediaBlock.getBoundingClientRect();
  if (!contentRect.height || !blockRect.height) return null;

  const prev = mediaBlock.previousElementSibling;
  const next = mediaBlock.nextElementSibling;
  const regionTop = prev ? prev.getBoundingClientRect().bottom : contentRect.top;
  const regionBottom = next ? next.getBoundingClientRect().top : contentRect.bottom;
  const regionHeight = Math.max(0, regionBottom - regionTop);

  const styles = getComputedStyle(mediaBlock);
  const currentMarginTop = Number.parseFloat(styles.marginTop) || 0;
  const currentMarginBottom = Number.parseFloat(styles.marginBottom) || 0;
  const mediaCoreHeight = Math.max(0, blockRect.height - currentMarginTop - currentMarginBottom);
  const extra = Math.max(0, regionHeight - mediaCoreHeight);
  return { extra, regionHeight, mediaCoreHeight };
}

function applyFigureBlockScale(figures, scale) {
  for (const figure of figures) {
    const img = figure.querySelector("img");
    if (!img) continue;
    figure.style.height = "";
    figure.style.setProperty("--figure-scale", String(scale));
    const pct = Math.max(8, Math.min(96, 96 * scale));
    img.style.width = `${pct}%`;
  }
}

function slideOverflows(innerEl, contentEl, figures = []) {
  const logicalOverflow =
    innerEl.scrollHeight > innerEl.clientHeight + 2 ||
    contentEl.scrollHeight > contentEl.clientHeight + 2 ||
    innerEl.scrollWidth > innerEl.clientWidth + 2 ||
    contentEl.scrollWidth > contentEl.clientWidth + 2;
  if (logicalOverflow) return true;

  if (!figures.length) return false;
  return figuresOverflowVisually(contentEl, figures);
}

function figuresOverflowVisually(contentEl, figures) {
  const contentRect = contentEl.getBoundingClientRect();
  const pad = 2;

  for (const figure of figures) {
    const rect = figure.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    if (
      rect.left < contentRect.left - pad ||
      rect.right > contentRect.right + pad ||
      rect.top < contentRect.top - pad ||
      rect.bottom > contentRect.bottom + pad
    ) {
      return true;
    }
  }
  return false;
}

function logSlideLayoutDebug(slideEl, innerEl, contentEl) {
  if (!state.debugLayout) return;

  const slideIndex = Number(slideEl.dataset.index ?? -1);
  const title = slideEl.querySelector(".slide__header h2")?.textContent?.trim() || "(untitled)";
  const innerOverflow = Math.round((innerEl.scrollHeight - innerEl.clientHeight) * 10) / 10;
  const contentOverflow = Math.round((contentEl.scrollHeight - contentEl.clientHeight) * 10) / 10;
  const classes = Array.from(slideEl.classList).filter((c) => c.startsWith("fit-"));
  const dynamicImageMaxH = getComputedStyle(slideEl).getPropertyValue("--dynamic-image-max-h").trim() || "-";

  const figures = Array.from(slideEl.querySelectorAll(".md-figure")).map((figure, i) => {
    const figRect = figure.getBoundingClientRect();
    const inner = figure.querySelector(".md-figure__inner");
    const img = figure.querySelector("img");
    const caption = figure.querySelector(".md-figure__caption");
    const imgRect = img?.getBoundingClientRect();
    const capRect = caption?.getBoundingClientRect();
    const scale = Number.parseFloat(getComputedStyle(figure).getPropertyValue("--figure-scale") || "1");

    return {
      idx: i + 1,
      scale: Number.isFinite(scale) ? Number(scale.toFixed(3)) : null,
      figureW: round1(figRect.width),
      figureH: round1(figRect.height),
      innerH: round1(inner?.getBoundingClientRect().height || 0),
      imgW: round1(imgRect?.width || 0),
      imgH: round1(imgRect?.height || 0),
      captionH: round1(capRect?.height || 0),
      captionText: (caption?.textContent || "").slice(0, 60),
    };
  });
  const groups = Array.from(slideEl.querySelectorAll(".md-figure-group")).map((group, i) => ({
    idx: i + 1,
    cols: group.dataset.cols || getComputedStyle(group).getPropertyValue("--figure-group-cols").trim() || "-",
    itemCount: group.querySelectorAll(":scope > .md-figure").length,
    w: round1(group.getBoundingClientRect().width),
    h: round1(group.getBoundingClientRect().height),
  }));

  console.groupCollapsed(
    `[layout] slide ${slideIndex + 1} "${title}" | innerOv=${innerOverflow}px contentOv=${contentOverflow}px | ${classes.join(",") || "fit:none"} | dynImg=${dynamicImageMaxH}`
  );
  console.log("slide", {
    index: slideIndex + 1,
    title,
    isActive: slideEl.classList.contains("is-active"),
    isTitleSlide: slideEl.classList.contains("slide--title"),
    slideClient: {
      w: round1(slideEl.clientWidth),
      h: round1(slideEl.clientHeight),
    },
    innerClient: {
      w: round1(innerEl.clientWidth),
      h: round1(innerEl.clientHeight),
    },
    contentClient: {
      w: round1(contentEl.clientWidth),
      h: round1(contentEl.clientHeight),
    },
    innerScrollH: round1(innerEl.scrollHeight),
    contentScrollH: round1(contentEl.scrollHeight),
    innerOverflow,
    contentOverflow,
    fitClasses: classes,
    dynamicImageMaxH,
    figureCount: figures.length,
    figureGroupCount: groups.length,
  });
  if (groups.length) {
    console.table(groups);
  }
  if (figures.length) {
    console.table(figures);
  }
  console.groupEnd();
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function resolveFolderAssetUrl(rawSrc, markdownPath) {
  if (!state.folderContext) return rawSrc;
  if (/^(https?:|data:|blob:|\/)/i.test(rawSrc)) return rawSrc;

  const withoutHash = rawSrc.split("#")[0];
  const withoutQuery = withoutHash.split("?")[0];
  const decoded = safeDecodeURIComponent(withoutQuery);

  const markdownDir = dirname(markdownPath);
  const candidates = [
    normalizePath(joinPath(markdownDir, decoded)),
    normalizePath(decoded),
    stripRootFolder(normalizePath(joinPath(markdownDir, decoded))),
    stripRootFolder(normalizePath(decoded)),
  ];

  for (const candidate of candidates) {
    const file = state.folderContext.fileByPath.get(candidate);
    if (file) {
      return state.folderContext.objectUrlByFile.get(file) || rawSrc;
    }
  }

  return rawSrc;
}

function isMarkdownFile(name) {
  return /\.md$/i.test(name);
}

function normalizePath(path) {
  const parts = path.replace(/\\/g, "/").split("/");
  const stack = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}

function dirname(path) {
  const normalized = normalizePath(path);
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? "" : normalized.slice(0, idx);
}

function joinPath(base, relative) {
  if (!base) return relative;
  return `${base}/${relative}`;
}

function stripRootFolder(path) {
  const normalized = normalizePath(path);
  const idx = normalized.indexOf("/");
  return idx === -1 ? normalized : normalized.slice(idx + 1);
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
