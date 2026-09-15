var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/services/ai-config.ts
function getAPIKey(provider) {
  if (provider === "factory") return FACTORY_API_KEY || null;
  try {
    const stored = localStorage.getItem(`ai_key_${provider}`);
    if (stored) return stored;
  } catch {
    return null;
  }
  if (provider === FACTORY_PROVIDER && FACTORY_API_KEY) return FACTORY_API_KEY;
  return null;
}
function getActiveProvider() {
  try {
    const stored = localStorage.getItem("ai_active_provider");
    if (stored && ALL_PROVIDERS.includes(stored)) {
      if (stored === "glm" && !localStorage.getItem("ai_key_glm")) {
        return "factory";
      }
      return stored;
    }
  } catch {
  }
  return "factory";
}
function getConfiguredProviders() {
  return ALL_PROVIDERS.filter((p) => getAPIKey(p));
}
var FACTORY_API_KEY, FACTORY_PROVIDER, ALL_PROVIDERS, PROVIDER_CONFIGS;
var init_ai_config = __esm({
  "src/services/ai-config.ts"() {
    FACTORY_API_KEY = typeof __FACTORY_API_KEY__ !== "undefined" ? __FACTORY_API_KEY__ : "";
    FACTORY_PROVIDER = "glm";
    ALL_PROVIDERS = [
      "factory",
      "deepseek",
      "doubao",
      "qwen",
      "glm",
      "siliconflow",
      "moonshot",
      "groq"
    ];
    PROVIDER_CONFIGS = {
      factory: {
        name: "\u667A\u8C31\u514D\u8D39 \xB7 \u51FA\u5382",
        description: "\u51FA\u5382\u5185\u7F6E Key \xB7 \u65E0\u9700\u6CE8\u518C\u914D\u7F6E \xB7 GLM-4-Flash-250414\uFF08\u5B9E\u6D4B\u6700\u5FEB\u514D\u8D39\u6B3E\uFF09",
        apiEndpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        defaultModel: "glm-4-flash-250414",
        freeModel: "glm-4-flash-250414",
        registerUrl: "https://open.bigmodel.cn",
        supportsStreaming: true
      },
      deepseek: {
        name: "DeepSeek",
        description: "\u6DF1\u5EA6\u6C42\u7D22 \u2014 \u514D\u8D39 500 \u4E07 token\uFF0CR1 \u63A8\u7406\u6A21\u578B",
        apiEndpoint: "https://api.deepseek.com/v1/chat/completions",
        defaultModel: "deepseek-chat",
        freeModel: "deepseek-chat",
        registerUrl: "https://platform.deepseek.com",
        supportsStreaming: true
      },
      doubao: {
        name: "\u8C46\u5305 (Doubao)",
        description: "\u5B57\u8282\u8DF3\u52A8 \u2014 \u514D\u8D39 50 \u4E07 token/\u5929(\u7EA6)",
        apiEndpoint: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
        defaultModel: "doubao-lite-32k",
        freeModel: "doubao-lite-32k",
        registerUrl: "https://console.volcengine.com/ark",
        supportsStreaming: true
      },
      qwen: {
        name: "\u901A\u4E49\u5343\u95EE (Qwen)",
        description: "\u963F\u91CC\u4E91 \u2014 \u767E\u4E07 token \u514D\u8D39\u989D\u5EA6",
        apiEndpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        defaultModel: "qwen-plus",
        freeModel: "qwen-turbo",
        registerUrl: "https://dashscope.console.aliyun.com",
        supportsStreaming: true
      },
      glm: {
        name: "\u667A\u8C31 GLM",
        description: "\u667A\u8C31 AI \u2014 GLM-4-Flash \u514D\u8D39\uFF08\u9AD8\u5CF0\u81EA\u52A8\u5207\u6362\u5907\u7528\u514D\u8D39\u6A21\u578B\uFF09",
        apiEndpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        defaultModel: "glm-4-flash",
        freeModel: "glm-4-flash",
        registerUrl: "https://open.bigmodel.cn",
        supportsStreaming: true
      },
      siliconflow: {
        name: "\u7845\u57FA\u6D41\u52A8 (SiliconFlow)",
        description: "\u6A21\u578B\u805A\u5408\u5E73\u53F0 \u2014 2000 \u4E07 token \u514D\u8D39",
        apiEndpoint: "https://api.siliconflow.cn/v1/chat/completions",
        defaultModel: "Qwen/Qwen2.5-7B-Instruct",
        freeModel: "Qwen/Qwen2.5-7B-Instruct",
        registerUrl: "https://siliconflow.cn",
        supportsStreaming: true
      },
      moonshot: {
        name: "Moonshot (Kimi)",
        description: "\u6708\u4E4B\u6697\u9762 \u2014 \u65B0\u7528\u6237 15 \u5143\u514D\u8D39\u989D\u5EA6",
        apiEndpoint: "https://api.moonshot.cn/v1/chat/completions",
        defaultModel: "moonshot-v1-8k",
        freeModel: "moonshot-v1-8k",
        registerUrl: "https://platform.moonshot.cn",
        supportsStreaming: true
      },
      groq: {
        name: "Groq",
        description: "\u8D85\u5FEB\u63A8\u7406 \u2014 Llama \u7CFB\u5217\u6A21\u578B\u514D\u8D39",
        apiEndpoint: "https://api.groq.com/openai/v1/chat/completions",
        defaultModel: "llama-3.3-70b-versatile",
        freeModel: "llama-3.1-8b-instant",
        registerUrl: "https://console.groq.com",
        supportsStreaming: true
      }
    };
  }
});

// node_modules/react/cjs/react.production.js
var require_react_production = __commonJS({
  "node_modules/react/cjs/react.production.js"(exports2) {
    "use strict";
    var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element");
    var REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal");
    var REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment");
    var REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode");
    var REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler");
    var REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer");
    var REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context");
    var REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref");
    var REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense");
    var REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo");
    var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
    var REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity");
    var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
    function getIteratorFn(maybeIterable) {
      if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
      maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
      return "function" === typeof maybeIterable ? maybeIterable : null;
    }
    var ReactNoopUpdateQueue = {
      isMounted: function() {
        return false;
      },
      enqueueForceUpdate: function() {
      },
      enqueueReplaceState: function() {
      },
      enqueueSetState: function() {
      }
    };
    var assign = Object.assign;
    var emptyObject = {};
    function Component(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    Component.prototype.isReactComponent = {};
    Component.prototype.setState = function(partialState, callback) {
      if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
        throw Error(
          "takes an object of state variables to update or a function which returns an object of state variables."
        );
      this.updater.enqueueSetState(this, partialState, callback, "setState");
    };
    Component.prototype.forceUpdate = function(callback) {
      this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
    };
    function ComponentDummy() {
    }
    ComponentDummy.prototype = Component.prototype;
    function PureComponent(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
    pureComponentPrototype.constructor = PureComponent;
    assign(pureComponentPrototype, Component.prototype);
    pureComponentPrototype.isPureReactComponent = true;
    var isArrayImpl = Array.isArray;
    function noop() {
    }
    var ReactSharedInternals = { H: null, A: null, T: null, S: null };
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    function ReactElement(type, key, props) {
      var refProp = props.ref;
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type,
        key,
        ref: void 0 !== refProp ? refProp : null,
        props
      };
    }
    function cloneAndReplaceKey(oldElement, newKey) {
      return ReactElement(oldElement.type, newKey, oldElement.props);
    }
    function isValidElement(object) {
      return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
    }
    function escape(key) {
      var escaperLookup = { "=": "=0", ":": "=2" };
      return "$" + key.replace(/[=:]/g, function(match) {
        return escaperLookup[match];
      });
    }
    var userProvidedKeyEscapeRegex = /\/+/g;
    function getElementKey(element, index) {
      return "object" === typeof element && null !== element && null != element.key ? escape("" + element.key) : index.toString(36);
    }
    function resolveThenable(thenable) {
      switch (thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          throw thenable.reason;
        default:
          switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
            function(fulfilledValue) {
              "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
            },
            function(error) {
              "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
            }
          )), thenable.status) {
            case "fulfilled":
              return thenable.value;
            case "rejected":
              throw thenable.reason;
          }
      }
      throw thenable;
    }
    function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
      var type = typeof children;
      if ("undefined" === type || "boolean" === type) children = null;
      var invokeCallback = false;
      if (null === children) invokeCallback = true;
      else
        switch (type) {
          case "bigint":
          case "string":
          case "number":
            invokeCallback = true;
            break;
          case "object":
            switch (children.$$typeof) {
              case REACT_ELEMENT_TYPE:
              case REACT_PORTAL_TYPE:
                invokeCallback = true;
                break;
              case REACT_LAZY_TYPE:
                return invokeCallback = children._init, mapIntoArray(
                  invokeCallback(children._payload),
                  array,
                  escapedPrefix,
                  nameSoFar,
                  callback
                );
            }
        }
      if (invokeCallback)
        return callback = callback(children), invokeCallback = "" === nameSoFar ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", null != invokeCallback && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
          return c;
        })) : null != callback && (isValidElement(callback) && (callback = cloneAndReplaceKey(
          callback,
          escapedPrefix + (null == callback.key || children && children.key === callback.key ? "" : ("" + callback.key).replace(
            userProvidedKeyEscapeRegex,
            "$&/"
          ) + "/") + invokeCallback
        )), array.push(callback)), 1;
      invokeCallback = 0;
      var nextNamePrefix = "" === nameSoFar ? "." : nameSoFar + ":";
      if (isArrayImpl(children))
        for (var i = 0; i < children.length; i++)
          nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if (i = getIteratorFn(children), "function" === typeof i)
        for (children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
          nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if ("object" === type) {
        if ("function" === typeof children.then)
          return mapIntoArray(
            resolveThenable(children),
            array,
            escapedPrefix,
            nameSoFar,
            callback
          );
        array = String(children);
        throw Error(
          "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
        );
      }
      return invokeCallback;
    }
    function mapChildren(children, func, context) {
      if (null == children) return children;
      var result = [], count = 0;
      mapIntoArray(children, result, "", "", function(child) {
        return func.call(context, child, count++);
      });
      return result;
    }
    function lazyInitializer(payload) {
      if (-1 === payload._status) {
        var ctor = payload._result;
        ctor = ctor();
        ctor.then(
          function(moduleObject) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 1, payload._result = moduleObject;
          },
          function(error) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 2, payload._result = error;
          }
        );
        -1 === payload._status && (payload._status = 0, payload._result = ctor);
      }
      if (1 === payload._status) return payload._result.default;
      throw payload._result;
    }
    var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
      if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
        var event = new window.ErrorEvent("error", {
          bubbles: true,
          cancelable: true,
          message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
          error
        });
        if (!window.dispatchEvent(event)) return;
      } else if ("object" === typeof process && "function" === typeof process.emit) {
        process.emit("uncaughtException", error);
        return;
      }
      console.error(error);
    };
    var Children = {
      map: mapChildren,
      forEach: function(children, forEachFunc, forEachContext) {
        mapChildren(
          children,
          function() {
            forEachFunc.apply(this, arguments);
          },
          forEachContext
        );
      },
      count: function(children) {
        var n = 0;
        mapChildren(children, function() {
          n++;
        });
        return n;
      },
      toArray: function(children) {
        return mapChildren(children, function(child) {
          return child;
        }) || [];
      },
      only: function(children) {
        if (!isValidElement(children))
          throw Error(
            "React.Children.only expected to receive a single React element child."
          );
        return children;
      }
    };
    exports2.Activity = REACT_ACTIVITY_TYPE;
    exports2.Children = Children;
    exports2.Component = Component;
    exports2.Fragment = REACT_FRAGMENT_TYPE;
    exports2.Profiler = REACT_PROFILER_TYPE;
    exports2.PureComponent = PureComponent;
    exports2.StrictMode = REACT_STRICT_MODE_TYPE;
    exports2.Suspense = REACT_SUSPENSE_TYPE;
    exports2.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
    exports2.__COMPILER_RUNTIME = {
      __proto__: null,
      c: function(size) {
        return ReactSharedInternals.H.useMemoCache(size);
      }
    };
    exports2.cache = function(fn) {
      return function() {
        return fn.apply(null, arguments);
      };
    };
    exports2.cacheSignal = function() {
      return null;
    };
    exports2.cloneElement = function(element, config, children) {
      if (null === element || void 0 === element)
        throw Error(
          "The argument must be a React element, but you passed " + element + "."
        );
      var props = assign({}, element.props), key = element.key;
      if (null != config)
        for (propName in void 0 !== config.key && (key = "" + config.key), config)
          !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
      var propName = arguments.length - 2;
      if (1 === propName) props.children = children;
      else if (1 < propName) {
        for (var childArray = Array(propName), i = 0; i < propName; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      return ReactElement(element.type, key, props);
    };
    exports2.createContext = function(defaultValue) {
      defaultValue = {
        $$typeof: REACT_CONTEXT_TYPE,
        _currentValue: defaultValue,
        _currentValue2: defaultValue,
        _threadCount: 0,
        Provider: null,
        Consumer: null
      };
      defaultValue.Provider = defaultValue;
      defaultValue.Consumer = {
        $$typeof: REACT_CONSUMER_TYPE,
        _context: defaultValue
      };
      return defaultValue;
    };
    exports2.createElement = function(type, config, children) {
      var propName, props = {}, key = null;
      if (null != config)
        for (propName in void 0 !== config.key && (key = "" + config.key), config)
          hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (props[propName] = config[propName]);
      var childrenLength = arguments.length - 2;
      if (1 === childrenLength) props.children = children;
      else if (1 < childrenLength) {
        for (var childArray = Array(childrenLength), i = 0; i < childrenLength; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      if (type && type.defaultProps)
        for (propName in childrenLength = type.defaultProps, childrenLength)
          void 0 === props[propName] && (props[propName] = childrenLength[propName]);
      return ReactElement(type, key, props);
    };
    exports2.createRef = function() {
      return { current: null };
    };
    exports2.forwardRef = function(render) {
      return { $$typeof: REACT_FORWARD_REF_TYPE, render };
    };
    exports2.isValidElement = isValidElement;
    exports2.lazy = function(ctor) {
      return {
        $$typeof: REACT_LAZY_TYPE,
        _payload: { _status: -1, _result: ctor },
        _init: lazyInitializer
      };
    };
    exports2.memo = function(type, compare) {
      return {
        $$typeof: REACT_MEMO_TYPE,
        type,
        compare: void 0 === compare ? null : compare
      };
    };
    exports2.startTransition = function(scope) {
      var prevTransition = ReactSharedInternals.T, currentTransition = {};
      ReactSharedInternals.T = currentTransition;
      try {
        var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
        null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
        "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop, reportGlobalError);
      } catch (error) {
        reportGlobalError(error);
      } finally {
        null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
      }
    };
    exports2.unstable_useCacheRefresh = function() {
      return ReactSharedInternals.H.useCacheRefresh();
    };
    exports2.use = function(usable) {
      return ReactSharedInternals.H.use(usable);
    };
    exports2.useActionState = function(action, initialState, permalink) {
      return ReactSharedInternals.H.useActionState(action, initialState, permalink);
    };
    exports2.useCallback = function(callback, deps) {
      return ReactSharedInternals.H.useCallback(callback, deps);
    };
    exports2.useContext = function(Context) {
      return ReactSharedInternals.H.useContext(Context);
    };
    exports2.useDebugValue = function() {
    };
    exports2.useDeferredValue = function(value, initialValue) {
      return ReactSharedInternals.H.useDeferredValue(value, initialValue);
    };
    exports2.useEffect = function(create, deps) {
      return ReactSharedInternals.H.useEffect(create, deps);
    };
    exports2.useEffectEvent = function(callback) {
      return ReactSharedInternals.H.useEffectEvent(callback);
    };
    exports2.useId = function() {
      return ReactSharedInternals.H.useId();
    };
    exports2.useImperativeHandle = function(ref, create, deps) {
      return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
    };
    exports2.useInsertionEffect = function(create, deps) {
      return ReactSharedInternals.H.useInsertionEffect(create, deps);
    };
    exports2.useLayoutEffect = function(create, deps) {
      return ReactSharedInternals.H.useLayoutEffect(create, deps);
    };
    exports2.useMemo = function(create, deps) {
      return ReactSharedInternals.H.useMemo(create, deps);
    };
    exports2.useOptimistic = function(passthrough, reducer) {
      return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
    };
    exports2.useReducer = function(reducer, initialArg, init) {
      return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
    };
    exports2.useRef = function(initialValue) {
      return ReactSharedInternals.H.useRef(initialValue);
    };
    exports2.useState = function(initialState) {
      return ReactSharedInternals.H.useState(initialState);
    };
    exports2.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
      return ReactSharedInternals.H.useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
      );
    };
    exports2.useTransition = function() {
      return ReactSharedInternals.H.useTransition();
    };
    exports2.version = "19.2.6";
  }
});

// node_modules/react/cjs/react.development.js
var require_react_development = __commonJS({
  "node_modules/react/cjs/react.development.js"(exports2, module2) {
    "use strict";
    "production" !== process.env.NODE_ENV && (function() {
      function defineDeprecationWarning(methodName, info) {
        Object.defineProperty(Component.prototype, methodName, {
          get: function() {
            console.warn(
              "%s(...) is deprecated in plain JavaScript React classes. %s",
              info[0],
              info[1]
            );
          }
        });
      }
      function getIteratorFn(maybeIterable) {
        if (null === maybeIterable || "object" !== typeof maybeIterable)
          return null;
        maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
        return "function" === typeof maybeIterable ? maybeIterable : null;
      }
      function warnNoop(publicInstance, callerName) {
        publicInstance = (publicInstance = publicInstance.constructor) && (publicInstance.displayName || publicInstance.name) || "ReactClass";
        var warningKey = publicInstance + "." + callerName;
        didWarnStateUpdateForUnmountedComponent[warningKey] || (console.error(
          "Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.",
          callerName,
          publicInstance
        ), didWarnStateUpdateForUnmountedComponent[warningKey] = true);
      }
      function Component(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function ComponentDummy() {
      }
      function PureComponent(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function noop() {
      }
      function testStringCoercion(value) {
        return "" + value;
      }
      function checkKeyStringCoercion(value) {
        try {
          testStringCoercion(value);
          var JSCompiler_inline_result = false;
        } catch (e) {
          JSCompiler_inline_result = true;
        }
        if (JSCompiler_inline_result) {
          JSCompiler_inline_result = console;
          var JSCompiler_temp_const = JSCompiler_inline_result.error;
          var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
          JSCompiler_temp_const.call(
            JSCompiler_inline_result,
            "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
            JSCompiler_inline_result$jscomp$0
          );
          return testStringCoercion(value);
        }
      }
      function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type)
          return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch (type) {
          case REACT_FRAGMENT_TYPE:
            return "Fragment";
          case REACT_PROFILER_TYPE:
            return "Profiler";
          case REACT_STRICT_MODE_TYPE:
            return "StrictMode";
          case REACT_SUSPENSE_TYPE:
            return "Suspense";
          case REACT_SUSPENSE_LIST_TYPE:
            return "SuspenseList";
          case REACT_ACTIVITY_TYPE:
            return "Activity";
        }
        if ("object" === typeof type)
          switch ("number" === typeof type.tag && console.error(
            "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
          ), type.$$typeof) {
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_CONTEXT_TYPE:
              return type.displayName || "Context";
            case REACT_CONSUMER_TYPE:
              return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
              var innerType = type.render;
              type = type.displayName;
              type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
              return type;
            case REACT_MEMO_TYPE:
              return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
              innerType = type._payload;
              type = type._init;
              try {
                return getComponentNameFromType(type(innerType));
              } catch (x) {
              }
          }
        return null;
      }
      function getTaskName(type) {
        if (type === REACT_FRAGMENT_TYPE) return "<>";
        if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE)
          return "<...>";
        try {
          var name = getComponentNameFromType(type);
          return name ? "<" + name + ">" : "<...>";
        } catch (x) {
          return "<...>";
        }
      }
      function getOwner() {
        var dispatcher = ReactSharedInternals.A;
        return null === dispatcher ? null : dispatcher.getOwner();
      }
      function UnknownOwner() {
        return Error("react-stack-top-frame");
      }
      function hasValidKey(config) {
        if (hasOwnProperty.call(config, "key")) {
          var getter = Object.getOwnPropertyDescriptor(config, "key").get;
          if (getter && getter.isReactWarning) return false;
        }
        return void 0 !== config.key;
      }
      function defineKeyPropWarningGetter(props, displayName) {
        function warnAboutAccessingKey() {
          specialPropKeyWarningShown || (specialPropKeyWarningShown = true, console.error(
            "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
            displayName
          ));
        }
        warnAboutAccessingKey.isReactWarning = true;
        Object.defineProperty(props, "key", {
          get: warnAboutAccessingKey,
          configurable: true
        });
      }
      function elementRefGetterWithDeprecationWarning() {
        var componentName = getComponentNameFromType(this.type);
        didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = true, console.error(
          "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
        ));
        componentName = this.props.ref;
        return void 0 !== componentName ? componentName : null;
      }
      function ReactElement(type, key, props, owner, debugStack, debugTask) {
        var refProp = props.ref;
        type = {
          $$typeof: REACT_ELEMENT_TYPE,
          type,
          key,
          props,
          _owner: owner
        };
        null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
          enumerable: false,
          get: elementRefGetterWithDeprecationWarning
        }) : Object.defineProperty(type, "ref", { enumerable: false, value: null });
        type._store = {};
        Object.defineProperty(type._store, "validated", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: 0
        });
        Object.defineProperty(type, "_debugInfo", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: null
        });
        Object.defineProperty(type, "_debugStack", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugStack
        });
        Object.defineProperty(type, "_debugTask", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugTask
        });
        Object.freeze && (Object.freeze(type.props), Object.freeze(type));
        return type;
      }
      function cloneAndReplaceKey(oldElement, newKey) {
        newKey = ReactElement(
          oldElement.type,
          newKey,
          oldElement.props,
          oldElement._owner,
          oldElement._debugStack,
          oldElement._debugTask
        );
        oldElement._store && (newKey._store.validated = oldElement._store.validated);
        return newKey;
      }
      function validateChildKeys(node) {
        isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
      }
      function isValidElement(object) {
        return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
      }
      function escape(key) {
        var escaperLookup = { "=": "=0", ":": "=2" };
        return "$" + key.replace(/[=:]/g, function(match) {
          return escaperLookup[match];
        });
      }
      function getElementKey(element, index) {
        return "object" === typeof element && null !== element && null != element.key ? (checkKeyStringCoercion(element.key), escape("" + element.key)) : index.toString(36);
      }
      function resolveThenable(thenable) {
        switch (thenable.status) {
          case "fulfilled":
            return thenable.value;
          case "rejected":
            throw thenable.reason;
          default:
            switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
              function(fulfilledValue) {
                "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
              },
              function(error) {
                "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            )), thenable.status) {
              case "fulfilled":
                return thenable.value;
              case "rejected":
                throw thenable.reason;
            }
        }
        throw thenable;
      }
      function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
        var type = typeof children;
        if ("undefined" === type || "boolean" === type) children = null;
        var invokeCallback = false;
        if (null === children) invokeCallback = true;
        else
          switch (type) {
            case "bigint":
            case "string":
            case "number":
              invokeCallback = true;
              break;
            case "object":
              switch (children.$$typeof) {
                case REACT_ELEMENT_TYPE:
                case REACT_PORTAL_TYPE:
                  invokeCallback = true;
                  break;
                case REACT_LAZY_TYPE:
                  return invokeCallback = children._init, mapIntoArray(
                    invokeCallback(children._payload),
                    array,
                    escapedPrefix,
                    nameSoFar,
                    callback
                  );
              }
          }
        if (invokeCallback) {
          invokeCallback = children;
          callback = callback(invokeCallback);
          var childKey = "" === nameSoFar ? "." + getElementKey(invokeCallback, 0) : nameSoFar;
          isArrayImpl(callback) ? (escapedPrefix = "", null != childKey && (escapedPrefix = childKey.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
            return c;
          })) : null != callback && (isValidElement(callback) && (null != callback.key && (invokeCallback && invokeCallback.key === callback.key || checkKeyStringCoercion(callback.key)), escapedPrefix = cloneAndReplaceKey(
            callback,
            escapedPrefix + (null == callback.key || invokeCallback && invokeCallback.key === callback.key ? "" : ("" + callback.key).replace(
              userProvidedKeyEscapeRegex,
              "$&/"
            ) + "/") + childKey
          ), "" !== nameSoFar && null != invokeCallback && isValidElement(invokeCallback) && null == invokeCallback.key && invokeCallback._store && !invokeCallback._store.validated && (escapedPrefix._store.validated = 2), callback = escapedPrefix), array.push(callback));
          return 1;
        }
        invokeCallback = 0;
        childKey = "" === nameSoFar ? "." : nameSoFar + ":";
        if (isArrayImpl(children))
          for (var i = 0; i < children.length; i++)
            nameSoFar = children[i], type = childKey + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if (i = getIteratorFn(children), "function" === typeof i)
          for (i === children.entries && (didWarnAboutMaps || console.warn(
            "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
          ), didWarnAboutMaps = true), children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
            nameSoFar = nameSoFar.value, type = childKey + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if ("object" === type) {
          if ("function" === typeof children.then)
            return mapIntoArray(
              resolveThenable(children),
              array,
              escapedPrefix,
              nameSoFar,
              callback
            );
          array = String(children);
          throw Error(
            "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
          );
        }
        return invokeCallback;
      }
      function mapChildren(children, func, context) {
        if (null == children) return children;
        var result = [], count = 0;
        mapIntoArray(children, result, "", "", function(child) {
          return func.call(context, child, count++);
        });
        return result;
      }
      function lazyInitializer(payload) {
        if (-1 === payload._status) {
          var ioInfo = payload._ioInfo;
          null != ioInfo && (ioInfo.start = ioInfo.end = performance.now());
          ioInfo = payload._result;
          var thenable = ioInfo();
          thenable.then(
            function(moduleObject) {
              if (0 === payload._status || -1 === payload._status) {
                payload._status = 1;
                payload._result = moduleObject;
                var _ioInfo = payload._ioInfo;
                null != _ioInfo && (_ioInfo.end = performance.now());
                void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
              }
            },
            function(error) {
              if (0 === payload._status || -1 === payload._status) {
                payload._status = 2;
                payload._result = error;
                var _ioInfo2 = payload._ioInfo;
                null != _ioInfo2 && (_ioInfo2.end = performance.now());
                void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            }
          );
          ioInfo = payload._ioInfo;
          if (null != ioInfo) {
            ioInfo.value = thenable;
            var displayName = thenable.displayName;
            "string" === typeof displayName && (ioInfo.name = displayName);
          }
          -1 === payload._status && (payload._status = 0, payload._result = thenable);
        }
        if (1 === payload._status)
          return ioInfo = payload._result, void 0 === ioInfo && console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?",
            ioInfo
          ), "default" in ioInfo || console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))",
            ioInfo
          ), ioInfo.default;
        throw payload._result;
      }
      function resolveDispatcher() {
        var dispatcher = ReactSharedInternals.H;
        null === dispatcher && console.error(
          "Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem."
        );
        return dispatcher;
      }
      function releaseAsyncTransition() {
        ReactSharedInternals.asyncTransitions--;
      }
      function enqueueTask(task) {
        if (null === enqueueTaskImpl)
          try {
            var requireString = ("require" + Math.random()).slice(0, 7);
            enqueueTaskImpl = (module2 && module2[requireString]).call(
              module2,
              "timers"
            ).setImmediate;
          } catch (_err) {
            enqueueTaskImpl = function(callback) {
              false === didWarnAboutMessageChannel && (didWarnAboutMessageChannel = true, "undefined" === typeof MessageChannel && console.error(
                "This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning."
              ));
              var channel = new MessageChannel();
              channel.port1.onmessage = callback;
              channel.port2.postMessage(void 0);
            };
          }
        return enqueueTaskImpl(task);
      }
      function aggregateErrors(errors) {
        return 1 < errors.length && "function" === typeof AggregateError ? new AggregateError(errors) : errors[0];
      }
      function popActScope(prevActQueue, prevActScopeDepth) {
        prevActScopeDepth !== actScopeDepth - 1 && console.error(
          "You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. "
        );
        actScopeDepth = prevActScopeDepth;
      }
      function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
        var queue = ReactSharedInternals.actQueue;
        if (null !== queue)
          if (0 !== queue.length)
            try {
              flushActQueue(queue);
              enqueueTask(function() {
                return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
              });
              return;
            } catch (error) {
              ReactSharedInternals.thrownErrors.push(error);
            }
          else ReactSharedInternals.actQueue = null;
        0 < ReactSharedInternals.thrownErrors.length ? (queue = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(queue)) : resolve(returnValue);
      }
      function flushActQueue(queue) {
        if (!isFlushing) {
          isFlushing = true;
          var i = 0;
          try {
            for (; i < queue.length; i++) {
              var callback = queue[i];
              do {
                ReactSharedInternals.didUsePromise = false;
                var continuation = callback(false);
                if (null !== continuation) {
                  if (ReactSharedInternals.didUsePromise) {
                    queue[i] = callback;
                    queue.splice(0, i);
                    return;
                  }
                  callback = continuation;
                } else break;
              } while (1);
            }
            queue.length = 0;
          } catch (error) {
            queue.splice(0, i + 1), ReactSharedInternals.thrownErrors.push(error);
          } finally {
            isFlushing = false;
          }
        }
      }
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
      var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = /* @__PURE__ */ Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo"), REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity"), MAYBE_ITERATOR_SYMBOL = Symbol.iterator, didWarnStateUpdateForUnmountedComponent = {}, ReactNoopUpdateQueue = {
        isMounted: function() {
          return false;
        },
        enqueueForceUpdate: function(publicInstance) {
          warnNoop(publicInstance, "forceUpdate");
        },
        enqueueReplaceState: function(publicInstance) {
          warnNoop(publicInstance, "replaceState");
        },
        enqueueSetState: function(publicInstance) {
          warnNoop(publicInstance, "setState");
        }
      }, assign = Object.assign, emptyObject = {};
      Object.freeze(emptyObject);
      Component.prototype.isReactComponent = {};
      Component.prototype.setState = function(partialState, callback) {
        if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
          throw Error(
            "takes an object of state variables to update or a function which returns an object of state variables."
          );
        this.updater.enqueueSetState(this, partialState, callback, "setState");
      };
      Component.prototype.forceUpdate = function(callback) {
        this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
      };
      var deprecatedAPIs = {
        isMounted: [
          "isMounted",
          "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."
        ],
        replaceState: [
          "replaceState",
          "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."
        ]
      };
      for (fnName in deprecatedAPIs)
        deprecatedAPIs.hasOwnProperty(fnName) && defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
      ComponentDummy.prototype = Component.prototype;
      deprecatedAPIs = PureComponent.prototype = new ComponentDummy();
      deprecatedAPIs.constructor = PureComponent;
      assign(deprecatedAPIs, Component.prototype);
      deprecatedAPIs.isPureReactComponent = true;
      var isArrayImpl = Array.isArray, REACT_CLIENT_REFERENCE = /* @__PURE__ */ Symbol.for("react.client.reference"), ReactSharedInternals = {
        H: null,
        A: null,
        T: null,
        S: null,
        actQueue: null,
        asyncTransitions: 0,
        isBatchingLegacy: false,
        didScheduleLegacyUpdate: false,
        didUsePromise: false,
        thrownErrors: [],
        getCurrentStack: null,
        recentlyCreatedOwnerStacks: 0
      }, hasOwnProperty = Object.prototype.hasOwnProperty, createTask = console.createTask ? console.createTask : function() {
        return null;
      };
      deprecatedAPIs = {
        react_stack_bottom_frame: function(callStackForError) {
          return callStackForError();
        }
      };
      var specialPropKeyWarningShown, didWarnAboutOldJSXRuntime;
      var didWarnAboutElementRef = {};
      var unknownOwnerDebugStack = deprecatedAPIs.react_stack_bottom_frame.bind(
        deprecatedAPIs,
        UnknownOwner
      )();
      var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
      var didWarnAboutMaps = false, userProvidedKeyEscapeRegex = /\/+/g, reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
        if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
          var event = new window.ErrorEvent("error", {
            bubbles: true,
            cancelable: true,
            message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
            error
          });
          if (!window.dispatchEvent(event)) return;
        } else if ("object" === typeof process && "function" === typeof process.emit) {
          process.emit("uncaughtException", error);
          return;
        }
        console.error(error);
      }, didWarnAboutMessageChannel = false, enqueueTaskImpl = null, actScopeDepth = 0, didWarnNoAwaitAct = false, isFlushing = false, queueSeveralMicrotasks = "function" === typeof queueMicrotask ? function(callback) {
        queueMicrotask(function() {
          return queueMicrotask(callback);
        });
      } : enqueueTask;
      deprecatedAPIs = Object.freeze({
        __proto__: null,
        c: function(size) {
          return resolveDispatcher().useMemoCache(size);
        }
      });
      var fnName = {
        map: mapChildren,
        forEach: function(children, forEachFunc, forEachContext) {
          mapChildren(
            children,
            function() {
              forEachFunc.apply(this, arguments);
            },
            forEachContext
          );
        },
        count: function(children) {
          var n = 0;
          mapChildren(children, function() {
            n++;
          });
          return n;
        },
        toArray: function(children) {
          return mapChildren(children, function(child) {
            return child;
          }) || [];
        },
        only: function(children) {
          if (!isValidElement(children))
            throw Error(
              "React.Children.only expected to receive a single React element child."
            );
          return children;
        }
      };
      exports2.Activity = REACT_ACTIVITY_TYPE;
      exports2.Children = fnName;
      exports2.Component = Component;
      exports2.Fragment = REACT_FRAGMENT_TYPE;
      exports2.Profiler = REACT_PROFILER_TYPE;
      exports2.PureComponent = PureComponent;
      exports2.StrictMode = REACT_STRICT_MODE_TYPE;
      exports2.Suspense = REACT_SUSPENSE_TYPE;
      exports2.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
      exports2.__COMPILER_RUNTIME = deprecatedAPIs;
      exports2.act = function(callback) {
        var prevActQueue = ReactSharedInternals.actQueue, prevActScopeDepth = actScopeDepth;
        actScopeDepth++;
        var queue = ReactSharedInternals.actQueue = null !== prevActQueue ? prevActQueue : [], didAwaitActCall = false;
        try {
          var result = callback();
        } catch (error) {
          ReactSharedInternals.thrownErrors.push(error);
        }
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw popActScope(prevActQueue, prevActScopeDepth), callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        if (null !== result && "object" === typeof result && "function" === typeof result.then) {
          var thenable = result;
          queueSeveralMicrotasks(function() {
            didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
              "You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"
            ));
          });
          return {
            then: function(resolve, reject) {
              didAwaitActCall = true;
              thenable.then(
                function(returnValue) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  if (0 === prevActScopeDepth) {
                    try {
                      flushActQueue(queue), enqueueTask(function() {
                        return recursivelyFlushAsyncActWork(
                          returnValue,
                          resolve,
                          reject
                        );
                      });
                    } catch (error$0) {
                      ReactSharedInternals.thrownErrors.push(error$0);
                    }
                    if (0 < ReactSharedInternals.thrownErrors.length) {
                      var _thrownError = aggregateErrors(
                        ReactSharedInternals.thrownErrors
                      );
                      ReactSharedInternals.thrownErrors.length = 0;
                      reject(_thrownError);
                    }
                  } else resolve(returnValue);
                },
                function(error) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  0 < ReactSharedInternals.thrownErrors.length ? (error = aggregateErrors(
                    ReactSharedInternals.thrownErrors
                  ), ReactSharedInternals.thrownErrors.length = 0, reject(error)) : reject(error);
                }
              );
            }
          };
        }
        var returnValue$jscomp$0 = result;
        popActScope(prevActQueue, prevActScopeDepth);
        0 === prevActScopeDepth && (flushActQueue(queue), 0 !== queue.length && queueSeveralMicrotasks(function() {
          didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
            "A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"
          ));
        }), ReactSharedInternals.actQueue = null);
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        return {
          then: function(resolve, reject) {
            didAwaitActCall = true;
            0 === prevActScopeDepth ? (ReactSharedInternals.actQueue = queue, enqueueTask(function() {
              return recursivelyFlushAsyncActWork(
                returnValue$jscomp$0,
                resolve,
                reject
              );
            })) : resolve(returnValue$jscomp$0);
          }
        };
      };
      exports2.cache = function(fn) {
        return function() {
          return fn.apply(null, arguments);
        };
      };
      exports2.cacheSignal = function() {
        return null;
      };
      exports2.captureOwnerStack = function() {
        var getCurrentStack = ReactSharedInternals.getCurrentStack;
        return null === getCurrentStack ? null : getCurrentStack();
      };
      exports2.cloneElement = function(element, config, children) {
        if (null === element || void 0 === element)
          throw Error(
            "The argument must be a React element, but you passed " + element + "."
          );
        var props = assign({}, element.props), key = element.key, owner = element._owner;
        if (null != config) {
          var JSCompiler_inline_result;
          a: {
            if (hasOwnProperty.call(config, "ref") && (JSCompiler_inline_result = Object.getOwnPropertyDescriptor(
              config,
              "ref"
            ).get) && JSCompiler_inline_result.isReactWarning) {
              JSCompiler_inline_result = false;
              break a;
            }
            JSCompiler_inline_result = void 0 !== config.ref;
          }
          JSCompiler_inline_result && (owner = getOwner());
          hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key);
          for (propName in config)
            !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
        }
        var propName = arguments.length - 2;
        if (1 === propName) props.children = children;
        else if (1 < propName) {
          JSCompiler_inline_result = Array(propName);
          for (var i = 0; i < propName; i++)
            JSCompiler_inline_result[i] = arguments[i + 2];
          props.children = JSCompiler_inline_result;
        }
        props = ReactElement(
          element.type,
          key,
          props,
          owner,
          element._debugStack,
          element._debugTask
        );
        for (key = 2; key < arguments.length; key++)
          validateChildKeys(arguments[key]);
        return props;
      };
      exports2.createContext = function(defaultValue) {
        defaultValue = {
          $$typeof: REACT_CONTEXT_TYPE,
          _currentValue: defaultValue,
          _currentValue2: defaultValue,
          _threadCount: 0,
          Provider: null,
          Consumer: null
        };
        defaultValue.Provider = defaultValue;
        defaultValue.Consumer = {
          $$typeof: REACT_CONSUMER_TYPE,
          _context: defaultValue
        };
        defaultValue._currentRenderer = null;
        defaultValue._currentRenderer2 = null;
        return defaultValue;
      };
      exports2.createElement = function(type, config, children) {
        for (var i = 2; i < arguments.length; i++)
          validateChildKeys(arguments[i]);
        i = {};
        var key = null;
        if (null != config)
          for (propName in didWarnAboutOldJSXRuntime || !("__self" in config) || "key" in config || (didWarnAboutOldJSXRuntime = true, console.warn(
            "Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform"
          )), hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key), config)
            hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (i[propName] = config[propName]);
        var childrenLength = arguments.length - 2;
        if (1 === childrenLength) i.children = children;
        else if (1 < childrenLength) {
          for (var childArray = Array(childrenLength), _i = 0; _i < childrenLength; _i++)
            childArray[_i] = arguments[_i + 2];
          Object.freeze && Object.freeze(childArray);
          i.children = childArray;
        }
        if (type && type.defaultProps)
          for (propName in childrenLength = type.defaultProps, childrenLength)
            void 0 === i[propName] && (i[propName] = childrenLength[propName]);
        key && defineKeyPropWarningGetter(
          i,
          "function" === typeof type ? type.displayName || type.name || "Unknown" : type
        );
        var propName = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        return ReactElement(
          type,
          key,
          i,
          getOwner(),
          propName ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
          propName ? createTask(getTaskName(type)) : unknownOwnerDebugTask
        );
      };
      exports2.createRef = function() {
        var refObject = { current: null };
        Object.seal(refObject);
        return refObject;
      };
      exports2.forwardRef = function(render) {
        null != render && render.$$typeof === REACT_MEMO_TYPE ? console.error(
          "forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...))."
        ) : "function" !== typeof render ? console.error(
          "forwardRef requires a render function but was given %s.",
          null === render ? "null" : typeof render
        ) : 0 !== render.length && 2 !== render.length && console.error(
          "forwardRef render functions accept exactly two parameters: props and ref. %s",
          1 === render.length ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined."
        );
        null != render && null != render.defaultProps && console.error(
          "forwardRef render functions do not support defaultProps. Did you accidentally pass a React component?"
        );
        var elementType = { $$typeof: REACT_FORWARD_REF_TYPE, render }, ownName;
        Object.defineProperty(elementType, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            render.name || render.displayName || (Object.defineProperty(render, "name", { value: name }), render.displayName = name);
          }
        });
        return elementType;
      };
      exports2.isValidElement = isValidElement;
      exports2.lazy = function(ctor) {
        ctor = { _status: -1, _result: ctor };
        var lazyType = {
          $$typeof: REACT_LAZY_TYPE,
          _payload: ctor,
          _init: lazyInitializer
        }, ioInfo = {
          name: "lazy",
          start: -1,
          end: -1,
          value: null,
          owner: null,
          debugStack: Error("react-stack-top-frame"),
          debugTask: console.createTask ? console.createTask("lazy()") : null
        };
        ctor._ioInfo = ioInfo;
        lazyType._debugInfo = [{ awaited: ioInfo }];
        return lazyType;
      };
      exports2.memo = function(type, compare) {
        null == type && console.error(
          "memo: The first argument must be a component. Instead received: %s",
          null === type ? "null" : typeof type
        );
        compare = {
          $$typeof: REACT_MEMO_TYPE,
          type,
          compare: void 0 === compare ? null : compare
        };
        var ownName;
        Object.defineProperty(compare, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            type.name || type.displayName || (Object.defineProperty(type, "name", { value: name }), type.displayName = name);
          }
        });
        return compare;
      };
      exports2.startTransition = function(scope) {
        var prevTransition = ReactSharedInternals.T, currentTransition = {};
        currentTransition._updatedFibers = /* @__PURE__ */ new Set();
        ReactSharedInternals.T = currentTransition;
        try {
          var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
          null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
          "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && (ReactSharedInternals.asyncTransitions++, returnValue.then(releaseAsyncTransition, releaseAsyncTransition), returnValue.then(noop, reportGlobalError));
        } catch (error) {
          reportGlobalError(error);
        } finally {
          null === prevTransition && currentTransition._updatedFibers && (scope = currentTransition._updatedFibers.size, currentTransition._updatedFibers.clear(), 10 < scope && console.warn(
            "Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."
          )), null !== prevTransition && null !== currentTransition.types && (null !== prevTransition.types && prevTransition.types !== currentTransition.types && console.error(
            "We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."
          ), prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
        }
      };
      exports2.unstable_useCacheRefresh = function() {
        return resolveDispatcher().useCacheRefresh();
      };
      exports2.use = function(usable) {
        return resolveDispatcher().use(usable);
      };
      exports2.useActionState = function(action, initialState, permalink) {
        return resolveDispatcher().useActionState(
          action,
          initialState,
          permalink
        );
      };
      exports2.useCallback = function(callback, deps) {
        return resolveDispatcher().useCallback(callback, deps);
      };
      exports2.useContext = function(Context) {
        var dispatcher = resolveDispatcher();
        Context.$$typeof === REACT_CONSUMER_TYPE && console.error(
          "Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?"
        );
        return dispatcher.useContext(Context);
      };
      exports2.useDebugValue = function(value, formatterFn) {
        return resolveDispatcher().useDebugValue(value, formatterFn);
      };
      exports2.useDeferredValue = function(value, initialValue) {
        return resolveDispatcher().useDeferredValue(value, initialValue);
      };
      exports2.useEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useEffect(create, deps);
      };
      exports2.useEffectEvent = function(callback) {
        return resolveDispatcher().useEffectEvent(callback);
      };
      exports2.useId = function() {
        return resolveDispatcher().useId();
      };
      exports2.useImperativeHandle = function(ref, create, deps) {
        return resolveDispatcher().useImperativeHandle(ref, create, deps);
      };
      exports2.useInsertionEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useInsertionEffect(create, deps);
      };
      exports2.useLayoutEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useLayoutEffect(create, deps);
      };
      exports2.useMemo = function(create, deps) {
        return resolveDispatcher().useMemo(create, deps);
      };
      exports2.useOptimistic = function(passthrough, reducer) {
        return resolveDispatcher().useOptimistic(passthrough, reducer);
      };
      exports2.useReducer = function(reducer, initialArg, init) {
        return resolveDispatcher().useReducer(reducer, initialArg, init);
      };
      exports2.useRef = function(initialValue) {
        return resolveDispatcher().useRef(initialValue);
      };
      exports2.useState = function(initialState) {
        return resolveDispatcher().useState(initialState);
      };
      exports2.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
        return resolveDispatcher().useSyncExternalStore(
          subscribe,
          getSnapshot,
          getServerSnapshot
        );
      };
      exports2.useTransition = function() {
        return resolveDispatcher().useTransition();
      };
      exports2.version = "19.2.6";
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
    })();
  }
});

// node_modules/react/index.js
var require_react = __commonJS({
  "node_modules/react/index.js"(exports2, module2) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module2.exports = require_react_production();
    } else {
      module2.exports = require_react_development();
    }
  }
});

// node_modules/react-dom/cjs/react-dom.production.js
var require_react_dom_production = __commonJS({
  "node_modules/react-dom/cjs/react-dom.production.js"(exports2) {
    "use strict";
    var React2 = require_react();
    function formatProdErrorMessage(code) {
      var url = "https://react.dev/errors/" + code;
      if (1 < arguments.length) {
        url += "?args[]=" + encodeURIComponent(arguments[1]);
        for (var i = 2; i < arguments.length; i++)
          url += "&args[]=" + encodeURIComponent(arguments[i]);
      }
      return "Minified React error #" + code + "; visit " + url + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
    }
    function noop() {
    }
    var Internals = {
      d: {
        f: noop,
        r: function() {
          throw Error(formatProdErrorMessage(522));
        },
        D: noop,
        C: noop,
        L: noop,
        m: noop,
        X: noop,
        S: noop,
        M: noop
      },
      p: 0,
      findDOMNode: null
    };
    var REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal");
    function createPortal$1(children, containerInfo, implementation) {
      var key = 3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : null;
      return {
        $$typeof: REACT_PORTAL_TYPE,
        key: null == key ? null : "" + key,
        children,
        containerInfo,
        implementation
      };
    }
    var ReactSharedInternals = React2.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    function getCrossOriginStringAs(as, input) {
      if ("font" === as) return "";
      if ("string" === typeof input)
        return "use-credentials" === input ? input : "";
    }
    exports2.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = Internals;
    exports2.createPortal = function(children, container) {
      var key = 2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : null;
      if (!container || 1 !== container.nodeType && 9 !== container.nodeType && 11 !== container.nodeType)
        throw Error(formatProdErrorMessage(299));
      return createPortal$1(children, container, null, key);
    };
    exports2.flushSync = function(fn) {
      var previousTransition = ReactSharedInternals.T, previousUpdatePriority = Internals.p;
      try {
        if (ReactSharedInternals.T = null, Internals.p = 2, fn) return fn();
      } finally {
        ReactSharedInternals.T = previousTransition, Internals.p = previousUpdatePriority, Internals.d.f();
      }
    };
    exports2.preconnect = function(href, options) {
      "string" === typeof href && (options ? (options = options.crossOrigin, options = "string" === typeof options ? "use-credentials" === options ? options : "" : void 0) : options = null, Internals.d.C(href, options));
    };
    exports2.prefetchDNS = function(href) {
      "string" === typeof href && Internals.d.D(href);
    };
    exports2.preinit = function(href, options) {
      if ("string" === typeof href && options && "string" === typeof options.as) {
        var as = options.as, crossOrigin = getCrossOriginStringAs(as, options.crossOrigin), integrity = "string" === typeof options.integrity ? options.integrity : void 0, fetchPriority = "string" === typeof options.fetchPriority ? options.fetchPriority : void 0;
        "style" === as ? Internals.d.S(
          href,
          "string" === typeof options.precedence ? options.precedence : void 0,
          {
            crossOrigin,
            integrity,
            fetchPriority
          }
        ) : "script" === as && Internals.d.X(href, {
          crossOrigin,
          integrity,
          fetchPriority,
          nonce: "string" === typeof options.nonce ? options.nonce : void 0
        });
      }
    };
    exports2.preinitModule = function(href, options) {
      if ("string" === typeof href)
        if ("object" === typeof options && null !== options) {
          if (null == options.as || "script" === options.as) {
            var crossOrigin = getCrossOriginStringAs(
              options.as,
              options.crossOrigin
            );
            Internals.d.M(href, {
              crossOrigin,
              integrity: "string" === typeof options.integrity ? options.integrity : void 0,
              nonce: "string" === typeof options.nonce ? options.nonce : void 0
            });
          }
        } else null == options && Internals.d.M(href);
    };
    exports2.preload = function(href, options) {
      if ("string" === typeof href && "object" === typeof options && null !== options && "string" === typeof options.as) {
        var as = options.as, crossOrigin = getCrossOriginStringAs(as, options.crossOrigin);
        Internals.d.L(href, as, {
          crossOrigin,
          integrity: "string" === typeof options.integrity ? options.integrity : void 0,
          nonce: "string" === typeof options.nonce ? options.nonce : void 0,
          type: "string" === typeof options.type ? options.type : void 0,
          fetchPriority: "string" === typeof options.fetchPriority ? options.fetchPriority : void 0,
          referrerPolicy: "string" === typeof options.referrerPolicy ? options.referrerPolicy : void 0,
          imageSrcSet: "string" === typeof options.imageSrcSet ? options.imageSrcSet : void 0,
          imageSizes: "string" === typeof options.imageSizes ? options.imageSizes : void 0,
          media: "string" === typeof options.media ? options.media : void 0
        });
      }
    };
    exports2.preloadModule = function(href, options) {
      if ("string" === typeof href)
        if (options) {
          var crossOrigin = getCrossOriginStringAs(options.as, options.crossOrigin);
          Internals.d.m(href, {
            as: "string" === typeof options.as && "script" !== options.as ? options.as : void 0,
            crossOrigin,
            integrity: "string" === typeof options.integrity ? options.integrity : void 0
          });
        } else Internals.d.m(href);
    };
    exports2.requestFormReset = function(form) {
      Internals.d.r(form);
    };
    exports2.unstable_batchedUpdates = function(fn, a) {
      return fn(a);
    };
    exports2.useFormState = function(action, initialState, permalink) {
      return ReactSharedInternals.H.useFormState(action, initialState, permalink);
    };
    exports2.useFormStatus = function() {
      return ReactSharedInternals.H.useHostTransitionStatus();
    };
    exports2.version = "19.2.6";
  }
});

// node_modules/react-dom/cjs/react-dom.development.js
var require_react_dom_development = __commonJS({
  "node_modules/react-dom/cjs/react-dom.development.js"(exports2) {
    "use strict";
    "production" !== process.env.NODE_ENV && (function() {
      function noop() {
      }
      function testStringCoercion(value) {
        return "" + value;
      }
      function createPortal$1(children, containerInfo, implementation) {
        var key = 3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : null;
        try {
          testStringCoercion(key);
          var JSCompiler_inline_result = false;
        } catch (e) {
          JSCompiler_inline_result = true;
        }
        JSCompiler_inline_result && (console.error(
          "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
          "function" === typeof Symbol && Symbol.toStringTag && key[Symbol.toStringTag] || key.constructor.name || "Object"
        ), testStringCoercion(key));
        return {
          $$typeof: REACT_PORTAL_TYPE,
          key: null == key ? null : "" + key,
          children,
          containerInfo,
          implementation
        };
      }
      function getCrossOriginStringAs(as, input) {
        if ("font" === as) return "";
        if ("string" === typeof input)
          return "use-credentials" === input ? input : "";
      }
      function getValueDescriptorExpectingObjectForWarning(thing) {
        return null === thing ? "`null`" : void 0 === thing ? "`undefined`" : "" === thing ? "an empty string" : 'something with type "' + typeof thing + '"';
      }
      function getValueDescriptorExpectingEnumForWarning(thing) {
        return null === thing ? "`null`" : void 0 === thing ? "`undefined`" : "" === thing ? "an empty string" : "string" === typeof thing ? JSON.stringify(thing) : "number" === typeof thing ? "`" + thing + "`" : 'something with type "' + typeof thing + '"';
      }
      function resolveDispatcher() {
        var dispatcher = ReactSharedInternals.H;
        null === dispatcher && console.error(
          "Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem."
        );
        return dispatcher;
      }
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
      var React2 = require_react(), Internals = {
        d: {
          f: noop,
          r: function() {
            throw Error(
              "Invalid form element. requestFormReset must be passed a form that was rendered by React."
            );
          },
          D: noop,
          C: noop,
          L: noop,
          m: noop,
          X: noop,
          S: noop,
          M: noop
        },
        p: 0,
        findDOMNode: null
      }, REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal"), ReactSharedInternals = React2.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      "function" === typeof Map && null != Map.prototype && "function" === typeof Map.prototype.forEach && "function" === typeof Set && null != Set.prototype && "function" === typeof Set.prototype.clear && "function" === typeof Set.prototype.forEach || console.error(
        "React depends on Map and Set built-in types. Make sure that you load a polyfill in older browsers. https://reactjs.org/link/react-polyfills"
      );
      exports2.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = Internals;
      exports2.createPortal = function(children, container) {
        var key = 2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : null;
        if (!container || 1 !== container.nodeType && 9 !== container.nodeType && 11 !== container.nodeType)
          throw Error("Target container is not a DOM element.");
        return createPortal$1(children, container, null, key);
      };
      exports2.flushSync = function(fn) {
        var previousTransition = ReactSharedInternals.T, previousUpdatePriority = Internals.p;
        try {
          if (ReactSharedInternals.T = null, Internals.p = 2, fn)
            return fn();
        } finally {
          ReactSharedInternals.T = previousTransition, Internals.p = previousUpdatePriority, Internals.d.f() && console.error(
            "flushSync was called from inside a lifecycle method. React cannot flush when React is already rendering. Consider moving this call to a scheduler task or micro task."
          );
        }
      };
      exports2.preconnect = function(href, options) {
        "string" === typeof href && href ? null != options && "object" !== typeof options ? console.error(
          "ReactDOM.preconnect(): Expected the `options` argument (second) to be an object but encountered %s instead. The only supported option at this time is `crossOrigin` which accepts a string.",
          getValueDescriptorExpectingEnumForWarning(options)
        ) : null != options && "string" !== typeof options.crossOrigin && console.error(
          "ReactDOM.preconnect(): Expected the `crossOrigin` option (second argument) to be a string but encountered %s instead. Try removing this option or passing a string value instead.",
          getValueDescriptorExpectingObjectForWarning(options.crossOrigin)
        ) : console.error(
          "ReactDOM.preconnect(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.",
          getValueDescriptorExpectingObjectForWarning(href)
        );
        "string" === typeof href && (options ? (options = options.crossOrigin, options = "string" === typeof options ? "use-credentials" === options ? options : "" : void 0) : options = null, Internals.d.C(href, options));
      };
      exports2.prefetchDNS = function(href) {
        if ("string" !== typeof href || !href)
          console.error(
            "ReactDOM.prefetchDNS(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.",
            getValueDescriptorExpectingObjectForWarning(href)
          );
        else if (1 < arguments.length) {
          var options = arguments[1];
          "object" === typeof options && options.hasOwnProperty("crossOrigin") ? console.error(
            "ReactDOM.prefetchDNS(): Expected only one argument, `href`, but encountered %s as a second argument instead. This argument is reserved for future options and is currently disallowed. It looks like the you are attempting to set a crossOrigin property for this DNS lookup hint. Browsers do not perform DNS queries using CORS and setting this attribute on the resource hint has no effect. Try calling ReactDOM.prefetchDNS() with just a single string argument, `href`.",
            getValueDescriptorExpectingEnumForWarning(options)
          ) : console.error(
            "ReactDOM.prefetchDNS(): Expected only one argument, `href`, but encountered %s as a second argument instead. This argument is reserved for future options and is currently disallowed. Try calling ReactDOM.prefetchDNS() with just a single string argument, `href`.",
            getValueDescriptorExpectingEnumForWarning(options)
          );
        }
        "string" === typeof href && Internals.d.D(href);
      };
      exports2.preinit = function(href, options) {
        "string" === typeof href && href ? null == options || "object" !== typeof options ? console.error(
          "ReactDOM.preinit(): Expected the `options` argument (second) to be an object with an `as` property describing the type of resource to be preinitialized but encountered %s instead.",
          getValueDescriptorExpectingEnumForWarning(options)
        ) : "style" !== options.as && "script" !== options.as && console.error(
          'ReactDOM.preinit(): Expected the `as` property in the `options` argument (second) to contain a valid value describing the type of resource to be preinitialized but encountered %s instead. Valid values for `as` are "style" and "script".',
          getValueDescriptorExpectingEnumForWarning(options.as)
        ) : console.error(
          "ReactDOM.preinit(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.",
          getValueDescriptorExpectingObjectForWarning(href)
        );
        if ("string" === typeof href && options && "string" === typeof options.as) {
          var as = options.as, crossOrigin = getCrossOriginStringAs(as, options.crossOrigin), integrity = "string" === typeof options.integrity ? options.integrity : void 0, fetchPriority = "string" === typeof options.fetchPriority ? options.fetchPriority : void 0;
          "style" === as ? Internals.d.S(
            href,
            "string" === typeof options.precedence ? options.precedence : void 0,
            {
              crossOrigin,
              integrity,
              fetchPriority
            }
          ) : "script" === as && Internals.d.X(href, {
            crossOrigin,
            integrity,
            fetchPriority,
            nonce: "string" === typeof options.nonce ? options.nonce : void 0
          });
        }
      };
      exports2.preinitModule = function(href, options) {
        var encountered = "";
        "string" === typeof href && href || (encountered += " The `href` argument encountered was " + getValueDescriptorExpectingObjectForWarning(href) + ".");
        void 0 !== options && "object" !== typeof options ? encountered += " The `options` argument encountered was " + getValueDescriptorExpectingObjectForWarning(options) + "." : options && "as" in options && "script" !== options.as && (encountered += " The `as` option encountered was " + getValueDescriptorExpectingEnumForWarning(options.as) + ".");
        if (encountered)
          console.error(
            "ReactDOM.preinitModule(): Expected up to two arguments, a non-empty `href` string and, optionally, an `options` object with a valid `as` property.%s",
            encountered
          );
        else
          switch (encountered = options && "string" === typeof options.as ? options.as : "script", encountered) {
            case "script":
              break;
            default:
              encountered = getValueDescriptorExpectingEnumForWarning(encountered), console.error(
                'ReactDOM.preinitModule(): Currently the only supported "as" type for this function is "script" but received "%s" instead. This warning was generated for `href` "%s". In the future other module types will be supported, aligning with the import-attributes proposal. Learn more here: (https://github.com/tc39/proposal-import-attributes)',
                encountered,
                href
              );
          }
        if ("string" === typeof href)
          if ("object" === typeof options && null !== options) {
            if (null == options.as || "script" === options.as)
              encountered = getCrossOriginStringAs(
                options.as,
                options.crossOrigin
              ), Internals.d.M(href, {
                crossOrigin: encountered,
                integrity: "string" === typeof options.integrity ? options.integrity : void 0,
                nonce: "string" === typeof options.nonce ? options.nonce : void 0
              });
          } else null == options && Internals.d.M(href);
      };
      exports2.preload = function(href, options) {
        var encountered = "";
        "string" === typeof href && href || (encountered += " The `href` argument encountered was " + getValueDescriptorExpectingObjectForWarning(href) + ".");
        null == options || "object" !== typeof options ? encountered += " The `options` argument encountered was " + getValueDescriptorExpectingObjectForWarning(options) + "." : "string" === typeof options.as && options.as || (encountered += " The `as` option encountered was " + getValueDescriptorExpectingObjectForWarning(options.as) + ".");
        encountered && console.error(
          'ReactDOM.preload(): Expected two arguments, a non-empty `href` string and an `options` object with an `as` property valid for a `<link rel="preload" as="..." />` tag.%s',
          encountered
        );
        if ("string" === typeof href && "object" === typeof options && null !== options && "string" === typeof options.as) {
          encountered = options.as;
          var crossOrigin = getCrossOriginStringAs(
            encountered,
            options.crossOrigin
          );
          Internals.d.L(href, encountered, {
            crossOrigin,
            integrity: "string" === typeof options.integrity ? options.integrity : void 0,
            nonce: "string" === typeof options.nonce ? options.nonce : void 0,
            type: "string" === typeof options.type ? options.type : void 0,
            fetchPriority: "string" === typeof options.fetchPriority ? options.fetchPriority : void 0,
            referrerPolicy: "string" === typeof options.referrerPolicy ? options.referrerPolicy : void 0,
            imageSrcSet: "string" === typeof options.imageSrcSet ? options.imageSrcSet : void 0,
            imageSizes: "string" === typeof options.imageSizes ? options.imageSizes : void 0,
            media: "string" === typeof options.media ? options.media : void 0
          });
        }
      };
      exports2.preloadModule = function(href, options) {
        var encountered = "";
        "string" === typeof href && href || (encountered += " The `href` argument encountered was " + getValueDescriptorExpectingObjectForWarning(href) + ".");
        void 0 !== options && "object" !== typeof options ? encountered += " The `options` argument encountered was " + getValueDescriptorExpectingObjectForWarning(options) + "." : options && "as" in options && "string" !== typeof options.as && (encountered += " The `as` option encountered was " + getValueDescriptorExpectingObjectForWarning(options.as) + ".");
        encountered && console.error(
          'ReactDOM.preloadModule(): Expected two arguments, a non-empty `href` string and, optionally, an `options` object with an `as` property valid for a `<link rel="modulepreload" as="..." />` tag.%s',
          encountered
        );
        "string" === typeof href && (options ? (encountered = getCrossOriginStringAs(
          options.as,
          options.crossOrigin
        ), Internals.d.m(href, {
          as: "string" === typeof options.as && "script" !== options.as ? options.as : void 0,
          crossOrigin: encountered,
          integrity: "string" === typeof options.integrity ? options.integrity : void 0
        })) : Internals.d.m(href));
      };
      exports2.requestFormReset = function(form) {
        Internals.d.r(form);
      };
      exports2.unstable_batchedUpdates = function(fn, a) {
        return fn(a);
      };
      exports2.useFormState = function(action, initialState, permalink) {
        return resolveDispatcher().useFormState(action, initialState, permalink);
      };
      exports2.useFormStatus = function() {
        return resolveDispatcher().useHostTransitionStatus();
      };
      exports2.version = "19.2.6";
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
    })();
  }
});

// node_modules/react-dom/index.js
var require_react_dom = __commonJS({
  "node_modules/react-dom/index.js"(exports2, module2) {
    "use strict";
    function checkDCE() {
      if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== "function") {
        return;
      }
      if (process.env.NODE_ENV !== "production") {
        throw new Error("^_^");
      }
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
      } catch (err) {
        console.error(err);
      }
    }
    if (process.env.NODE_ENV === "production") {
      checkDCE();
      module2.exports = require_react_dom_production();
    } else {
      module2.exports = require_react_dom_development();
    }
  }
});

// node_modules/sonner/dist/index.mjs
function __insertCSS(code) {
  if (!code || typeof document == "undefined") return;
  let head = document.head || document.getElementsByTagName("head")[0];
  let style = document.createElement("style");
  style.type = "text/css";
  head.appendChild(style);
  style.styleSheet ? style.styleSheet.cssText = code : style.appendChild(document.createTextNode(code));
}
var import_react, import_react_dom, bars, toastsCounter, Observer, ToastState, toastFunction, isHttpResponse, basicToast, getHistory, getToasts, toast;
var init_dist = __esm({
  "node_modules/sonner/dist/index.mjs"() {
    "use client";
    import_react = __toESM(require_react(), 1);
    import_react_dom = __toESM(require_react_dom(), 1);
    bars = Array(12).fill(0);
    toastsCounter = 1;
    Observer = class {
      constructor() {
        this.subscribe = (subscriber) => {
          this.subscribers.push(subscriber);
          return () => {
            const index = this.subscribers.indexOf(subscriber);
            this.subscribers.splice(index, 1);
          };
        };
        this.publish = (data) => {
          this.subscribers.forEach((subscriber) => subscriber(data));
        };
        this.addToast = (data) => {
          this.publish(data);
          this.toasts = [
            ...this.toasts,
            data
          ];
        };
        this.create = (data) => {
          var _data_id;
          const { message, ...rest } = data;
          const id = typeof (data == null ? void 0 : data.id) === "number" || ((_data_id = data.id) == null ? void 0 : _data_id.length) > 0 ? data.id : toastsCounter++;
          const alreadyExists = this.toasts.find((toast2) => {
            return toast2.id === id;
          });
          const dismissible = data.dismissible === void 0 ? true : data.dismissible;
          if (this.dismissedToasts.has(id)) {
            this.dismissedToasts.delete(id);
          }
          if (alreadyExists) {
            this.toasts = this.toasts.map((toast2) => {
              if (toast2.id === id) {
                this.publish({
                  ...toast2,
                  ...data,
                  id,
                  title: message
                });
                return {
                  ...toast2,
                  ...data,
                  id,
                  dismissible,
                  title: message
                };
              }
              return toast2;
            });
          } else {
            this.addToast({
              title: message,
              ...rest,
              dismissible,
              id
            });
          }
          return id;
        };
        this.dismiss = (id) => {
          if (id) {
            this.dismissedToasts.add(id);
            requestAnimationFrame(() => this.subscribers.forEach((subscriber) => subscriber({
              id,
              dismiss: true
            })));
          } else {
            this.toasts.forEach((toast2) => {
              this.subscribers.forEach((subscriber) => subscriber({
                id: toast2.id,
                dismiss: true
              }));
            });
          }
          return id;
        };
        this.message = (message, data) => {
          return this.create({
            ...data,
            message
          });
        };
        this.error = (message, data) => {
          return this.create({
            ...data,
            message,
            type: "error"
          });
        };
        this.success = (message, data) => {
          return this.create({
            ...data,
            type: "success",
            message
          });
        };
        this.info = (message, data) => {
          return this.create({
            ...data,
            type: "info",
            message
          });
        };
        this.warning = (message, data) => {
          return this.create({
            ...data,
            type: "warning",
            message
          });
        };
        this.loading = (message, data) => {
          return this.create({
            ...data,
            type: "loading",
            message
          });
        };
        this.promise = (promise, data) => {
          if (!data) {
            return;
          }
          let id = void 0;
          if (data.loading !== void 0) {
            id = this.create({
              ...data,
              promise,
              type: "loading",
              message: data.loading,
              description: typeof data.description !== "function" ? data.description : void 0
            });
          }
          const p = Promise.resolve(promise instanceof Function ? promise() : promise);
          let shouldDismiss = id !== void 0;
          let result;
          const originalPromise = p.then(async (response) => {
            result = [
              "resolve",
              response
            ];
            const isReactElementResponse = import_react.default.isValidElement(response);
            if (isReactElementResponse) {
              shouldDismiss = false;
              this.create({
                id,
                type: "default",
                message: response
              });
            } else if (isHttpResponse(response) && !response.ok) {
              shouldDismiss = false;
              const promiseData = typeof data.error === "function" ? await data.error(`HTTP error! status: ${response.status}`) : data.error;
              const description = typeof data.description === "function" ? await data.description(`HTTP error! status: ${response.status}`) : data.description;
              const isExtendedResult = typeof promiseData === "object" && !import_react.default.isValidElement(promiseData);
              const toastSettings = isExtendedResult ? promiseData : {
                message: promiseData
              };
              this.create({
                id,
                type: "error",
                description,
                ...toastSettings
              });
            } else if (response instanceof Error) {
              shouldDismiss = false;
              const promiseData = typeof data.error === "function" ? await data.error(response) : data.error;
              const description = typeof data.description === "function" ? await data.description(response) : data.description;
              const isExtendedResult = typeof promiseData === "object" && !import_react.default.isValidElement(promiseData);
              const toastSettings = isExtendedResult ? promiseData : {
                message: promiseData
              };
              this.create({
                id,
                type: "error",
                description,
                ...toastSettings
              });
            } else if (data.success !== void 0) {
              shouldDismiss = false;
              const promiseData = typeof data.success === "function" ? await data.success(response) : data.success;
              const description = typeof data.description === "function" ? await data.description(response) : data.description;
              const isExtendedResult = typeof promiseData === "object" && !import_react.default.isValidElement(promiseData);
              const toastSettings = isExtendedResult ? promiseData : {
                message: promiseData
              };
              this.create({
                id,
                type: "success",
                description,
                ...toastSettings
              });
            }
          }).catch(async (error) => {
            result = [
              "reject",
              error
            ];
            if (data.error !== void 0) {
              shouldDismiss = false;
              const promiseData = typeof data.error === "function" ? await data.error(error) : data.error;
              const description = typeof data.description === "function" ? await data.description(error) : data.description;
              const isExtendedResult = typeof promiseData === "object" && !import_react.default.isValidElement(promiseData);
              const toastSettings = isExtendedResult ? promiseData : {
                message: promiseData
              };
              this.create({
                id,
                type: "error",
                description,
                ...toastSettings
              });
            }
          }).finally(() => {
            if (shouldDismiss) {
              this.dismiss(id);
              id = void 0;
            }
            data.finally == null ? void 0 : data.finally.call(data);
          });
          const unwrap = () => new Promise((resolve, reject) => originalPromise.then(() => result[0] === "reject" ? reject(result[1]) : resolve(result[1])).catch(reject));
          if (typeof id !== "string" && typeof id !== "number") {
            return {
              unwrap
            };
          } else {
            return Object.assign(id, {
              unwrap
            });
          }
        };
        this.custom = (jsx, data) => {
          const id = (data == null ? void 0 : data.id) || toastsCounter++;
          this.create({
            jsx: jsx(id),
            id,
            ...data
          });
          return id;
        };
        this.getActiveToasts = () => {
          return this.toasts.filter((toast2) => !this.dismissedToasts.has(toast2.id));
        };
        this.subscribers = [];
        this.toasts = [];
        this.dismissedToasts = /* @__PURE__ */ new Set();
      }
    };
    ToastState = new Observer();
    toastFunction = (message, data) => {
      const id = (data == null ? void 0 : data.id) || toastsCounter++;
      ToastState.addToast({
        title: message,
        ...data,
        id
      });
      return id;
    };
    isHttpResponse = (data) => {
      return data && typeof data === "object" && "ok" in data && typeof data.ok === "boolean" && "status" in data && typeof data.status === "number";
    };
    basicToast = toastFunction;
    getHistory = () => ToastState.toasts;
    getToasts = () => ToastState.getActiveToasts();
    toast = Object.assign(basicToast, {
      success: ToastState.success,
      info: ToastState.info,
      warning: ToastState.warning,
      error: ToastState.error,
      custom: ToastState.custom,
      message: ToastState.message,
      promise: ToastState.promise,
      dismiss: ToastState.dismiss,
      loading: ToastState.loading
    }, {
      getHistory,
      getToasts
    });
    __insertCSS("[data-sonner-toaster][dir=ltr],html[dir=ltr]{--toast-icon-margin-start:-3px;--toast-icon-margin-end:4px;--toast-svg-margin-start:-1px;--toast-svg-margin-end:0px;--toast-button-margin-start:auto;--toast-button-margin-end:0;--toast-close-button-start:0;--toast-close-button-end:unset;--toast-close-button-transform:translate(-35%, -35%)}[data-sonner-toaster][dir=rtl],html[dir=rtl]{--toast-icon-margin-start:4px;--toast-icon-margin-end:-3px;--toast-svg-margin-start:0px;--toast-svg-margin-end:-1px;--toast-button-margin-start:0;--toast-button-margin-end:auto;--toast-close-button-start:unset;--toast-close-button-end:0;--toast-close-button-transform:translate(35%, -35%)}[data-sonner-toaster]{position:fixed;width:var(--width);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji;--gray1:hsl(0, 0%, 99%);--gray2:hsl(0, 0%, 97.3%);--gray3:hsl(0, 0%, 95.1%);--gray4:hsl(0, 0%, 93%);--gray5:hsl(0, 0%, 90.9%);--gray6:hsl(0, 0%, 88.7%);--gray7:hsl(0, 0%, 85.8%);--gray8:hsl(0, 0%, 78%);--gray9:hsl(0, 0%, 56.1%);--gray10:hsl(0, 0%, 52.3%);--gray11:hsl(0, 0%, 43.5%);--gray12:hsl(0, 0%, 9%);--border-radius:8px;box-sizing:border-box;padding:0;margin:0;list-style:none;outline:0;z-index:999999999;transition:transform .4s ease}@media (hover:none) and (pointer:coarse){[data-sonner-toaster][data-lifted=true]{transform:none}}[data-sonner-toaster][data-x-position=right]{right:var(--offset-right)}[data-sonner-toaster][data-x-position=left]{left:var(--offset-left)}[data-sonner-toaster][data-x-position=center]{left:50%;transform:translateX(-50%)}[data-sonner-toaster][data-y-position=top]{top:var(--offset-top)}[data-sonner-toaster][data-y-position=bottom]{bottom:var(--offset-bottom)}[data-sonner-toast]{--y:translateY(100%);--lift-amount:calc(var(--lift) * var(--gap));z-index:var(--z-index);position:absolute;opacity:0;transform:var(--y);touch-action:none;transition:transform .4s,opacity .4s,height .4s,box-shadow .2s;box-sizing:border-box;outline:0;overflow-wrap:anywhere}[data-sonner-toast][data-styled=true]{padding:16px;background:var(--normal-bg);border:1px solid var(--normal-border);color:var(--normal-text);border-radius:var(--border-radius);box-shadow:0 4px 12px rgba(0,0,0,.1);width:var(--width);font-size:13px;display:flex;align-items:center;gap:6px}[data-sonner-toast]:focus-visible{box-shadow:0 4px 12px rgba(0,0,0,.1),0 0 0 2px rgba(0,0,0,.2)}[data-sonner-toast][data-y-position=top]{top:0;--y:translateY(-100%);--lift:1;--lift-amount:calc(1 * var(--gap))}[data-sonner-toast][data-y-position=bottom]{bottom:0;--y:translateY(100%);--lift:-1;--lift-amount:calc(var(--lift) * var(--gap))}[data-sonner-toast][data-styled=true] [data-description]{font-weight:400;line-height:1.4;color:#3f3f3f}[data-rich-colors=true][data-sonner-toast][data-styled=true] [data-description]{color:inherit}[data-sonner-toaster][data-sonner-theme=dark] [data-description]{color:#e8e8e8}[data-sonner-toast][data-styled=true] [data-title]{font-weight:500;line-height:1.5;color:inherit}[data-sonner-toast][data-styled=true] [data-icon]{display:flex;height:16px;width:16px;position:relative;justify-content:flex-start;align-items:center;flex-shrink:0;margin-left:var(--toast-icon-margin-start);margin-right:var(--toast-icon-margin-end)}[data-sonner-toast][data-promise=true] [data-icon]>svg{opacity:0;transform:scale(.8);transform-origin:center;animation:sonner-fade-in .3s ease forwards}[data-sonner-toast][data-styled=true] [data-icon]>*{flex-shrink:0}[data-sonner-toast][data-styled=true] [data-icon] svg{margin-left:var(--toast-svg-margin-start);margin-right:var(--toast-svg-margin-end)}[data-sonner-toast][data-styled=true] [data-content]{display:flex;flex-direction:column;gap:2px}[data-sonner-toast][data-styled=true] [data-button]{border-radius:4px;padding-left:8px;padding-right:8px;height:24px;font-size:12px;color:var(--normal-bg);background:var(--normal-text);margin-left:var(--toast-button-margin-start);margin-right:var(--toast-button-margin-end);border:none;font-weight:500;cursor:pointer;outline:0;display:flex;align-items:center;flex-shrink:0;transition:opacity .4s,box-shadow .2s}[data-sonner-toast][data-styled=true] [data-button]:focus-visible{box-shadow:0 0 0 2px rgba(0,0,0,.4)}[data-sonner-toast][data-styled=true] [data-button]:first-of-type{margin-left:var(--toast-button-margin-start);margin-right:var(--toast-button-margin-end)}[data-sonner-toast][data-styled=true] [data-cancel]{color:var(--normal-text);background:rgba(0,0,0,.08)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast][data-styled=true] [data-cancel]{background:rgba(255,255,255,.3)}[data-sonner-toast][data-styled=true] [data-close-button]{position:absolute;left:var(--toast-close-button-start);right:var(--toast-close-button-end);top:0;height:20px;width:20px;display:flex;justify-content:center;align-items:center;padding:0;color:var(--gray12);background:var(--normal-bg);border:1px solid var(--gray4);transform:var(--toast-close-button-transform);border-radius:50%;cursor:pointer;z-index:1;transition:opacity .1s,background .2s,border-color .2s}[data-sonner-toast][data-styled=true] [data-close-button]:focus-visible{box-shadow:0 4px 12px rgba(0,0,0,.1),0 0 0 2px rgba(0,0,0,.2)}[data-sonner-toast][data-styled=true] [data-disabled=true]{cursor:not-allowed}[data-sonner-toast][data-styled=true]:hover [data-close-button]:hover{background:var(--gray2);border-color:var(--gray5)}[data-sonner-toast][data-swiping=true]::before{content:'';position:absolute;left:-100%;right:-100%;height:100%;z-index:-1}[data-sonner-toast][data-y-position=top][data-swiping=true]::before{bottom:50%;transform:scaleY(3) translateY(50%)}[data-sonner-toast][data-y-position=bottom][data-swiping=true]::before{top:50%;transform:scaleY(3) translateY(-50%)}[data-sonner-toast][data-swiping=false][data-removed=true]::before{content:'';position:absolute;inset:0;transform:scaleY(2)}[data-sonner-toast][data-expanded=true]::after{content:'';position:absolute;left:0;height:calc(var(--gap) + 1px);bottom:100%;width:100%}[data-sonner-toast][data-mounted=true]{--y:translateY(0);opacity:1}[data-sonner-toast][data-expanded=false][data-front=false]{--scale:var(--toasts-before) * 0.05 + 1;--y:translateY(calc(var(--lift-amount) * var(--toasts-before))) scale(calc(-1 * var(--scale)));height:var(--front-toast-height)}[data-sonner-toast]>*{transition:opacity .4s}[data-sonner-toast][data-x-position=right]{right:0}[data-sonner-toast][data-x-position=left]{left:0}[data-sonner-toast][data-expanded=false][data-front=false][data-styled=true]>*{opacity:0}[data-sonner-toast][data-visible=false]{opacity:0;pointer-events:none}[data-sonner-toast][data-mounted=true][data-expanded=true]{--y:translateY(calc(var(--lift) * var(--offset)));height:var(--initial-height)}[data-sonner-toast][data-removed=true][data-front=true][data-swipe-out=false]{--y:translateY(calc(var(--lift) * -100%));opacity:0}[data-sonner-toast][data-removed=true][data-front=false][data-swipe-out=false][data-expanded=true]{--y:translateY(calc(var(--lift) * var(--offset) + var(--lift) * -100%));opacity:0}[data-sonner-toast][data-removed=true][data-front=false][data-swipe-out=false][data-expanded=false]{--y:translateY(40%);opacity:0;transition:transform .5s,opacity .2s}[data-sonner-toast][data-removed=true][data-front=false]::before{height:calc(var(--initial-height) + 20%)}[data-sonner-toast][data-swiping=true]{transform:var(--y) translateY(var(--swipe-amount-y,0)) translateX(var(--swipe-amount-x,0));transition:none}[data-sonner-toast][data-swiped=true]{user-select:none}[data-sonner-toast][data-swipe-out=true][data-y-position=bottom],[data-sonner-toast][data-swipe-out=true][data-y-position=top]{animation-duration:.2s;animation-timing-function:ease-out;animation-fill-mode:forwards}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=left]{animation-name:swipe-out-left}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=right]{animation-name:swipe-out-right}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=up]{animation-name:swipe-out-up}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=down]{animation-name:swipe-out-down}@keyframes swipe-out-left{from{transform:var(--y) translateX(var(--swipe-amount-x));opacity:1}to{transform:var(--y) translateX(calc(var(--swipe-amount-x) - 100%));opacity:0}}@keyframes swipe-out-right{from{transform:var(--y) translateX(var(--swipe-amount-x));opacity:1}to{transform:var(--y) translateX(calc(var(--swipe-amount-x) + 100%));opacity:0}}@keyframes swipe-out-up{from{transform:var(--y) translateY(var(--swipe-amount-y));opacity:1}to{transform:var(--y) translateY(calc(var(--swipe-amount-y) - 100%));opacity:0}}@keyframes swipe-out-down{from{transform:var(--y) translateY(var(--swipe-amount-y));opacity:1}to{transform:var(--y) translateY(calc(var(--swipe-amount-y) + 100%));opacity:0}}@media (max-width:600px){[data-sonner-toaster]{position:fixed;right:var(--mobile-offset-right);left:var(--mobile-offset-left);width:100%}[data-sonner-toaster][dir=rtl]{left:calc(var(--mobile-offset-left) * -1)}[data-sonner-toaster] [data-sonner-toast]{left:0;right:0;width:calc(100% - var(--mobile-offset-left) * 2)}[data-sonner-toaster][data-x-position=left]{left:var(--mobile-offset-left)}[data-sonner-toaster][data-y-position=bottom]{bottom:var(--mobile-offset-bottom)}[data-sonner-toaster][data-y-position=top]{top:var(--mobile-offset-top)}[data-sonner-toaster][data-x-position=center]{left:var(--mobile-offset-left);right:var(--mobile-offset-right);transform:none}}[data-sonner-toaster][data-sonner-theme=light]{--normal-bg:#fff;--normal-border:var(--gray4);--normal-text:var(--gray12);--success-bg:hsl(143, 85%, 96%);--success-border:hsl(145, 92%, 87%);--success-text:hsl(140, 100%, 27%);--info-bg:hsl(208, 100%, 97%);--info-border:hsl(221, 91%, 93%);--info-text:hsl(210, 92%, 45%);--warning-bg:hsl(49, 100%, 97%);--warning-border:hsl(49, 91%, 84%);--warning-text:hsl(31, 92%, 45%);--error-bg:hsl(359, 100%, 97%);--error-border:hsl(359, 100%, 94%);--error-text:hsl(360, 100%, 45%)}[data-sonner-toaster][data-sonner-theme=light] [data-sonner-toast][data-invert=true]{--normal-bg:#000;--normal-border:hsl(0, 0%, 20%);--normal-text:var(--gray1)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast][data-invert=true]{--normal-bg:#fff;--normal-border:var(--gray3);--normal-text:var(--gray12)}[data-sonner-toaster][data-sonner-theme=dark]{--normal-bg:#000;--normal-bg-hover:hsl(0, 0%, 12%);--normal-border:hsl(0, 0%, 20%);--normal-border-hover:hsl(0, 0%, 25%);--normal-text:var(--gray1);--success-bg:hsl(150, 100%, 6%);--success-border:hsl(147, 100%, 12%);--success-text:hsl(150, 86%, 65%);--info-bg:hsl(215, 100%, 6%);--info-border:hsl(223, 43%, 17%);--info-text:hsl(216, 87%, 65%);--warning-bg:hsl(64, 100%, 6%);--warning-border:hsl(60, 100%, 9%);--warning-text:hsl(46, 87%, 65%);--error-bg:hsl(358, 76%, 10%);--error-border:hsl(357, 89%, 16%);--error-text:hsl(358, 100%, 81%)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast] [data-close-button]{background:var(--normal-bg);border-color:var(--normal-border);color:var(--normal-text)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast] [data-close-button]:hover{background:var(--normal-bg-hover);border-color:var(--normal-border-hover)}[data-rich-colors=true][data-sonner-toast][data-type=success]{background:var(--success-bg);border-color:var(--success-border);color:var(--success-text)}[data-rich-colors=true][data-sonner-toast][data-type=success] [data-close-button]{background:var(--success-bg);border-color:var(--success-border);color:var(--success-text)}[data-rich-colors=true][data-sonner-toast][data-type=info]{background:var(--info-bg);border-color:var(--info-border);color:var(--info-text)}[data-rich-colors=true][data-sonner-toast][data-type=info] [data-close-button]{background:var(--info-bg);border-color:var(--info-border);color:var(--info-text)}[data-rich-colors=true][data-sonner-toast][data-type=warning]{background:var(--warning-bg);border-color:var(--warning-border);color:var(--warning-text)}[data-rich-colors=true][data-sonner-toast][data-type=warning] [data-close-button]{background:var(--warning-bg);border-color:var(--warning-border);color:var(--warning-text)}[data-rich-colors=true][data-sonner-toast][data-type=error]{background:var(--error-bg);border-color:var(--error-border);color:var(--error-text)}[data-rich-colors=true][data-sonner-toast][data-type=error] [data-close-button]{background:var(--error-bg);border-color:var(--error-border);color:var(--error-text)}.sonner-loading-wrapper{--size:16px;height:var(--size);width:var(--size);position:absolute;inset:0;z-index:10}.sonner-loading-wrapper[data-visible=false]{transform-origin:center;animation:sonner-fade-out .2s ease forwards}.sonner-spinner{position:relative;top:50%;left:50%;height:var(--size);width:var(--size)}.sonner-loading-bar{animation:sonner-spin 1.2s linear infinite;background:var(--gray11);border-radius:6px;height:8%;left:-10%;position:absolute;top:-3.9%;width:24%}.sonner-loading-bar:first-child{animation-delay:-1.2s;transform:rotate(.0001deg) translate(146%)}.sonner-loading-bar:nth-child(2){animation-delay:-1.1s;transform:rotate(30deg) translate(146%)}.sonner-loading-bar:nth-child(3){animation-delay:-1s;transform:rotate(60deg) translate(146%)}.sonner-loading-bar:nth-child(4){animation-delay:-.9s;transform:rotate(90deg) translate(146%)}.sonner-loading-bar:nth-child(5){animation-delay:-.8s;transform:rotate(120deg) translate(146%)}.sonner-loading-bar:nth-child(6){animation-delay:-.7s;transform:rotate(150deg) translate(146%)}.sonner-loading-bar:nth-child(7){animation-delay:-.6s;transform:rotate(180deg) translate(146%)}.sonner-loading-bar:nth-child(8){animation-delay:-.5s;transform:rotate(210deg) translate(146%)}.sonner-loading-bar:nth-child(9){animation-delay:-.4s;transform:rotate(240deg) translate(146%)}.sonner-loading-bar:nth-child(10){animation-delay:-.3s;transform:rotate(270deg) translate(146%)}.sonner-loading-bar:nth-child(11){animation-delay:-.2s;transform:rotate(300deg) translate(146%)}.sonner-loading-bar:nth-child(12){animation-delay:-.1s;transform:rotate(330deg) translate(146%)}@keyframes sonner-fade-in{0%{opacity:0;transform:scale(.8)}100%{opacity:1;transform:scale(1)}}@keyframes sonner-fade-out{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.8)}}@keyframes sonner-spin{0%{opacity:1}100%{opacity:.15}}@media (prefers-reduced-motion){.sonner-loading-bar,[data-sonner-toast],[data-sonner-toast]>*{transition:none!important;animation:none!important}}.sonner-loader{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);transform-origin:center;transition:opacity .2s,transform .2s}.sonner-loader[data-visible=false]{opacity:0;transform:scale(.8) translate(-50%,-50%)}");
  }
});

// src/lib/local-llm.ts
function emit2() {
  listeners2.forEach((l) => {
    try {
      l();
    } catch {
    }
  });
}
function getLocalLlmStatus() {
  if (pipePromise) return "downloading";
  try {
    return localStorage.getItem(STATE_KEY2) === "ready" ? "ready" : "none";
  } catch {
    return "none";
  }
}
function isAutoFallbackEnabled() {
  try {
    return localStorage.getItem(LOCAL_LLM_AUTO_KEY) === "1";
  } catch {
    return false;
  }
}
function isLocalLlmReady() {
  return getLocalLlmStatus() === "ready";
}
async function downloadLocalLlm() {
  if (pipePromise) return pipePromise;
  downloadProgress = 0;
  emit2();
  pipePromise = (async () => {
    const tf = await import("@huggingface/transformers");
    tf.env.allowLocalModels = true;
    tf.env.localModelPath = "/models/";
    tf.env.allowRemoteModels = true;
    const device = navigator.gpu ? "webgpu" : "wasm";
    let lastActivity = Date.now();
    const progress_callback = (p) => {
      lastActivity = Date.now();
      if (p?.status === "progress" && typeof p.progress === "number") {
        const v = Math.max(downloadProgress, Math.min(99, Math.round(p.progress)));
        if (v !== downloadProgress) {
          downloadProgress = v;
          emit2();
        }
      }
    };
    const build = () => new Promise((resolve, reject) => {
      const watchdog = setInterval(() => {
        if (downloadProgress >= 99) {
          clearInterval(watchdog);
          return;
        }
        if (Date.now() - lastActivity > 45e3) {
          clearInterval(watchdog);
          reject(new Error("download-timeout"));
        }
      }, 5e3);
      tf.pipeline("text-generation", MODEL_ID2, { dtype: "q4", device, progress_callback }).then((r) => {
        clearInterval(watchdog);
        resolve(r);
      }).catch((e) => {
        clearInterval(watchdog);
        reject(e);
      });
    });
    const zh = (navigator.language || "").toLowerCase().startsWith("zh") || /android/i.test(navigator.userAgent);
    const hosts = zh ? ["https://hf-mirror.com", "https://huggingface.co"] : ["https://huggingface.co", "https://hf-mirror.com"];
    let lastErr = null;
    for (const host of hosts) {
      tf.env.remoteHost = host;
      tf.env.remotePathTemplate = "{model}/resolve/{revision}/";
      lastActivity = Date.now();
      try {
        return await build();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  })();
  try {
    await pipePromise;
    try {
      localStorage.setItem(STATE_KEY2, "ready");
    } catch {
    }
    downloadProgress = 100;
    emit2();
  } catch (e) {
    pipePromise = null;
    downloadProgress = -1;
    emit2();
    throw e;
  }
}
async function getPipe() {
  if (pipePromise) return pipePromise;
  try {
    if (localStorage.getItem(STATE_KEY2) !== "ready") return null;
  } catch {
    return null;
  }
  await downloadLocalLlm();
  return pipePromise;
}
async function* localStreamChat(messages, opts = {}) {
  const pipe = await getPipe();
  if (!pipe) throw new Error("\u79BB\u7EBF\u5C0F\u6A21\u578B\u672A\u4E0B\u8F7D");
  if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
  const tf = await import("@huggingface/transformers");
  const queue = [];
  let finished = false;
  let failed = null;
  let outResult = null;
  let notify = null;
  const wake = () => {
    const n = notify;
    notify = null;
    n?.();
  };
  let streamedAny = false;
  const streamer = new tf.TextStreamer(pipe.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (t) => {
      if (t) {
        streamedAny = true;
        queue.push(t);
        wake();
      }
    }
  });
  pipe(messages, {
    max_new_tokens: opts.maxTokens ?? 400,
    do_sample: true,
    temperature: opts.temperature ?? 0.7,
    streamer
  }).then((out) => {
    outResult = out;
    finished = true;
    wake();
  }).catch((e) => {
    failed = e instanceof Error ? e : new Error(String(e));
    finished = true;
    wake();
  });
  try {
    while (!finished || queue.length) {
      if (opts.signal?.aborted) {
        queue.length = 0;
        throw new DOMException("aborted", "AbortError");
      }
      if (queue.length) {
        yield { content: queue.shift(), done: false };
        continue;
      }
      await new Promise((r) => {
        notify = r;
        setTimeout(r, 60);
      });
    }
    if (failed) throw failed;
    if (!streamedAny && outResult) {
      const text = outResult?.[0]?.generated_text;
      const last = Array.isArray(text) ? text.at(-1)?.content ?? "" : String(text ?? "");
      if (last) yield { content: last, done: false };
    }
    yield { content: "", done: true };
  } finally {
  }
}
var MODEL_ID2, STATE_KEY2, LOCAL_LLM_AUTO_KEY, pipePromise, downloadProgress, listeners2;
var init_local_llm = __esm({
  "src/lib/local-llm.ts"() {
    MODEL_ID2 = "onnx-community/Qwen2.5-0.5B-Instruct";
    STATE_KEY2 = "__nativethink_local_llm_state";
    LOCAL_LLM_AUTO_KEY = "__nativethink_local_llm_auto";
    pipePromise = null;
    downloadProgress = -1;
    listeners2 = /* @__PURE__ */ new Set();
  }
});

// src/services/ai-service.ts
var ai_service_exports = {};
__export(ai_service_exports, {
  appendUserMessage: () => appendUserMessage,
  buildMessages: () => buildMessages,
  chat: () => chat,
  streamChat: () => streamChat
});
async function* apiStreamChat(messages, options = {}) {
  const provider = resolveProvider(options.provider);
  const config = PROVIDER_CONFIGS[provider];
  const body = {
    provider,
    model: options.model || config.freeModel,
    messages,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    stream: true,
    apiKey: getAPIKey(provider) || void 0
  };
  let response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal
  });
  if (response.status === 503) {
    throw new Error(
      `\u670D\u52A1\u7AEF AI Key \u672A\u914D\u7F6E\u3002\u8BF7\u5728\u670D\u52A1\u7AEF\u8BBE\u7F6E ${config.name} API Key\u3002
DeepSeek: https://platform.deepseek.com
\u8C46\u5305: https://console.volcengine.com/ark`
    );
  }
  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    let errorMsg;
    try {
      const err = JSON.parse(errorText);
      errorMsg = err.error?.message || err.message || errorText;
    } catch {
      errorMsg = errorText || `HTTP ${response.status}`;
    }
    throw new Error(`${config.name} API \u9519\u8BEF (${response.status}): ${errorMsg}`);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(`${config.name} \u54CD\u5E94\u6CA1\u6709 body`);
  }
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          yield { content: "", done: true };
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            yield { content, done: false };
          }
          if (parsed.choices?.[0]?.finish_reason) {
            yield { content: "", done: true };
            return;
          }
        } catch {
        }
      }
    }
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data: ") && trimmed !== "data: [DONE]") {
        try {
          const parsed = JSON.parse(trimmed.slice(6));
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            yield { content, done: false };
          }
        } catch {
        }
      }
    }
    yield { content: "", done: true };
  } finally {
    reader.releaseLock();
  }
}
async function apiChat(messages, options = {}) {
  const provider = resolveProvider(options.provider);
  const config = PROVIDER_CONFIGS[provider];
  const body = {
    provider,
    model: options.model || config.freeModel,
    messages,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    stream: false,
    apiKey: getAPIKey(provider) || void 0
  };
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal
  });
  if (response.status === 503) {
    throw new Error(
      `\u670D\u52A1\u7AEF AI Key \u672A\u914D\u7F6E\u3002\u8BF7\u5728\u670D\u52A1\u7AEF\u8BBE\u7F6E ${config.name} API Key\u3002
DeepSeek: https://platform.deepseek.com
\u8C46\u5305: https://console.volcengine.com/ark`
    );
  }
  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    let errorMsg;
    try {
      const err = JSON.parse(errorText);
      errorMsg = err.error?.message || err.message || errorText;
    } catch {
      errorMsg = errorText || `HTTP ${response.status}`;
    }
    throw new Error(`${config.name} API \u9519\u8BEF (${response.status}): ${errorMsg}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}
function resolveProvider(preferred) {
  if (preferred && getAPIKey(preferred)) {
    return preferred;
  }
  const configured = getConfiguredProviders();
  if (configured.length > 0) {
    const active = getActiveProvider();
    if (configured.includes(active)) return active;
    return configured[0];
  }
  return getActiveProvider();
}
function buildMessages(systemPrompt, userContent) {
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ];
}
function appendUserMessage(existing, userContent) {
  return [...existing, { role: "user", content: userContent }];
}
function hintOfflineFallback() {
  const now = Date.now();
  if (now - lastFallbackToast < 3e4) return;
  lastFallbackToast = now;
  if (isLocalLlmReady()) {
    toast.info("AI \u670D\u52A1\u4E0D\u53EF\u7528\uFF0C\u5DF2\u5207\u6362\u79BB\u7EBF\u5C0F\u6A21\u578B", { duration: 2500 });
  } else {
    toast.info("AI \u670D\u52A1\u4E0D\u53EF\u7528 \u2014 \u53EF\u5728 AI \u8BBE\u7F6E\u4E2D\u4E0B\u8F7D\u79BB\u7EBF\u5907\u7528\u5C0F\u6A21\u578B", { duration: 3500 });
  }
}
async function* streamChat(messages, options = {}) {
  try {
    for await (const chunk of apiStreamChat(messages, options)) {
      yield chunk;
    }
    return;
  } catch (err) {
    if (options.signal?.aborted) throw err;
    if (!isAutoFallbackEnabled() || !isLocalLlmReady()) {
      hintOfflineFallback();
      throw err;
    }
    for await (const chunk of localStreamChat(messages, {
      maxTokens: options.maxTokens ? Math.min(options.maxTokens, 600) : 400,
      temperature: options.temperature,
      signal: options.signal
    })) {
      yield chunk;
    }
  }
}
async function chat(messages, options = {}) {
  try {
    return await apiChat(messages, options);
  } catch (err) {
    if (options.signal?.aborted) throw err;
    if (!isAutoFallbackEnabled() || !isLocalLlmReady()) {
      hintOfflineFallback();
      throw err;
    }
    let out = "";
    for await (const chunk of localStreamChat(messages, {
      maxTokens: options.maxTokens ? Math.min(options.maxTokens, 600) : 400,
      temperature: options.temperature,
      signal: options.signal
    })) {
      out += chunk.content;
    }
    return out;
  }
}
var lastFallbackToast;
var init_ai_service = __esm({
  "src/services/ai-service.ts"() {
    init_ai_config();
    init_dist();
    init_local_llm();
    lastFallbackToast = 0;
  }
});

// src/data/book-translation.ts
var book_translation_exports = {};
__export(book_translation_exports, {
  clearBookTranslation: () => clearBookTranslation,
  getBookTranslationStats: () => getBookTranslationStats,
  getCachedBookTranslation: () => getCachedBookTranslation,
  getChapterTranslation: () => getChapterTranslation,
  parseBatchTranslation: () => parseBatchTranslation,
  splitChapters: () => splitChapters,
  translateBook: () => translateBook,
  translateChapterByIndex: () => translateChapterByIndex
});
module.exports = __toCommonJS(book_translation_exports);

// src/lib/idb.ts
var DB_NAME = "nativethink-wordbank";
var DB_VERSION = 1;
var dbInstance = null;
function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(request.result);
    };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("wordbank")) {
        db.createObjectStore("wordbank", { keyPath: "key" });
      }
    };
  });
}
async function idbGet(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("wordbank", "readonly");
      const store = tx.objectStore("wordbank");
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : null);
      };
    });
  } catch {
    return null;
  }
}
async function idbSet(key, value) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("wordbank", "readwrite");
      const store = tx.objectStore("wordbank");
      const request = store.put({ key, value, timestamp: Date.now() });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch {
  }
}
async function idbDelete(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("wordbank", "readwrite");
      const store = tx.objectStore("wordbank");
      const request = store.delete(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch {
  }
}

// src/lib/local-mt.ts
var import_core = require("@capacitor/core");
var MODEL_ID = "Xenova/opus-mt-en-zh";
var STATE_KEY = "__nativethink_local_mt_state";
var ENGINE_KEY = "__nativethink_translate_engine";
var translatorPromise = null;
var loadProgress = -1;
var listeners = /* @__PURE__ */ new Set();
function emit() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
    }
  });
}
function isLocalMtReady() {
  try {
    return localStorage.getItem(STATE_KEY) === "ready";
  } catch {
    return false;
  }
}
function getTranslateEngine() {
  try {
    const v = localStorage.getItem(ENGINE_KEY);
    return v === "ai" || v === "local" ? v : "auto";
  } catch {
    return "auto";
  }
}
async function loadLocalMt() {
  if (translatorPromise) return translatorPromise;
  loadProgress = 0;
  emit();
  translatorPromise = (async () => {
    const tf = await import("@huggingface/transformers");
    tf.env.allowLocalModels = true;
    tf.env.localModelPath = "/models/";
    tf.env.allowRemoteModels = true;
    const device = navigator.gpu ? "webgpu" : "wasm";
    const progress_callback = (p) => {
      if (p?.status === "progress" && typeof p.progress === "number") {
        const v = Math.max(loadProgress, Math.min(99, Math.round(p.progress)));
        if (v !== loadProgress) {
          loadProgress = v;
          emit();
        }
      }
    };
    const build = () => tf.pipeline("translation", MODEL_ID, { dtype: "q8", device, progress_callback });
    const zh = (navigator.language || "").toLowerCase().startsWith("zh") || /android/i.test(navigator.userAgent);
    const hosts = zh ? ["https://hf-mirror.com", "https://huggingface.co"] : ["https://huggingface.co", "https://hf-mirror.com"];
    let lastErr = null;
    for (const host of hosts) {
      tf.env.remoteHost = host;
      tf.env.remotePathTemplate = "{model}/resolve/{revision}/";
      try {
        return await build();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  })();
  try {
    const t = await translatorPromise;
    try {
      localStorage.setItem(STATE_KEY, "ready");
    } catch {
    }
    loadProgress = 100;
    emit();
    return t;
  } catch (e) {
    translatorPromise = null;
    loadProgress = -1;
    emit();
    throw e;
  }
}
function extract(item) {
  if (!item) return "";
  if (Array.isArray(item)) return extract(item[0]);
  return String(item.translation_text ?? item.generated_text ?? "").trim();
}
async function translateWithLocalMt(texts, opts = {}) {
  const translator = await loadLocalMt();
  const out = [];
  for (let i = 0; i < texts.length; i++) {
    if (opts.signal?.aborted) break;
    const raw = texts[i];
    if (!raw || !raw.trim()) {
      out.push("");
      continue;
    }
    try {
      const res = await translator(raw.slice(0, 900));
      out.push(extract(res));
    } catch {
      out.push("");
    }
    opts.onProgress?.(i + 1, texts.length);
  }
  while (out.length < texts.length) out.push("");
  return out;
}

// src/data/book-translation.ts
var CHAPTER_MARKER = "##CHAPTER##";
var MAX_SEGMENT_CHARS = 1500;
var DEFAULT_BATCH_SIZE = 4;
var DEFAULT_CONCURRENCY = 2;
var DEFAULT_RETRY_DELAYS_MS = [3e3, 8e3, 15e3];
var chapterKeyOf = (bookId, chapterIdx) => `booktrans-${bookId}-ch${chapterIdx}`;
var manifestKeyOf = (bookId) => `booktrans-${bookId}-index`;
var activeRuns = /* @__PURE__ */ new Set();
function splitChapters(book) {
  const chapters = [];
  let current = null;
  const closeCurrent = () => {
    if (current && current.paragraphs.length > 0) chapters.push(current);
    current = null;
  };
  for (const page of book.pages ?? []) {
    for (const para of page?.paragraphs ?? []) {
      const en = para?.en ?? "";
      if (en.startsWith(CHAPTER_MARKER)) {
        closeCurrent();
        current = {
          index: chapters.length,
          title: en.slice(CHAPTER_MARKER.length).trim(),
          paragraphs: []
        };
      } else {
        if (!current) current = { index: chapters.length, title: "", paragraphs: [] };
        current.paragraphs.push(en);
      }
    }
  }
  closeCurrent();
  return chapters.map((c, i) => ({ ...c, index: i }));
}
var BATCH_SYSTEM_PROMPT = [
  "\u4F60\u662F\u4E00\u4F4D\u7ECF\u9A8C\u4E30\u5BCC\u7684\u6587\u5B66\u7FFB\u8BD1\uFF0C\u8D1F\u8D23\u628A\u82F1\u6587\u539F\u8457\u6BB5\u843D\u7FFB\u8BD1\u6210\u81EA\u7136\u6D41\u7545\u3001\u7B26\u5408\u4E2D\u6587\u6BCD\u8BED\u4E60\u60EF\u7684\u7B80\u4F53\u4E2D\u6587\u3002",
  "\u8F93\u5165\u4E3A\u82E5\u5E72\u5E26\u7F16\u53F7\u7684\u82F1\u6587\u6BB5\u843D\uFF08[1]\u3001[2]\u2026\u2026\uFF09\u3002\u8981\u6C42\uFF1A",
  "1. \u9010\u6BB5\u7FFB\u8BD1\uFF0C\u8BD1\u6587\u7684\u7F16\u53F7\u4E0E\u8F93\u5165\u4E25\u683C\u4E00\u4E00\u5BF9\u5E94\uFF0C\u4E0D\u589E\u3001\u4E0D\u51CF\u3001\u4E0D\u6539\u53D8\u987A\u5E8F\uFF1B",
  "2. \u8BD1\u6587\u7B26\u5408\u6BCD\u8BED\u8005\u8868\u8FBE\u4E60\u60EF\uFF0C\u907F\u514D\u7FFB\u8BD1\u8154\uFF1B\u4EBA\u540D\u53EF\u4FDD\u7559\u82F1\u6587\uFF1B",
  "3. \u53BB\u6389\u539F\u6587\u4E2D\u7684\u659C\u4F53\u6807\u8BB0\uFF08\u6210\u5BF9\u4E0B\u5212\u7EBF _..._\uFF09\uFF0C\u8BD1\u6587\u4E2D\u4E0D\u8981\u51FA\u73B0\u4E0B\u5212\u7EBF\uFF1B",
  '4. \u53EA\u8F93\u51FA\u4E25\u683C JSON\uFF1A{"t":[{"i":1,"zh":"\u7B2C 1 \u6BB5\u8BD1\u6587"},{"i":2,"zh":"\u2026\u2026"}]}\uFF0C\u4E0D\u8981\u8F93\u51FA\u4EFB\u4F55\u89E3\u91CA\u3001\u6CE8\u91CA\u6216 markdown \u4EE3\u7801\u5757\u3002'
].join("\n");
var SINGLE_SYSTEM_PROMPT = "Translate the following English passage into natural, fluent Simplified Chinese (native-speaker phrasing, no translationese). Keep personal names in English. Ignore italic markers (underscores). Return ONLY the Chinese translation \u2014 no extra text, no markdown.";
function cleanZhText(s) {
  return s.replace(/^\s*\[\d+\]\s*[:：]?\s*/, "").trim();
}
function parseBatchTranslation(raw, expectedCount) {
  const out = /* @__PURE__ */ new Map();
  if (!raw) return out;
  let text = String(raw).trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) text = fence[1].trim();
  let parsed = null;
  const candidates = [text];
  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) candidates.push(text.slice(objStart, objEnd + 1));
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) candidates.push(text.slice(arrStart, arrEnd + 1));
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {
    }
  }
  if (parsed == null) return out;
  const put = (num, zhRaw) => {
    const idx = Math.round(Number(num)) - 1;
    const zh = cleanZhText(typeof zhRaw === "string" ? zhRaw : "");
    if (Number.isFinite(idx) && idx >= 0 && idx < expectedCount && zh) out.set(idx, zh);
  };
  const putItem = (item, fallbackNum) => {
    if (typeof item === "string") {
      put(fallbackNum, item);
      return;
    }
    if (item && typeof item === "object") {
      const rec = item;
      put(rec.i ?? rec.index ?? fallbackNum, rec.zh ?? rec.translation ?? rec.text);
    }
  };
  if (Array.isArray(parsed)) {
    parsed.forEach((item, n) => putItem(item, n + 1));
  } else if (typeof parsed === "object") {
    const obj = parsed;
    if (Array.isArray(obj.t)) {
      obj.t.forEach((item, n) => putItem(item, n + 1));
    } else {
      for (const [key, value] of Object.entries(obj)) {
        if (/^\d+$/.test(key)) {
          put(key, typeof value === "string" ? value : value?.zh);
        }
      }
    }
  }
  return out;
}
function abortError() {
  const e = new Error("\u4E66\u7C4D\u7FFB\u8BD1\u5DF2\u4E2D\u6B62");
  e.name = "AbortError";
  return e;
}
function isAbortError(err) {
  return !!err && typeof err === "object" && err.name === "AbortError";
}
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort);
  });
}
async function withRetries(fn, retryDelaysMs, signal, label) {
  let lastError;
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw abortError();
    try {
      return await fn();
    } catch (err) {
      if (signal?.aborted || isAbortError(err)) throw err;
      lastError = err;
      if (attempt >= retryDelaysMs.length) break;
      const delay = retryDelaysMs[attempt];
      console.warn(
        `[book-translation] ${label} \u8BF7\u6C42\u5931\u8D25\uFF0C${delay}ms \u540E\u91CD\u8BD5\uFF08\u7B2C ${attempt + 1}/${retryDelaysMs.length} \u6B21\uFF09`,
        err
      );
      await sleep(delay, signal);
    }
  }
  throw lastError;
}
async function requestBatchTranslation(indices, chapter, o) {
  const { chat: chat2 } = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
  const userContent = indices.map((gi, n) => `[${n + 1}] ${chapter.paragraphs[gi].slice(0, MAX_SEGMENT_CHARS)}`).join("\n\n");
  const raw = await chat2(
    [
      { role: "system", content: BATCH_SYSTEM_PROMPT },
      { role: "user", content: userContent }
    ],
    { temperature: 0.3, maxTokens: 4096, signal: o.signal }
  );
  return parseBatchTranslation(raw, indices.length);
}
async function translateSingle(chapter, segIdx, o) {
  try {
    const { chat: chat2 } = await Promise.resolve().then(() => (init_ai_service(), ai_service_exports));
    const raw = await withRetries(
      () => chat2(
        [
          { role: "system", content: SINGLE_SYSTEM_PROMPT },
          { role: "user", content: chapter.paragraphs[segIdx].slice(0, MAX_SEGMENT_CHARS) }
        ],
        { temperature: 0.3, maxTokens: 1024, signal: o.signal }
      ),
      o.retryDelaysMs,
      o.signal,
      `ch${chapter.index}#${segIdx}`
    );
    return cleanZhText(raw);
  } catch (err) {
    if (o.signal?.aborted || isAbortError(err)) throw err;
    console.warn(`[book-translation] ch${chapter.index}#${segIdx} \u5355\u6BB5\u7FFB\u8BD1\u5931\u8D25\uFF0C\u8DF3\u8FC7`, err);
    return "";
  }
}
async function translateBatch(indices, chapter, o) {
  const label = `ch${chapter.index}[${indices[0]}-${indices[indices.length - 1]}]`;
  const engine = getTranslateEngine();
  const localFirst = engine === "local";
  if (localFirst && isLocalMtReady()) {
    try {
      const texts = indices.map((gi) => chapter.paragraphs[gi] || "");
      const zh = await translateWithLocalMt(texts, { signal: o.signal });
      const map = /* @__PURE__ */ new Map();
      indices.forEach((_, n) => {
        const t = (zh[n] || "").trim();
        if (t) map.set(n, t);
      });
      return { translations: map, failedCount: indices.length - map.size };
    } catch (e) {
      if (o.signal?.aborted) throw e;
      console.warn(`[book-translation] ${label} \u672C\u5730\u6A21\u578B\u5931\u8D25\uFF0C\u56DE\u843D AI`, e);
    }
  }
  const fillWithLocal = async (map) => {
    const missing = indices.filter((_, n) => !map.get(n));
    const need = indices.filter((_, n) => !map.get(n)).length;
    if (need === 0) return map;
    if (!isLocalMtReady()) return map;
    try {
      const texts = missing.map((gi) => chapter.paragraphs[gi] || "");
      console.info(`[book-translation] ${label} AI \u7F3A ${need} \u6BB5 \u2192 \u672C\u5730\u6A21\u578B\u515C\u5E95`);
      const zh = await translateWithLocalMt(texts, { signal: o.signal });
      missing.forEach((gi, n) => {
        const idxLocal = indices.indexOf(gi);
        const t = (zh[n] || "").trim();
        if (t && idxLocal >= 0) map.set(idxLocal, t);
      });
    } catch {
    }
    return map;
  };
  try {
    const map = await withRetries(
      () => requestBatchTranslation(indices, chapter, o),
      o.retryDelaysMs,
      o.signal,
      label
    );
    const missing = [];
    for (let n = 0; n < indices.length; n++) {
      if (!map.get(n)) missing.push(n);
    }
    if (missing.length === 0) return { translations: map, failedCount: 0 };
    const filled = await fillWithLocal(map);
    const stillMissing = indices.filter((_, n) => !filled.get(n)).length;
    if (stillMissing === 0) return { translations: filled, failedCount: 0 };
    map.clear();
    for (const [k, v] of filled) map.set(k, v);
    console.warn(`[book-translation] ${label} \u6279\u91CF\u7ED3\u679C\u7F3A ${missing.length} \u6BB5\uFF0C\u9010\u6BB5\u8865\u7FFB`);
    const translations2 = new Map(await fillWithLocal(map));
    let failedCount2 = 0;
    for (const n of missing) {
      if (translations2.get(n)) continue;
      const zh = await translateSingle(chapter, indices[n], o);
      if (zh) translations2.set(n, zh);
      else failedCount2 += 1;
    }
    return { translations: translations2, failedCount: failedCount2 };
  } catch (err) {
    if (o.signal?.aborted || isAbortError(err)) throw err;
    console.warn(`[book-translation] ${label} \u6279\u91CF\u7FFB\u8BD1\u5931\u8D25\uFF0C\u9000\u5316\u4E3A\u9010\u6BB5\u7FFB\u8BD1`, err);
  }
  const translations = /* @__PURE__ */ new Map();
  let failedCount = 0;
  for (let n = 0; n < indices.length; n++) {
    const zh = await translateSingle(chapter, indices[n], o);
    if (zh) translations.set(n, zh);
    else failedCount += 1;
  }
  return { translations, failedCount };
}
function buildBatches(indices, batchSize) {
  const batches = [];
  let run = [];
  const flushRun = () => {
    for (let i = 0; i < run.length; i += batchSize) {
      batches.push(run.slice(i, i + batchSize));
    }
    run = [];
  };
  for (const idx of indices) {
    if (run.length === 0 || idx === run[run.length - 1] + 1) run.push(idx);
    else {
      flushRun();
      run.push(idx);
    }
  }
  flushRun();
  return batches;
}
var prebakedLoaded = /* @__PURE__ */ new Set();
async function tryLoadPrebaked(bookId, chapterIdx) {
  if (prebakedLoaded.has(bookId)) return null;
  prebakedLoaded.add(bookId);
  try {
    const res = await fetch(`/translations/${bookId}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    const entries = Object.entries(data);
    if (entries.length === 0) return null;
    await Promise.all(entries.map(async ([k, arr]) => {
      const idx = Number(k);
      if (Number.isInteger(idx) && Array.isArray(arr)) {
        await idbSet(chapterKeyOf(bookId, idx), arr).catch(() => {
        });
      }
    }));
    const hit = data[String(chapterIdx)];
    return Array.isArray(hit) ? hit : null;
  } catch {
    return null;
  }
}
async function loadChapterCache(bookId, chapterIdx) {
  const cached0 = await loadChapterCacheRaw(bookId, chapterIdx);
  if (cached0 && cached0.some(Boolean)) return cached0;
  const prebaked = await tryLoadPrebaked(bookId, chapterIdx);
  if (prebaked && prebaked.some(Boolean)) return prebaked;
  return cached0;
}
async function loadChapterCacheRaw(bookId, chapterIdx) {
  const raw = await idbGet(chapterKeyOf(bookId, chapterIdx));
  if (!Array.isArray(raw)) return null;
  return raw.map((s) => typeof s === "string" ? s : "");
}
function alignCache(cached, total) {
  const zh = new Array(total).fill("");
  if (cached) {
    for (let i = 0; i < Math.min(cached.length, total); i++) {
      if (cached[i]) zh[i] = cached[i];
    }
  }
  return zh;
}
async function saveChapterCache(bookId, chapterIdx, zh, chapterCount) {
  await idbSet(chapterKeyOf(bookId, chapterIdx), zh);
  const manifest = await idbGet(manifestKeyOf(bookId)) ?? { chapters: [], chapterCount, updatedAt: 0 };
  if (!manifest.chapters.includes(chapterIdx)) manifest.chapters.push(chapterIdx);
  manifest.chapterCount = chapterCount;
  manifest.updatedAt = Date.now();
  await idbSet(manifestKeyOf(bookId), manifest);
}
function resolveOptions(opts) {
  return {
    batchSize: Math.min(8, Math.max(1, opts.batchSize ?? DEFAULT_BATCH_SIZE)),
    concurrency: Math.min(4, Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY)),
    retryDelaysMs: opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS,
    signal: opts.signal,
    onProgress: opts.onProgress
  };
}
async function translateBook(book, opts = {}) {
  const o = resolveOptions(opts);
  const chapters = splitChapters(book);
  const chaptersTotal = chapters.length;
  const result = {
    completed: false,
    translated: 0,
    failed: 0,
    chaptersDone: 0,
    chaptersTotal
  };
  if (chaptersTotal === 0) {
    result.completed = true;
    return result;
  }
  if (activeRuns.has(book.id)) {
    throw new Error(`[book-translation] \u300A${book.title}\u300B\u5DF2\u5728\u7FFB\u8BD1\u4E2D\uFF0C\u8BF7\u52FF\u91CD\u590D\u542F\u52A8`);
  }
  activeRuns.add(book.id);
  try {
    for (const chapter of chapters) {
      if (o.signal?.aborted) throw abortError();
      const total = chapter.paragraphs.length;
      const zh = alignCache(await loadChapterCache(book.id, chapter.index), total);
      const segDoneOf = () => zh.reduce((sum, t, i) => sum + (t || !chapter.paragraphs[i].trim() ? 1 : 0), 0);
      let segDone = segDoneOf();
      const emit3 = () => o.onProgress?.({
        chapterIdx: chapter.index,
        chapterTitle: chapter.title || `\u7B2C ${chapter.index + 1} \u7AE0`,
        segDone,
        segTotal: total,
        chaptersDone: result.chaptersDone,
        chaptersTotal
      });
      emit3();
      if (segDone < total) {
        const missing = [];
        for (let i = 0; i < total; i++) {
          if (!zh[i] && chapter.paragraphs[i].trim()) missing.push(i);
        }
        const queue = buildBatches(missing, o.batchSize);
        const worker = async () => {
          while (queue.length > 0) {
            if (o.signal?.aborted) throw abortError();
            const batch = queue.shift();
            const outcome = await translateBatch(batch, chapter, o);
            for (const [localIdx, text] of outcome.translations) {
              const gi = batch[localIdx];
              if (gi === void 0 || zh[gi]) continue;
              zh[gi] = text;
              result.translated += 1;
              segDone += 1;
              emit3();
            }
            result.failed += outcome.failedCount;
            await saveChapterCache(book.id, chapter.index, zh, chaptersTotal);
          }
        };
        const settled = await Promise.allSettled(
          Array.from({ length: Math.min(o.concurrency, queue.length) }, () => worker())
        );
        if (o.signal?.aborted) throw abortError();
        for (const s of settled) {
          if (s.status === "rejected") throw s.reason;
        }
        segDone = segDoneOf();
      }
      if (segDone >= total) result.chaptersDone += 1;
      await saveChapterCache(book.id, chapter.index, zh, chaptersTotal);
      emit3();
    }
    result.completed = true;
    return result;
  } catch (err) {
    if (o.signal?.aborted || isAbortError(err)) return result;
    throw err;
  } finally {
    activeRuns.delete(book.id);
  }
}
async function translateChapterByIndex(book, chapterIdx, opts = {}) {
  const o = resolveOptions(opts);
  const chapters = splitChapters(book);
  const chapter = chapters[chapterIdx];
  if (!chapter) throw new Error(`[book-translation] \u7AE0\u8282\u4E0D\u5B58\u5728: ${chapterIdx}`);
  if (activeRuns.has(book.id)) {
    throw new Error(`[book-translation] \u300A${book.title}\u300B\u5DF2\u5728\u7FFB\u8BD1\u4E2D\uFF0C\u8BF7\u52FF\u91CD\u590D\u542F\u52A8`);
  }
  activeRuns.add(book.id);
  const total = chapter.paragraphs.length;
  const zh = alignCache(await loadChapterCache(book.id, chapterIdx), total);
  let failed = 0;
  try {
    const missing = [];
    for (let i = 0; i < total; i++) {
      if (!zh[i] && chapter.paragraphs[i].trim()) missing.push(i);
    }
    if (missing.length > 0) {
      const queue = buildBatches(missing, o.batchSize);
      const worker = async () => {
        while (queue.length > 0) {
          if (o.signal?.aborted) throw abortError();
          const batch = queue.shift();
          const outcome = await translateBatch(batch, chapter, o);
          for (const [localIdx, text] of outcome.translations) {
            const gi = batch[localIdx];
            if (gi === void 0 || zh[gi]) continue;
            zh[gi] = text;
          }
          failed += outcome.failedCount;
          o.onProgress?.({
            chapterIdx,
            chapterTitle: chapter.title || `\u7B2C ${chapterIdx + 1} \u7AE0`,
            segDone: zh.reduce((sum, t, i) => sum + (t || !chapter.paragraphs[i].trim() ? 1 : 0), 0),
            segTotal: total,
            chaptersDone: 0,
            chaptersTotal: 1
          });
          await saveChapterCache(book.id, chapterIdx, zh, chapters.length);
        }
      };
      const settled = await Promise.allSettled(
        Array.from({ length: Math.min(o.concurrency, queue.length) }, () => worker())
      );
      for (const st of settled) {
        if (st.status === "rejected") throw st.reason;
      }
    }
    return { zh, failed, chapterTitle: chapter.title || `\u7B2C ${chapterIdx + 1} \u7AE0` };
  } catch (err) {
    if (o.signal?.aborted || isAbortError(err)) {
      return { zh, failed, chapterTitle: chapter.title || `\u7B2C ${chapterIdx + 1} \u7AE0` };
    }
    throw err;
  } finally {
    activeRuns.delete(book.id);
  }
}
async function getChapterTranslation(bookId, chapterIdx) {
  const raw = await idbGet(chapterKeyOf(bookId, chapterIdx));
  if (Array.isArray(raw) && raw.some((v) => typeof v === "string" && v)) {
    return raw.map((s) => typeof s === "string" ? s : "");
  }
  const prebaked = await tryLoadPrebaked(bookId, chapterIdx);
  if (prebaked && prebaked.some(Boolean)) return prebaked;
  if (Array.isArray(raw)) return raw.map((s) => typeof s === "string" ? s : "");
  return null;
}
async function getCachedBookTranslation(bookId) {
  const manifest = await idbGet(manifestKeyOf(bookId));
  const idxs = manifest?.chapters?.filter((n) => Number.isInteger(n) && n >= 0) ?? [];
  const entries = await Promise.all(
    idxs.map(async (idx) => [idx, await getChapterTranslation(bookId, idx)])
  );
  const out = {};
  for (const [idx, arr] of entries) {
    if (arr) out[idx] = arr;
  }
  return out;
}
async function clearBookTranslation(bookId) {
  const manifest = await idbGet(manifestKeyOf(bookId));
  if (manifest?.chapters?.length) {
    await Promise.all(manifest.chapters.map((idx) => idbDelete(chapterKeyOf(bookId, idx))));
  }
  await idbDelete(manifestKeyOf(bookId));
}
async function getBookTranslationStats(bookId, book) {
  const manifest = await idbGet(manifestKeyOf(bookId));
  const cached = await getCachedBookTranslation(bookId);
  const idxs = Object.keys(cached).map(Number).sort((a, b) => a - b);
  const translatedSegments = idxs.reduce((sum, i) => sum + cached[i].filter(Boolean).length, 0);
  let totalChapters = null;
  let totalSegments = null;
  let translatedChapters = idxs.length;
  if (book) {
    const chapters = splitChapters(book);
    totalChapters = chapters.length;
    totalSegments = chapters.reduce((sum, c) => sum + c.paragraphs.filter((s) => s.trim()).length, 0);
    translatedChapters = chapters.filter((c) => {
      const arr = cached[c.index];
      if (!arr) return false;
      return c.paragraphs.every((src, i) => !src.trim() || !!arr[i]);
    }).length;
  } else if (manifest && manifest.chapterCount > 0) {
    totalChapters = manifest.chapterCount;
  }
  return { translatedChapters, totalChapters, translatedSegments, totalSegments };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  clearBookTranslation,
  getBookTranslationStats,
  getCachedBookTranslation,
  getChapterTranslation,
  parseBatchTranslation,
  splitChapters,
  translateBook,
  translateChapterByIndex
});
/*! Bundled license information:

react/cjs/react.production.js:
  (**
   * @license React
   * react.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react.development.js:
  (**
   * @license React
   * react.development.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react-dom/cjs/react-dom.production.js:
  (**
   * @license React
   * react-dom.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react-dom/cjs/react-dom.development.js:
  (**
   * @license React
   * react-dom.development.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
