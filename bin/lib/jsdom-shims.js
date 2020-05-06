/* eslint-disable @typescript-eslint/no-empty-function, max-classes-per-file, no-param-reassign */

const alwaysFn = C => {
  // Search up the prototype chain until we hit base. The base class of Class has no name I guess.
  const classHierarchy = [];
  for (let curr = C; curr.name; curr = Object.getPrototypeOf(curr)) {
    classHierarchy.push(curr);
  }

  // Get all static methods defined on any ancestor
  const statics = classHierarchy
    .map(klass => Object.getOwnPropertyNames(klass))
    .reduce((a, b) => [...a, ...b], []) // flatten
    .filter(n => typeof C[n] === 'function')
    .reduce((acc, name) => {
      acc[name] = C[name];
      return acc;
    }, {});

  return Object.assign(
    // eslint-disable-next-line func-names
    function() {
      return new C();
    },
    C,
    statics
  );
};

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

function mockIntl(window) {
  if (!window.Intl) {
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
    class IntlNumberFormatMock extends IntlFormatMock {}
    class IntlListFormatMock extends IntlFormatMock {}
    class IntlRelativeTimeFormatMock extends IntlFormatMock {}
    Object.defineProperty(window, 'Intl', {
      value: {
        Collator: alwaysFn(IntlCollatorMock),
        DateTimeFormat: alwaysFn(IntlDateTimeFormatMock),
        ListFormat: alwaysFn(IntlListFormatMock),
        NumberFormat: alwaysFn(IntlNumberFormatMock),
        PluralRules: alwaysFn(IntlPluralRulesMock),
        RelativeTimeFormat: alwaysFn(IntlRelativeTimeFormatMock),
      },
      writable: true,
    });
  }
}

function mockMatchMedia(window) {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({
        matches: true,
        addListener: () => {},
        removeListener: () => {},
      }),
      writable: true,
    });
  }
}

function mockExecCommand(window) {
  if (!window.execCommand) {
    Object.defineProperty(window, 'execCommand', {
      value: () => {},
      writable: true,
    });
  }
}

function mockLocalStorage(window) {
  if (!window.localStorage) {
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
  }
}

function mockWebWorker(window) {
  if (!window.Worker) {
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
  }
}

function mockCrypto(window) {
  if (!window.crypto) {
    Object.defineProperty(window, 'crypto', {
      value: {
        getRandomValues: arr => arr.fill(0),
      },
      writable: true,
    });
  }
}

function mockMimeTypes(window) {
  if (!window.navigator.mimeTypes) {
    Object.defineProperty(window.navigator, 'mimeTypes', {
      value: () => [],
      writable: true,
    });
  }
}

function mockFetch(window) {
  // issue: https://github.com/chromaui/chromatic-cli/issues/14
  Object.defineProperty(window, 'fetch', {
    value: () =>
      new Promise((res, rej) => {
        // we just let this never resolve
      }),
    writable: true,
  });
}

function mockObjectURL(window) {
  if (!window.URL.createObjectURL) {
    Object.defineProperty(window.URL, 'createObjectURL', { value: () => {}, writable: true });
  }
  if (!window.URL.revokeObjectURL) {
    Object.defineProperty(window.URL, 'revokeObjectURL', { value: () => {}, writable: true });
  }
}

function mockMutationObserver(window) {
  if (!window.MutationObserver) {
    // We have to do this in this screwy way because Angular does some monkey patching
    // expects an non-es2015 class here.
    // eslint-disable-next-line no-inner-declarations
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
  }
}

function mockSVG(window) {
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

  svgElements.forEach(e => {
    if (!window[e]) {
      // eslint-disable-next-line no-eval
      const Value = eval(`(class ${e} extends window.HTMLElement {})`);

      Object.defineProperty(window, e, {
        value: Value,
        writable: true,
      });
    }
  });
}

export function addShimsToJSDOM(window) {
  mockSVG(window);
  mockMutationObserver(window);
  mockObjectURL(window);
  mockFetch(window);
  mockMimeTypes(window);
  mockCrypto(window);
  mockWebWorker(window);
  mockLocalStorage(window);
  mockMatchMedia(window);
  mockIntl(window);
  mockCanvas(window);
  mockExecCommand(window);
}
