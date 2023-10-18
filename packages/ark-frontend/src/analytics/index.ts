import axios, { Axios } from 'axios';

type Event = {
  type: string;
  payload: any;
};

type UIEvent = {
  type: string;
  clientTimestampInUtc?: string;
  payload?: any;
};

const allowedEventTypes = [
  'button_click',
  'page_view',
  'scroll',
  'mouse-move',
  'other',
];
const SCROLL_COVERAGE_THRESHOLD = 3;

class ScrollTracker {
  elem: Element | Window;
  lastScrollTop: number = 0;
  lastScrollLeft: number = 0;
  lastVerticalCoverage: number = 0;
  lastHorizontalCoverage: number = 0;
  debounceTimer: any;
  analytics: Analytics;

  constructor(elem: Element | Window, analytics: Analytics) {
    this.analytics = analytics;
    this.elem = elem;
    this.handler = this.handler.bind(this);

    const initialValue = this.getInfo();

    this.lastScrollTop = initialValue.scrollTop;
    this.lastScrollLeft = initialValue.scrollLeft;

    this.lastVerticalCoverage = initialValue.verticalCoverage;
    this.lastHorizontalCoverage = initialValue.horizontalCoverage;

    this.elem.addEventListener('scroll', this.handler);
  }

  getInfo() {
    let tag: string = '';
    let id: string = '';
    let scrollTop = 0;
    let scrollLeft = 0;
    let scrollHeight = 0;
    let scrollWidth = 0;
    let viewportWidth = 0;
    let viewportHeight = 0;
    let horizontalCoverage = 0;
    let verticalCoverage = 0;

    try {
      tag = (this?.elem as any)?.tagName || 'window';
      id = (this?.elem as any)?.id;
      scrollTop = 0;
      scrollLeft = 0;

      switch (tag) {
        case 'window': {
          viewportWidth = globalThis?.window?.innerWidth;
          viewportHeight = globalThis?.window?.innerHeight;
          scrollTop = (this?.elem as any)?.scrollY;
          scrollLeft = (this?.elem as any)?.scrollX;
          scrollWidth = globalThis?.window?.document?.body?.scrollWidth;
          scrollHeight = globalThis?.window?.document?.body?.scrollHeight;
          break;
        }
        default: {
          viewportWidth = (this?.elem as any)?.clientWidth;
          viewportHeight = (this?.elem as any)?.clientHeight;
          scrollTop = (this?.elem as any)?.scrollTop;
          scrollLeft = (this?.elem as any)?.scrollLeft;
          scrollWidth = (this?.elem as any)?.scrollWidth;
          scrollHeight = (this?.elem as any)?.scrollHeight;
          break;
        }
      }

      verticalCoverage = this.calculateCoverage(
        scrollTop,
        viewportHeight,
        scrollHeight
      );
      horizontalCoverage = this.calculateCoverage(
        scrollLeft,
        viewportWidth,
        scrollWidth
      );
    } catch (e) {
      console.error(e);
    }

    return {
      tag,
      id,
      scrollTop,
      scrollLeft,
      scrollHeight,
      scrollWidth,
      viewportWidth,
      viewportHeight,
      verticalCoverage,
      horizontalCoverage,
    };
  }

  calculateCoverage(
    scrollPosition: number,
    screenSize: number,
    scrollSize: number
  ) {
    const currentOffset = scrollPosition + screenSize;
    const percentile = parseFloat(
      ((currentOffset / scrollSize) * 100).toFixed(2)
    );
    return percentile;
  }

  handler() {
    clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      try {
        const {
          tag,
          id,
          scrollTop,
          scrollLeft,
          scrollWidth,
          scrollHeight,
          viewportWidth,
          viewportHeight,
          verticalCoverage,
          horizontalCoverage,
        } = this.getInfo();

        let yDirection: 'up' | 'down' | 'none' = 'none';
        let yDiff = scrollTop - this.lastScrollTop;
        if (scrollTop !== this.lastScrollTop) {
          if (yDiff > 0) {
            yDirection = 'down';
          } else {
            yDirection = 'up';
          }
        }

        let xDirection: 'left' | 'right' | 'none' = 'none';
        let xDiff = scrollLeft - this.lastScrollLeft;
        if (scrollLeft !== this.lastScrollLeft) {
          if (xDiff > 0) {
            xDirection = 'right';
          } else {
            xDirection = 'left';
          }
        }

        const hDiff = Math.abs(
          horizontalCoverage - this.lastHorizontalCoverage
        );
        const vDiff = Math.abs(verticalCoverage - this.lastVerticalCoverage);
        const shouldRecord =
          hDiff > SCROLL_COVERAGE_THRESHOLD ||
          vDiff > SCROLL_COVERAGE_THRESHOLD ||
          (verticalCoverage === 100 && horizontalCoverage === 100);

        if (shouldRecord === true) {
          const horizontalCoverageChanged = hDiff > SCROLL_COVERAGE_THRESHOLD;
          const verticalCoverageChanged = vDiff > SCROLL_COVERAGE_THRESHOLD;

          if (horizontalCoverageChanged === true) {
            this.lastHorizontalCoverage = horizontalCoverage;
          }

          if (verticalCoverageChanged === true) {
            this.lastVerticalCoverage = verticalCoverage;
          }

          this.analytics.trackEvent({
            type: 'scroll',
            clientTimestampInUtc: new Date().toISOString(),
            payload: {
              title: globalThis?.window?.document?.title,
              url: globalThis?.window?.location?.href,
              tag,
              id,
              scrollTop,
              scrollLeft,
              scrollWidth,
              scrollHeight,
              viewportWidth,
              viewportHeight,
              verticalCoverage,
              horizontalCoverage,
              yDirection,
              xDirection,
              horizontalCoverageChanged,
              verticalCoverageChanged,
            },
          });
        }

        this.lastScrollTop = scrollTop;
        this.lastScrollLeft = scrollLeft;
      } catch (e) {
        console.error(e);
      }
    }, 1000);
  }

  destroy() {
    try {
      this.elem.removeEventListener('scroll', this.handler);
    } catch (e) {
      console.error(e);
    }
  }
}

export class Analytics {
  static instance: Analytics;
  static getInstance() {
    if (!Analytics.instance) {
      Analytics.instance = new Analytics();
    }

    return Analytics.instance;
  }

  client: Axios;
  events: Event[] = [];
  running: boolean = false;
  scrollTrackers: ScrollTracker[] = [];
  bodyScrollTracker: ScrollTracker;

  constructor() {
    this.mouseMoveDetectionHandler = this.mouseMoveDetectionHandler.bind(this);

    this.client = axios.create();
    const window = this.getBody();
    if (window) {
      this.bodyScrollTracker = new ScrollTracker(window, this);
    }
  }

  getBody() {
    try {
      return global?.window;
    } catch (e) {
      return undefined;
    }
  }

  getWindowTitle(): string {
    try {
      return global?.window?.document?.title;
    } catch (e) {
      return undefined;
    }
  }

  getWindowLocationHref(): string {
    try {
      return global?.window?.location?.href;
    } catch (e) {
      return undefined;
    }
  }

  trackScroll() {
    try {
      for (const tracker of this.scrollTrackers) {
        tracker.destroy();
      }

      this.scrollTrackers = [];

      if (global?.window) {
        const window = global?.window;
        const elements = window.document.getElementsByClassName(
          'analytics-scroll-target'
        );
        let i: number;
        for (i = 0; i < elements.length; i++) {
          const elem = elements.item(i);
          this.scrollTrackers.push(new ScrollTracker(elem, this));
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  mouseMoveDebouncer: any = null;

  mouseMoveDetectionHandler(ev: MouseEvent) {
    clearTimeout(this.mouseMoveDebouncer);
    this.mouseMoveDebouncer = setTimeout(() => {
      this.trackEvent({
        type: 'mouse-move',
        clientTimestampInUtc: new Date().toISOString(),
        payload: {
          title: this.getWindowTitle(),
          url: this.getWindowLocationHref(),
          x: ev?.x,
          y: ev?.y,
        },
      });
    }, 12 * 1000);
  }

  trackMouseMovement() {
    try {
      if (global?.window) {
        global.window.addEventListener(
          'mousemove',
          this.mouseMoveDetectionHandler
        );
      }
    } catch (e) {}
  }

  async initialise() {
    try {
      this.running = true;
      let tid = undefined;

      try {
        const url = new URL(global?.window?.location.href);
        if (url.searchParams.has('tid')) {
          tid = url.searchParams.get('tid');
        }
      } catch (e) {
        console.error(e);
      }

      await this.client.post('/api/v1/analytics', {
        tid,
      });

      this.trackMouseMovement();

      let lastTitle = undefined;
      let lastUrl = undefined;

      while (this.running === true) {
        const newTitle = this.getWindowTitle();
        const newUrl = this.getWindowLocationHref();

        const hasTitleChanged = Boolean(newTitle) && lastTitle !== newTitle;
        const hasURLChanged = Boolean(newUrl) && lastUrl !== newUrl;

        if (hasTitleChanged === true || hasURLChanged === true) {
          this.trackScroll();

          this.trackEvent({
            type: 'page_view',
            payload: {
              lastTitle,
              lastUrl,
              title: newTitle,
              href: newUrl,
              hasTitleChanged,
              hasURLChanged,
            },
          });

          if (hasTitleChanged === true) {
            lastTitle = newTitle;
          }

          if (hasURLChanged === true) {
            lastUrl = newUrl;
          }
        }

        const events = this.events.splice(0, this.events.length);
        if (events.length > 0) {
          await this.client.post('/api/v1/analytics', {
            events,
          });
        }

        await new Promise<void>((r) => setTimeout(() => r(), 1000));
      }
    } catch (e) {
      console.error(e);
    }
  }

  setUser(id: string, payload: any) {
    this.events.unshift({
      type: 'setUser',
      payload: {
        id,
        payload,
      },
    });
  }

  unsetUser() {
    this.events.unshift({
      type: 'unsetUser',
      payload: null,
    });
  }

  trackEvent(ev: UIEvent) {
    if (allowedEventTypes.indexOf(ev?.type) < 0) {
      throw new Error(
        `${
          ev?.type
        } is not allowed. Only allowed types are ${allowedEventTypes.join(
          ', '
        )}`
      );
    }
    this.events.unshift({
      type: 'trackEvent',
      payload: ev,
    });
  }
}

export const analytics = Analytics.getInstance();
