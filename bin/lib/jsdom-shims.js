/* eslint-disable @typescript-eslint/no-empty-function, max-classes-per-file, no-param-reassign */

// TODO: some of these shims may not be needed anymore because of updates to jsdom

// Add canvas mock based on this comment: https://github.com/jsdom/jsdom/issues/1782#issuecomment-337656878
function mockCanvas(window) {
  window.HTMLCanvasElement.prototype.getContext = () => ({
    fillRect: () => ({}),
    clearRect: () => ({}),
    getImageData: (x, y, w, h) => ({ data: new Array(w * h * 4) }),
    putImageData: () => ({}),
    createImageData: () => [],
    setTransform: () => ({}),
    drawImage: () => ({}),
    save: () => ({}),
    fillText: () => ({}),
    restore: () => ({}),
    beginPath: () => ({}),
    moveTo: () => ({}),
    lineTo: () => ({}),
    closePath: () => ({}),
    stroke: () => ({}),
    translate: () => ({}),
    scale: () => ({}),
    rotate: () => ({}),
    arc: () => ({}),
    fill: () => ({}),
    measureText: () => ({ width: 0 }),
    transform: () => ({}),
    rect: () => ({}),
    clip: () => ({}),
  });

  window.HTMLCanvasElement.prototype.toDataURL = () => '';
}

// issue: https://github.com/chromaui/chromatic-cli/issues/27
// solution found here: https://github.com/facebook/jest/issues/5379#issuecomment-360044161
// not incuded in jsdom yet: https://github.com/jsdom/jsdom/issues/2128
const svgElements = [
  'SVGAElement',
  'SVGAltGlyphElement',
  'SVGAngle',
  'SVGAnimateColorElement',
  'SVGAnimateElement',
  'SVGAnimateMotionElement',
  'SVGAnimateTransformElement',
  'SVGAnimatedAngle',
  'SVGAnimatedBoolean',
  'SVGAnimatedEnumeration',
  'SVGAnimatedInteger',
  'SVGAnimatedLength',
  'SVGAnimatedLengthList',
  'SVGAnimatedNumber',
  'SVGAnimatedNumberList',
  'SVGAnimatedPoints',
  'SVGAnimatedPreserveAspectRatio',
  'SVGAnimatedRect',
  'SVGAnimatedString',
  'SVGAnimatedTransformList',
  'SVGAnimationElement',
  'SVGCircleElement',
  'SVGClipPathElement',
  'SVGComponentTransferFunctionElement',
  'SVGCursorElement',
  'SVGDefsElement',
  'SVGDescElement',
  'SVGDocument',
  'SVGElement',
  'SVGEllipseElement',
  'SVGFEBlendElement',
  'SVGFEColorMatrixElement',
  'SVGFEComponentTransferElement',
  'SVGFECompositeElement',
  'SVGFEConvolveMatrixElement',
  'SVGFEDiffuseLightingElement',
  'SVGFEDisplacementMapElement',
  'SVGFEDistantLightElement',
  'SVGFEDropShadowElement',
  'SVGFEFloodElement',
  'SVGFEFuncAElement',
  'SVGFEFuncBElement',
  'SVGFEFuncGElement',
  'SVGFEFuncRElement',
  'SVGFEGaussianBlurElement',
  'SVGFEImageElement',
  'SVGFEMergeElement',
  'SVGFEMergeNodeElement',
  'SVGFEMorphologyElement',
  'SVGFEOffsetElement',
  'SVGFEPointLightElement',
  'SVGFESpecularLightingElement',
  'SVGFESpotLightElement',
  'SVGFETileElement',
  'SVGFETurbulenceElement',
  'SVGFilterElement',
  'SVGFilterPrimitiveStandardAttributes',
  'SVGFontElement',
  'SVGFontFaceElement',
  'SVGFontFaceFormatElement',
  'SVGFontFaceNameElement',
  'SVGFontFaceSrcElement',
  'SVGFontFaceUriElement',
  'SVGForeignObjectElement',
  'SVGGElement',
  'SVGGlyphElement',
  'SVGGradientElement',
  'SVGGraphicsElement',
  'SVGHKernElement',
  'SVGImageElement',
  'SVGLength',
  'SVGLengthList',
  'SVGLineElement',
  'SVGLinearGradientElement',
  'SVGMPathElement',
  'SVGMaskElement',
  'SVGMatrix',
  'SVGMetadataElement',
  'SVGMissingGlyphElement',
  'SVGNumber',
  'SVGNumberList',
  'SVGPathElement',
  'SVGPatternElement',
  'SVGPoint',
  'SVGPolylineElement',
  'SVGPreserveAspectRatio',
  'SVGRadialGradientElement',
  'SVGRect',
  'SVGRectElement',
  'SVGSVGElement',
  'SVGScriptElement',
  'SVGSetElement',
  'SVGStopElement',
  'SVGStringList',
  'SVGStylable',
  'SVGStyleElement',
  'SVGSwitchElement',
  'SVGSymbolElement',
  'SVGTRefElement',
  'SVGTSpanElement',
  'SVGTests',
  'SVGTextContentElement',
  'SVGTextElement',
  'SVGTextPathElement',
  'SVGTextPositioningElement',
  'SVGTitleElement',
  'SVGTransform',
  'SVGTransformList',
  'SVGTransformable',
  'SVGURIReference',
  'SVGUnitTypes',
  'SVGUseElement',
  'SVGVKernElement',
  'SVGViewElement',
  'SVGZoomAndPan',
];

export function addShimsToJSDOM(window) {
  Object.defineProperty(window, 'matchMedia', {
    value: () => ({
      matches: true,
      addListener: () => {},
      removeListener: () => {},
    }),
    writable: true,
  });

  class LocalStorageMock {
    constructor() {
      this.store = {};
    }

    getItem(key) {
      return this.store[key];
    }

    removeItem(key) {
      delete this.store[key];
    }

    setItem(key, value) {
      this.store[key] = value.toString();
    }

    clear() {
      this.store = {};
    }
  }
  Object.defineProperty(window, 'localStorage', {
    value: new LocalStorageMock(),
    writable: true,
  });

  class WorkerMock {
    addEventListener() {}

    removeEventLister() {}

    postMessage() {}

    terminate() {}
  }
  Object.defineProperty(window, 'Worker', {
    value: WorkerMock,
    writable: true,
  });

  Object.defineProperty(window, 'crypto', {
    value: {
      getRandomValues: () => 0,
    },
    writable: true,
  });

  Object.defineProperty(window.navigator, 'mimeTypes', {
    value: () => [],
    writable: true,
  });

  Object.defineProperty(window.URL, 'createObjectURL', { value: () => {} });
  Object.defineProperty(window.URL, 'revokeObjectURL', { value: () => {} });

  // We have to do this in this screwy way because Angular does some monkey patching
  // expects an non-es2015 class here.
  function MutationObserverMock() {}
  MutationObserverMock.prototype = {
    observe() {
      return [];
    },
    takeRecords() {
      return [];
    },
    disconnect() {},
  };

  Object.defineProperty(window, 'MutationObserver', {
    value: MutationObserverMock,
    writable: true,
  });

  svgElements.forEach(e => {
    if (!window[e]) {
      const Value = class extends window.HTMLElement {};
      Value.name = e;

      Object.defineProperty(window, e, {
        value: Value,
        writable: true,
      });
    }
  });

  class IntlMock {
    static supportedLocalesOf() {
      return [];
    }

    resolvedOptions() {
      return {};
    }
  }
  class IntlFormatMock extends IntlMock {
    format() {
      return '';
    }

    formatToParts() {
      return [];
    }
  }
  class IntlCollatorMock extends IntlMock {
    compare() {
      return 0;
    }
  }
  class IntlPluralRulesMock extends IntlMock {
    select() {
      return '';
    }
  }
  class IntlDateTimeFormatMock extends IntlFormatMock {}
  class IntlListFormatMock extends IntlFormatMock {}
  class IntlNumberFormatMock extends IntlFormatMock {}
  class IntlRelativeTimeFormatMock extends IntlFormatMock {}
  Object.defineProperty(window, 'Intl', {
    value: {
      Collator: IntlCollatorMock,
      DateTimeFormat: IntlDateTimeFormatMock,
      ListFormat: IntlListFormatMock,
      NumberFormat: IntlNumberFormatMock,
      PluralRules: IntlPluralRulesMock,
      RelativeTimeFormat: IntlRelativeTimeFormatMock,
    },
    writable: true,
  });

  const customElements = {};
  Object.defineProperty(window, 'customElements', {
    value: {
      define: (name, constructor) => {
        customElements[name] = customElements[name] || { resolvers: [] };
        customElements[name].constructor = constructor;
        customElements[name].resolvers.forEach(resolve => resolve());
      },
      get: name => customElements[name] && customElements[name].constructor,
      upgrade: () => {},
      whenDefined: name =>
        new Promise(resolve => {
          customElements[name] = customElements[name] || { resolvers: [] };
          if (customElements[name].constructor) resolve();
          else customElements[name].resolvers.push(resolve);
        }),
    },
    writable: false,
  });

  mockCanvas(window);
}
