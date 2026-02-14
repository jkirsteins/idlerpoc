import type { GameData } from '../models';
import type { Component } from './component';
import {
  GAMEPEDIA_ARTICLES,
  GAMEPEDIA_CATEGORIES,
  type GamepediaArticle,
  type GamepediaCategory,
} from '../gamepediaData';

/** Regex matching `[[article-id|display text]]` inline cross-reference links. */
const LINK_RE = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;

/**
 * In-game encyclopedia inspired by Civilization's Civilopedia.
 *
 * Layout: sidebar (search + category list) | main area (article content).
 * All interactive elements are created once and mutated in-place to
 * preserve scroll position and focus state across ticks.
 */
export function createGamepediaTab(
  _gameData: GameData,
  initialArticleId?: string,
  onBack?: () => void
): Component & { navigateTo?: (articleId: string) => void } {
  const container = document.createElement('div');
  container.className = 'gamepedia-tab';

  // ── State ────────────────────────────────────────────────
  let selectedArticleId: string | null = initialArticleId ?? null;
  let searchQuery = '';
  let selectedCategory: GamepediaCategory | null = null;

  // ── Sidebar ──────────────────────────────────────────────
  const sidebar = document.createElement('div');
  sidebar.className = 'gamepedia-sidebar';

  // Mobile header (back button, hidden on desktop)
  const mobileHeader = document.createElement('div');
  mobileHeader.className = 'gamepedia-mobile-header';

  const backBtn = document.createElement('button');
  backBtn.className = 'gamepedia-back-btn';
  backBtn.innerHTML = '← Back to Game';
  backBtn.addEventListener('click', () => {
    if (onBack) onBack();
  });
  mobileHeader.appendChild(backBtn);
  sidebar.appendChild(mobileHeader);

  // Title
  const title = document.createElement('h3');
  title.className = 'gamepedia-title';
  title.textContent = 'Gamepedia';
  sidebar.appendChild(title);

  // Search bar
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'gamepedia-search';
  searchInput.placeholder = 'Search articles...';
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.toLowerCase();
    rebuildTopicList();
  });
  sidebar.appendChild(searchInput);

  // Category filter bar
  const categoryBar = document.createElement('div');
  categoryBar.className = 'gamepedia-category-bar';

  const allBtn = document.createElement('button');
  allBtn.className = 'gamepedia-cat-btn active';
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => {
    selectedCategory = null;
    updateCategoryButtons();
    rebuildTopicList();
  });
  categoryBar.appendChild(allBtn);

  const categoryButtons: Array<{
    btn: HTMLButtonElement;
    cat: GamepediaCategory | null;
  }> = [{ btn: allBtn, cat: null }];

  for (const cat of GAMEPEDIA_CATEGORIES) {
    const btn = document.createElement('button');
    btn.className = 'gamepedia-cat-btn';
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      selectedCategory = cat;
      updateCategoryButtons();
      rebuildTopicList();
    });
    categoryBar.appendChild(btn);
    categoryButtons.push({ btn, cat });
  }

  sidebar.appendChild(categoryBar);

  // Topic list (scrollable)
  const topicList = document.createElement('div');
  topicList.className = 'gamepedia-topic-list';
  sidebar.appendChild(topicList);

  // ── Main content area ────────────────────────────────────
  const mainArea = document.createElement('div');
  mainArea.className = 'gamepedia-main';

  container.appendChild(sidebar);
  container.appendChild(mainArea);

  // ── Helpers ──────────────────────────────────────────────

  function updateCategoryButtons(): void {
    for (const { btn, cat } of categoryButtons) {
      if (cat === selectedCategory) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  }

  function getFilteredArticles(): GamepediaArticle[] {
    return GAMEPEDIA_ARTICLES.filter((a) => {
      if (selectedCategory && a.category !== selectedCategory) return false;
      if (searchQuery) {
        const haystack = (
          a.title +
          ' ' +
          a.summary +
          ' ' +
          a.category
        ).toLowerCase();
        return haystack.includes(searchQuery);
      }
      return true;
    });
  }

  function rebuildTopicList(): void {
    const filtered = getFilteredArticles();
    while (topicList.firstChild) topicList.removeChild(topicList.firstChild);

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'gamepedia-empty';
      empty.textContent = 'No matching articles.';
      topicList.appendChild(empty);
      return;
    }

    // Group by category
    const grouped = new Map<string, GamepediaArticle[]>();
    for (const article of filtered) {
      const list = grouped.get(article.category) ?? [];
      list.push(article);
      grouped.set(article.category, list);
    }

    for (const [category, articles] of grouped) {
      const catHeader = document.createElement('div');
      catHeader.className = 'gamepedia-list-category';
      catHeader.textContent = category;
      topicList.appendChild(catHeader);

      for (const article of articles) {
        const item = document.createElement('button');
        item.className = 'gamepedia-topic-item';
        if (article.id === selectedArticleId) {
          item.classList.add('selected');
        }

        const titleEl = document.createElement('div');
        titleEl.className = 'gamepedia-topic-title';
        titleEl.textContent = article.title;

        const summaryEl = document.createElement('div');
        summaryEl.className = 'gamepedia-topic-summary';
        summaryEl.textContent = article.summary;

        item.appendChild(titleEl);
        item.appendChild(summaryEl);

        item.addEventListener('click', () => {
          selectArticle(article.id);
        });

        topicList.appendChild(item);
      }
    }
  }

  /**
   * Parse text containing `[[article-id|display text]]` links and append
   * the resulting text nodes and link elements to a parent element.
   */
  function renderRichText(parent: HTMLElement, text: string): void {
    let lastIndex = 0;
    LINK_RE.lastIndex = 0; // reset global regex state
    let match: RegExpExecArray | null;
    while ((match = LINK_RE.exec(text)) !== null) {
      // Append plain text before the link
      if (match.index > lastIndex) {
        parent.appendChild(
          document.createTextNode(text.slice(lastIndex, match.index))
        );
      }
      const articleId = match[1];
      const displayText = match[2];
      const link = document.createElement('button');
      link.className = 'gamepedia-see-also-link';
      link.textContent = displayText;
      link.addEventListener('click', () => selectArticle(articleId));
      parent.appendChild(link);
      lastIndex = LINK_RE.lastIndex;
    }
    // Append remaining text after last link
    if (lastIndex < text.length) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function selectArticle(articleId: string): void {
    selectedArticleId = articleId;
    rebuildTopicList();
    rebuildArticle();
    // Scroll to article title (or top for welcome screen)
    if (selectedArticleId) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        const titleEl = mainArea.querySelector('.gamepedia-article-title');
        if (titleEl) {
          titleEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          mainArea.scrollTop = 0;
        }
      });
    } else {
      mainArea.scrollTop = 0;
    }
  }

  function rebuildArticle(): void {
    while (mainArea.firstChild) mainArea.removeChild(mainArea.firstChild);

    if (!selectedArticleId) {
      // Welcome / landing state
      const welcome = document.createElement('div');
      welcome.className = 'gamepedia-welcome';

      const welcomeTitle = document.createElement('h2');
      welcomeTitle.textContent = 'Gamepedia';
      welcome.appendChild(welcomeTitle);

      const welcomeText = document.createElement('p');
      welcomeText.textContent =
        'Select an article from the list, or use the search bar to find what you need. The Gamepedia explains all game mechanics, systems, and strategies.';
      welcome.appendChild(welcomeText);

      // Quick links by category
      for (const cat of GAMEPEDIA_CATEGORIES) {
        const catArticles = GAMEPEDIA_ARTICLES.filter(
          (a) => a.category === cat
        );
        const section = document.createElement('div');
        section.className = 'gamepedia-welcome-section';

        const catTitle = document.createElement('h4');
        catTitle.textContent = cat;
        section.appendChild(catTitle);

        const linkList = document.createElement('div');
        linkList.className = 'gamepedia-welcome-links';
        for (const article of catArticles) {
          const link = document.createElement('button');
          link.className = 'gamepedia-link';
          link.textContent = article.title;
          link.addEventListener('click', () => selectArticle(article.id));
          linkList.appendChild(link);
        }
        section.appendChild(linkList);
        welcome.appendChild(section);
      }

      mainArea.appendChild(welcome);
      return;
    }

    const article = GAMEPEDIA_ARTICLES.find((a) => a.id === selectedArticleId);
    if (!article) return;

    // Breadcrumb
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'gamepedia-breadcrumb';

    const homeLink = document.createElement('button');
    homeLink.className = 'gamepedia-link';
    homeLink.textContent = 'Gamepedia';
    homeLink.addEventListener('click', () => {
      selectedArticleId = null;
      rebuildTopicList();
      rebuildArticle();
    });
    breadcrumb.appendChild(homeLink);

    const separator = document.createElement('span');
    separator.textContent = ' > ';
    separator.style.color = 'var(--text-disabled)';
    breadcrumb.appendChild(separator);

    const catLink = document.createElement('button');
    catLink.className = 'gamepedia-link';
    catLink.textContent = article.category;
    catLink.addEventListener('click', () => {
      selectedCategory = article.category;
      selectedArticleId = null;
      updateCategoryButtons();
      rebuildTopicList();
      rebuildArticle();
    });
    breadcrumb.appendChild(catLink);

    const sep2 = document.createElement('span');
    sep2.textContent = ' > ';
    sep2.style.color = 'var(--text-disabled)';
    breadcrumb.appendChild(sep2);

    const current = document.createElement('span');
    current.textContent = article.title;
    current.style.color = 'var(--text-primary)';
    breadcrumb.appendChild(current);

    mainArea.appendChild(breadcrumb);

    // Article title
    const articleTitle = document.createElement('h2');
    articleTitle.className = 'gamepedia-article-title';
    articleTitle.textContent = article.title;
    mainArea.appendChild(articleTitle);

    // Summary
    const summaryEl = document.createElement('p');
    summaryEl.className = 'gamepedia-article-summary';
    renderRichText(summaryEl, article.summary);
    mainArea.appendChild(summaryEl);

    // Sections
    for (const section of article.sections) {
      if (section.heading) {
        const heading = document.createElement('h3');
        heading.className = 'gamepedia-section-heading';
        heading.textContent = section.heading;
        mainArea.appendChild(heading);
      }

      for (const para of section.paragraphs) {
        if (para.trim() === '') continue;
        const p = document.createElement('p');
        p.className = 'gamepedia-paragraph';
        renderRichText(p, para);
        mainArea.appendChild(p);
      }

      if (section.table) {
        const table = document.createElement('table');
        table.className = 'gamepedia-table';

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        for (const h of section.table.headers) {
          const th = document.createElement('th');
          th.textContent = h;
          headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        for (const row of section.table.rows) {
          const tr = document.createElement('tr');
          for (const cell of row) {
            const td = document.createElement('td');
            renderRichText(td, cell);
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        mainArea.appendChild(table);
      }
    }

    // Related articles — plain inline links
    if (article.relatedArticles.length > 0) {
      const relatedSection = document.createElement('div');
      relatedSection.className = 'gamepedia-related';

      const relatedLabel = document.createElement('span');
      relatedLabel.className = 'gamepedia-related-label';
      relatedLabel.textContent = 'See also: ';
      relatedSection.appendChild(relatedLabel);

      let first = true;
      for (const relId of article.relatedArticles) {
        const relArticle = GAMEPEDIA_ARTICLES.find((a) => a.id === relId);
        if (!relArticle) continue;

        if (!first) {
          const sep = document.createTextNode(', ');
          relatedSection.appendChild(sep);
        }
        first = false;

        const link = document.createElement('button');
        link.className = 'gamepedia-see-also-link';
        link.textContent = relArticle.title;
        link.addEventListener('click', () => selectArticle(relId));
        relatedSection.appendChild(link);
      }

      mainArea.appendChild(relatedSection);
    }
  }

  // ── Initial render ───────────────────────────────────────
  rebuildTopicList();
  rebuildArticle();

  return {
    el: container,
    update(_gameData: GameData) {
      // Gamepedia content is static — no tick-based updates needed.
      // Interactive state (search, selection) is handled by event listeners.
    },
    navigateTo(articleId: string) {
      selectArticle(articleId);
    },
  };
}
