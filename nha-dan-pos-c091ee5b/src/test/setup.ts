import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

/** Embla carousel uses IntersectionObserver in jsdom tests (HeroSlider, HotProductsCarousel, …). */
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  readonly root: Element | Document | null = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];
}
Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  configurable: true,
  value: IntersectionObserverStub,
});

/** Embla carousel resize handler expects ResizeObserver in jsdom. */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  configurable: true,
  value: ResizeObserverStub,
});
