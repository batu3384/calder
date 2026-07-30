const SCROLL_STEP = 160;

function updateScrollButtonState(
  tabListEl: HTMLElement,
  prevBtn: HTMLButtonElement,
  nextBtn: HTMLButtonElement,
): void {
  const maxScroll = Math.max(0, tabListEl.scrollWidth - tabListEl.clientWidth);
  const canScroll = maxScroll > 2;
  prevBtn.hidden = !canScroll;
  nextBtn.hidden = !canScroll;
  if (!canScroll) return;
  prevBtn.disabled = tabListEl.scrollLeft <= 2;
  nextBtn.disabled = tabListEl.scrollLeft >= maxScroll - 2;
}

/** Horizontal tab-rail scroll: chevrons + shift-wheel / trackpad. */
export function wireTabBarScrollControls(tabListEl: HTMLElement): void {
  const prevBtn = document.getElementById('tab-scroll-prev') as HTMLButtonElement | null;
  const nextBtn = document.getElementById('tab-scroll-next') as HTMLButtonElement | null;
  if (!prevBtn || !nextBtn) return;

  const sync = () => updateScrollButtonState(tabListEl, prevBtn, nextBtn);

  prevBtn.addEventListener('click', () => {
    tabListEl.scrollBy({ left: -SCROLL_STEP, behavior: 'smooth' });
  });
  nextBtn.addEventListener('click', () => {
    tabListEl.scrollBy({ left: SCROLL_STEP, behavior: 'smooth' });
  });

  tabListEl.addEventListener(
    'wheel',
    (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (tabListEl.scrollWidth <= tabListEl.clientWidth + 2) return;
      event.preventDefault();
      tabListEl.scrollLeft += event.deltaY;
      sync();
    },
    { passive: false },
  );

  tabListEl.addEventListener('scroll', sync, { passive: true });

  const observer = new ResizeObserver(sync);
  observer.observe(tabListEl);

  const mutation = new MutationObserver(sync);
  mutation.observe(tabListEl, { childList: true, subtree: true });

  requestAnimationFrame(sync);
}
