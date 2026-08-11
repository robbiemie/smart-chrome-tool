
// Dev-mode flag: injected by content.js before this script loads (see the
// devFlagScript block in content.js). The page script runs in the PAGE world
// where chrome.runtime is unavailable, so it cannot read the manifest name
// itself. Default to false (production-safe) if the flag was not injected.
const isDevMode = Boolean(window.__MOCKKIT_DEV_MODE__);
const logDev = (...args) => { if (isDevMode) console.log(...args); };
const infoDev = (...args) => { if (isDevMode) console.info(...args); };

const ajax_tools_space = {
  ajaxToolsSwitchOn: true,
  ajaxToolsSwitchOnNot200: true,
  // Sniffer sub-tool flag — when true, XHR/fetch hooks are installed even
  // if the Interceptor master switch is off, so live capture works
  // independently of mock. modifyResponse still honors ajaxToolsSwitchOn.
  snifferEnabled: false,
  ajaxDataList: [],
  domainWhitelist: ['*'],
  originalXHR: window.XMLHttpRequest,
  normalizeHeadersToObject: (headersInput) => {
    if (!headersInput) return {};
    if (headersInput instanceof Headers) {
      const headers = {};
      headersInput.forEach((value, key) => {
        headers[key] = value;
      });
      return headers;
    }
    if (Array.isArray(headersInput)) {
      return headersInput.reduce((acc, item) => {
        if (Array.isArray(item) && item.length > 1) {
          acc[item[0]] = item[1];
        }
        return acc;
      }, {});
    }
    if (typeof headersInput === 'object') {
      return Object.assign({}, headersInput);
    }
    return {};
  },
  strToRegExp: (regStr) => {
    let regexp = new RegExp('');
    try {
      const regParts = regStr.match(new RegExp('^/(.*?)/([gims]*)$'));
      if (regParts) {
        regexp = new RegExp(regParts[1], regParts[2]);
      } else {
        regexp = new RegExp(regStr);
      }
    } catch (error) {
      console.error(error);
    }
    return regexp;
  },
  getOverrideText: (responseText, args, toJson= false, language) => {
    let overrideText = responseText;
    let isParsedFromJs = false;
    // Path 1: valid JSON text (language === 'json' or JS that happens to be a
    // JSON string). Use as-is — no transformation needed.
    try {
      JSON.parse(responseText);
    } catch (e) {
      // Path 2: JavaScript mode. Two sub-strategies, tried in order:
      //   (a) Function body with a `return` statement — the historical contract
      //       shown in RESPONSE_EXAMPLES (e.g. `return { status: 200 }`).
      //   (b) A bare JS expression / object literal (e.g. `{a:1, b:[1,2,3]}` or
      //       `[1,2,3]`). Previously this fell through and the raw text was
      //       returned, which broke page-side JSON.parse. We now wrap it in
      //       `return ( ... )` so object literals evaluate to a real object.
      const isJs = language === 'javascript' || !language;
      if (isJs) {
        const trimmed = String(responseText || '').trim();
        const hasReturn = /\breturn\b/.test(trimmed);
        try {
          let returnText;
          if (hasReturn) {
            // (a) Treat as a function body — args are available as arguments[0].
            returnText = (new Function(responseText))(args);
          } else if (trimmed) {
            // (b) Treat as a bare JS expression. Wrap in `return ( ... )` so
            // object literals `{a:1}` and array literals `[1,2,3]` evaluate to
            // a value rather than being parsed as a block statement. args are
            // still exposed as arguments[0] for consistency with (a).
            returnText = (new Function('return (' + responseText + ')'))(args);
          }
          if (returnText !== undefined) {
            overrideText = typeof returnText === 'object' ? JSON.stringify(returnText) : returnText;
            isParsedFromJs = true;
          }
        } catch (e) {
          console.error('【Executing your function reports an error】\n', e);
        }
      }
    }
    if (toJson) {
      try {
        overrideText = JSON.parse(overrideText);
      } catch (e) {
        overrideText = {};
      }
    }
    return overrideText;
  },
  executeStringFunction: (stringFunction, args) => {
    try {
      stringFunction = (new Function(stringFunction))(args);
    } catch (e) {}
    return stringFunction;
  },
  // Parse a delay spec into milliseconds. Supports:
  //   "500"       → fixed 500ms
  //   "100-500"   → random integer in [100, 500]
  //   "" / NaN    → 0 (no delay)
  // Returns 0 for any unparseable input so a bad value never blocks the page.
  parseDelay: (delaySpec) => {
    if (!delaySpec) return 0;
    const s = String(delaySpec).trim();
    const rangeMatch = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const min = parseInt(rangeMatch[1], 10);
      const max = parseInt(rangeMatch[2], 10);
      if (max < min) return min;
      return min + Math.floor(Math.random() * (max - min + 1));
    }
    const n = parseInt(s, 10);
    return isNaN(n) ? 0 : Math.max(0, n);
  },
  // Resolve the final HTTP status for a mocked response. Centralizes three
  // concerns so XHR and fetch stay consistent:
  //   1. ajaxToolsSwitchOnNot200: normalize non-200 originals to 200 (hidden
  //      "always succeed" feature; no UI toggle, defaults to true). Applied
  //      BEFORE the per-rule override so an explicit replacementStatusCode
  //      (e.g. 404) still wins.
  //   2. replacementStatusCode: explicit per-rule override. Coerced to Number
  //      because XHR.status and ResponseInit.status are both unsigned short —
  //      the storage/UI layer keeps it as a string (consistent with `delay`),
  //      so the boundary coercion happens here.
  //   3. Empty/invalid replacement falls back to the normalized original so
  //      clearing the field restores passthrough behavior.
  resolveMockStatus: function (originalStatus, matchedInterface) {
    let status = originalStatus;
    if (ajax_tools_space.ajaxToolsSwitchOnNot200 && status !== 200) {
      status = 200;
    }
    if (matchedInterface && matchedInterface.replacementStatusCode) {
      const code = Number(matchedInterface.replacementStatusCode);
      // Guard against NaN / 0 so a malformed value never produces an invalid
      // HTTP status — fall back to the normalized original instead.
      if (code > 0) {
        status = code;
      }
    }
    return status;
  },
  getRequestParams: (requestUrl) => {
    if (!requestUrl) {
      return null;
    }
    const paramStr = requestUrl.split('?').pop();
    const keyValueArr = paramStr.split('&');
    let keyValueObj = {};
    keyValueArr.forEach((item) => {
      // 保证中间不会把=给忽略掉
      const itemArr = item.replace('=', '〓').split('〓');
      const itemObj = {[itemArr[0]]: itemArr[1]};
      keyValueObj = Object.assign(keyValueObj, itemObj);
    });
    return keyValueObj;
  },
  getMatchedInterface: ({thisRequestUrl = '', thisMethod = ''}) => {
    const result = { matchedInterface: null, groupIndex: -1, ruleIndex: -1 };
    for (let g = 0; g < ajax_tools_space.ajaxDataList.length; g += 1) {
      const interfaceList = ajax_tools_space.ajaxDataList[g].interfaceList || [];
      for (let r = 0; r < interfaceList.length; r += 1) {
        const { open = true, matchType = 'normal', matchMethod, request } = interfaceList[r];
        const matchedMethod = !matchMethod || matchMethod === thisMethod.toUpperCase();
        if (typeof thisRequestUrl !== 'string') continue;
        const matchedRequest = request && (matchType === 'normal' ? thisRequestUrl.includes(request) : thisRequestUrl.match(ajax_tools_space.strToRegExp(request)));
        if (open && matchedMethod && matchedRequest) {
          result.matchedInterface = interfaceList[r];
          result.groupIndex = g;
          result.ruleIndex = r;
          return result;
        }
      }
    }
    return result;
  },
  // Notify the content script (which owns the floating panel) that a rule
  // was hit, so it can light up the matching row with a green dot.
  notifyRuleHit: function (ruleKey) {
    if (!ruleKey) return;
    window.postMessage({ type: 'AJAX_TOOLS_RULE_HIT', to: 'contentScript', ruleKey }, '*');
  },
  // Notify the content script that a mock response was successfully delivered
  // to the page, so it can surface a global top-right toast. Fired only when
  // the override is actually applied (response body rewritten), which is the
  // true "interception success" signal — request-rewrite-only rules do not
  // fire this, since no mocked payload reached the page.
  notifyInterceptSuccess: function (url) {
    if (!url) return;
    try {
      window.postMessage({
        type: 'MOCKKIT_INTERCEPT_SUCCESS',
        to: 'contentScript',
        url,
      }, '*');
    } catch (e) {}
  },
  // Relay captured XHR/fetch traffic to the content script so the iframe
  // workbench's Request Sniffer can list it. We forward method, url, status
  // and response text; the consumer filters out static-resource URLs.
  // Static assets (js/css/img/font/etc.) are filtered here to avoid noise.
  emitCapturedRequest: function (payload) {
    if (!payload || !payload.url) return;
    try {
      window.postMessage({
        type: 'AJAX_TOOLS_REQUEST_CAPTURED',
        to: 'contentScript',
        payload,
      }, '*');
    } catch (e) {}
  },
  myXHR: function () {
    const modifyResponse = () => {
      // When the Interceptor master switch is off, skip response rewriting
      // even if a rule matches — the hook is only installed to feed the
      // Sniffer. This keeps capture independent of mock.
      if (!ajax_tools_space.ajaxToolsSwitchOn) return;
      const [method, requestUrl] = this._openArgs;
      const queryStringParameters = ajax_tools_space.getRequestParams(requestUrl);
      const [requestPayload] = this._sendArgs;
      const matchedInterface = this._matchedInterface;
      if (matchedInterface && matchedInterface.responseText) {
        logDev("【mock match url】🟢 : "+"%c" + `${requestUrl}`, "color: #f50; font-weight: bold;");
        const funcArgs = {
          method,
          payload: {
            queryStringParameters,
            requestPayload
          },
          originalResponse: this.responseText
        };
        const overrideText = ajax_tools_space.getOverrideText(matchedInterface.responseText, funcArgs, false, matchedInterface.language);
        this.responseText = overrideText;
        this.response = overrideText;
        // Resolve the mocked status once and reuse for both the XHR status
        // assignment and the Sniffer capture below — guarantees the panel
        // reports the same status the page actually received. The helper
        // returns a Number so XHR.status (unsigned short) stays type-correct.
        this.status = ajax_tools_space.resolveMockStatus(this.status, matchedInterface);
        console.groupCollapsed(`%cMatched XHR Response modified：${matchedInterface.request}`, 'background-color: #108ee9; color: white; padding: 4px');
        infoDev(`%cOriginal Request Url：`, 'background-color: #ff8040; color: white;', this.responseURL);
        infoDev('%cModified Response Payload：', 'background-color: #ff5500; color: white;', JSON.parse(overrideText));
        console.groupEnd();
        // infoDev('ⓔ ▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣ ⓔ')
        // Surface a global toast so the user sees this interception succeeded.
        // Fired here (inside the responseText override block) so it only fires
        // when mocked data actually reached the page, and naturally respects
        // the master switch (modifyResponse returns early when it is off).
        ajax_tools_space.notifyInterceptSuccess(requestUrl);
      }
    }

    const xhr = new ajax_tools_space.originalXHR;
    for (const attr in xhr) {
      if (attr === 'onreadystatechange') {
        xhr.onreadystatechange = (...args) => {
          // 下载成功
          if (this.readyState === this.DONE) {
            // Simulate response latency. When a matched rule specifies a
            // delay, defer BOTH the response modification and the page's
            // onreadystatechange callback so the page perceives a slower
            // round-trip (useful for testing loading states, retries, and
            // timeout handling). The Sniffer capture is also deferred so
            // its timeline matches what the page actually received.
            const delayMs = ajax_tools_space.parseDelay(this._matchedInterface && this._matchedInterface.delay);
            if (delayMs > 0) {
              setTimeout(() => {
                modifyResponse();
                ajax_tools_space.emitCapturedRequest({
                  source: 'xhr',
                  method: this._openArgs && this._openArgs[0],
                  url: this._openArgs && this._openArgs[1],
                  status: this.status,
                  responseText: this.responseText,
                });
                this.onreadystatechange && this.onreadystatechange.apply(this, args);
              }, delayMs);
              return;
            }
            // 开启拦截
            modifyResponse();
            // Emit captured request/response to the sniffer. Use the override
            // result so the panel reflects what the page actually received.
            ajax_tools_space.emitCapturedRequest({
              source: 'xhr',
              method: this._openArgs && this._openArgs[0],
              url: this._openArgs && this._openArgs[1],
              status: this.status,
              responseText: this.responseText,
            });
          }
          this.onreadystatechange && this.onreadystatechange.apply(this, args);
        }
        this.onreadystatechange = null;
        continue;
      } else if (attr === 'onload') {
        // xhr.onload = (...args) => {
        //   // 开启拦截
        //   modifyResponse();
        //   this.onload && this.onload.apply(this, args);
        // }
        // this.onload = null;
        // continue;
      } else if (attr === 'open') {
        this.open = (...args) => {
          this._openArgs = args;
          const [method, requestUrl] = args;
          const matchResult = ajax_tools_space.getMatchedInterface({thisRequestUrl: requestUrl, thisMethod: method});
          this._matchedInterface = matchResult.matchedInterface;
          const matchedInterface = this._matchedInterface;
          // Notify the floating panel so it can mark this rule as hit.
          if (matchedInterface) {
            ajax_tools_space.notifyRuleHit(matchedInterface.key);
          }
          // modify request
          if (matchedInterface) {
            const { replacementUrl, replacementMethod, headers, requestPayloadText } = matchedInterface;
            if (replacementUrl || replacementMethod || headers || requestPayloadText) {
              console.groupCollapsed(`%cMatched XHR Request modified：${matchedInterface.request}`, 'background-color: #fa8c16; color: white; padding: 4px');
              infoDev(`%cOriginal Request Url：`, 'background-color: #ff8040; color: white;', requestUrl);
            }
            if (matchedInterface.replacementUrl && args[1]) {
              args[1] = matchedInterface.replacementUrl;
              infoDev(`%cModified Url：`, 'background-color: #ff8040; color: white;', matchedInterface.replacementUrl);
            }
            if (matchedInterface.replacementMethod && args[0]) {
              args[0] = matchedInterface.replacementMethod;
              infoDev(`%cModified Method：`, 'background-color: #ff8040; color: white;', matchedInterface.replacementMethod);
            }
            if (matchedInterface.requestPayloadText && args[0] && args[1] && args[0].toUpperCase() === 'GET') {
              const queryStringParameters = ajax_tools_space.getRequestParams(args[1]);
              const data = {
                requestUrl: args[1],
                queryStringParameters
              }
              args[1] = ajax_tools_space.executeStringFunction(matchedInterface.requestPayloadText, data);
              infoDev(`%cModified Request Payload, GET：`, 'background-color: #ff8040; color: white;', args[1]);
            }
          }
          xhr.open && xhr.open.apply(xhr, args);
        }
        continue;
      } else if (attr === 'setRequestHeader') {
        this.setRequestHeader = (...args) => {
          this._headerArgs = this._headerArgs ? Object.assign(this._headerArgs, {[args[0]]: args[1]}) : {[args[0]]: args[1]};
        }
        continue;
      } else if (attr === 'send') {
        this.send = (...args) => {
          const matchedInterface = this._matchedInterface;
          let ruleHeaders = {};
          if (matchedInterface) {
            if (matchedInterface.headers) {
              ruleHeaders = ajax_tools_space.getOverrideText(matchedInterface.headers, this._openArgs, true);
              infoDev(`%cModified Rule Headers：`, 'background-color: #ff8040; color: white;', ruleHeaders);
            }
            const [method] = this._openArgs;
            if (matchedInterface.requestPayloadText && method !== 'GET') { // Not GET
              args[0] = ajax_tools_space.executeStringFunction(matchedInterface.requestPayloadText, args[0]);
              infoDev(`%cModified Request Payload, ${method}：`, 'background-color: #ff8040; color: white;', args[0]);
            }
            console.groupEnd();
          }
          const headers = Object.assign({}, this._headerArgs || {}, ruleHeaders || {});
          Object.keys(headers).forEach((key) => {
            xhr.setRequestHeader && xhr.setRequestHeader.apply(xhr, [key, headers[key]]);
          });
          this._sendArgs = args;
          xhr.send && xhr.send.apply(xhr, args);
        }
        continue;
      }
      if (typeof xhr[attr] === 'function') {
        this[attr] = xhr[attr].bind(xhr);
      } else {
        // responseText和response不是writeable的，但拦截时需要修改它，所以修改就存储在this[`_${attr}`]上
        if (['responseText', 'response', 'status'].includes(attr)) {
          Object.defineProperty(this, attr, {
            get: () => this[`_${attr}`] == undefined ? xhr[attr] : this[`_${attr}`],
            set: (val) => this[`_${attr}`] = val,
            enumerable: true
          });
        } else {
          Object.defineProperty(this, attr, {
            get: () => xhr[attr],
            set: (val) => xhr[attr] = val,
            enumerable: true
          });
        }
      }
    }
  },
  originalFetch: window.fetch.bind(window),
  myFetch: function (...args) {
    const getOriginalResponse = async (stream) => {
      let text = '';
      const decoder = new TextDecoder('utf-8');
      const reader = stream.getReader();
      const processData = (result) => {
        if (result.done) {
          return text;
        }
        const value = result.value; // Uint8Array
        text += decoder.decode(value, {stream: true});
        // 读取下一个文件片段，重复处理步骤
        return reader.read().then(processData);
      };
      return await reader.read().then(processData);
    }
    const [requestUrl, data={}] = args;
    if (!args[1]) {
      args[1] = data;
    }
    const matchResult = ajax_tools_space.getMatchedInterface({thisRequestUrl: requestUrl, thisMethod: data && data.method});
    const matchedInterface = matchResult.matchedInterface;
    // Notify the floating panel so it can mark this rule as hit.
    if (matchedInterface) {
      ajax_tools_space.notifyRuleHit(matchedInterface.key);
    }
    let ruleHeaders = {};
    if (matchedInterface && args) {
      const { replacementUrl, replacementMethod, headers, requestPayloadText } = matchedInterface;
      if (replacementUrl || replacementMethod || headers || requestPayloadText) {
        console.groupCollapsed(`%cMatched Fetch Request modified：${matchedInterface.request}`, 'background-color: #fa8c16; color: white; padding: 4px');
        infoDev(`%cOriginal Request Url：`, 'background-color: #ff8040; color: white;', requestUrl);
      }
      if (matchedInterface.replacementUrl && args[0]) {
        args[0] = matchedInterface.replacementUrl;
        infoDev(`%cModified Url：`, 'background-color: #ff8040; color: white;', matchedInterface.replacementUrl);
      }
      if (matchedInterface.replacementMethod && args[1]) {
        args[1].method = matchedInterface.replacementMethod;
        infoDev(`%cModified Method：`, 'background-color: #ff8040; color: white;', matchedInterface.replacementMethod);
      }
      if (matchedInterface.headers && args[1]) {
        ruleHeaders = ajax_tools_space.getOverrideText(matchedInterface.headers, data, true);
        infoDev(`%cModified Rule Headers：`, 'background-color: #ff8040; color: white;', ruleHeaders);
      }
      if (matchedInterface.requestPayloadText && args[0] && data) {
        const {method='GET'} = data;
        if (['GET', 'HEAD'].includes(method.toUpperCase())) {
          const queryStringParameters = ajax_tools_space.getRequestParams(args[0]);
          const data = {
            requestUrl: args[0],
            queryStringParameters
          }
          args[0] = ajax_tools_space.executeStringFunction(matchedInterface.requestPayloadText, data);
          infoDev(`%cModified Request Payload, GET：`, 'background-color: #ff8040; color: white;', args[0]);
        } else {
          data.body = ajax_tools_space.executeStringFunction(matchedInterface.requestPayloadText, data.body);
          infoDev(`%cModified Request Payload, ${method}：`, 'background-color: #ff8040; color: white;', data.body);
        }
      }
      console.groupEnd();
    }
    const currentHeaders = ajax_tools_space.normalizeHeadersToObject(data.headers);
    const mergedHeaders = Object.assign({}, currentHeaders, ruleHeaders || {});
    if (Object.keys(mergedHeaders).length > 0) {
      data.headers = mergedHeaders;
      args[1].headers = mergedHeaders;
    }
    return ajax_tools_space.originalFetch(...args).then(async (response) => {
      let overrideText = undefined;
      let originalResponseText = '';
      // Only rewrite the response when the Interceptor master switch is on.
      // When off, the hook is installed solely to feed the Sniffer, so we
      // skip override but still emit the capture below.
      if (matchedInterface && matchedInterface.responseText && ajax_tools_space.ajaxToolsSwitchOn) {
        const queryStringParameters = ajax_tools_space.getRequestParams(requestUrl);
        originalResponseText = await getOriginalResponse(response.body);
        const funcArgs = {
          method: data.method,
          payload: {
            queryStringParameters,
            requestPayload: data.body
          },
          originalResponse: originalResponseText
        };
        overrideText = ajax_tools_space.getOverrideText(matchedInterface.responseText, funcArgs, false, matchedInterface.language);
        // infoDev('ⓢ ►►►►►►►►►►►►►►►►►►►►►►►►►►►►►►►► ⓢ');
        console.groupCollapsed(`%cMatched Fetch Response modified：${matchedInterface.request}`, 'background-color: #108ee9; color: white; padding: 4px');
        infoDev(`%cOriginal Request Url：`, 'background-color: #ff8040; color: white;', response.url);
        infoDev('%cModified Response Payload：', 'background-color: #ff5500; color: white;', JSON.parse(overrideText));
        console.groupEnd();
        // infoDev('ⓔ ▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣ ⓔ')
      } else {
        // Non-matched fetch: clone the response so we can read its body for
        // the Request Sniffer without consuming the original stream that the
        // page will read.
        try {
          const cloneForSniffer = response.clone();
          originalResponseText = await getOriginalResponse(cloneForSniffer.body);
        } catch (e) {
          originalResponseText = '';
        }
      }
      if (overrideText !== undefined) {
        // Simulate response latency for mocked fetch responses. The delay
        // applies after the override text is computed but before the Response
        // is returned to the page, so callers' await resolves later — exactly
        // like a slow network. The Sniffer capture is emitted after the delay
        // so its timeline matches what the page perceived.
        const delayMs = ajax_tools_space.parseDelay(matchedInterface && matchedInterface.delay);
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        // Resolve the mocked status once and reuse for both the Sniffer
        // capture and the new Response — guarantees the panel reports the
        // same status the page actually received (previously the Sniffer
        // emitted the original status while the body was mocked). The helper
        // returns a Number and honors ajaxToolsSwitchOnNot200, so fetch now
        // matches XHR's status-resolution semantics.
        const finalStatus = ajax_tools_space.resolveMockStatus(response.status, matchedInterface);
        ajax_tools_space.emitCapturedRequest({
          source: 'fetch',
          method: data && data.method,
          url: requestUrl,
          status: finalStatus,
          responseText: overrideText,
        });
        // Surface a global toast so the user sees this interception succeeded.
        // Fired inside the override-applied branch so it only fires when mocked
        // data is returned to the page (and after the delay, if any, so the
        // toast matches when the page actually received the response).
        ajax_tools_space.notifyInterceptSuccess(requestUrl);
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(overrideText));
            controller.close();
          }
        });
        const newResponse = new Response(stream, {
          headers: response.headers,
          status: finalStatus,
          statusText: response.statusText,
        });
        const responseProxy = new Proxy(newResponse, {
          get: function (target, name) {
            switch (name) {
              case 'body':
              case 'bodyUsed':
              case 'ok':
              case 'redirected':
              case 'type':
              case 'url':
                return response[name];
            }
            return target[name];
          }
        });
        for (let key in responseProxy) {
          if (typeof responseProxy[key] === 'function') {
            responseProxy[key] = responseProxy[key].bind(newResponse);
          }
        }
        return responseProxy;
      }
      // Non-matched fetch: emit the passthrough capture immediately (no delay).
      ajax_tools_space.emitCapturedRequest({
        source: 'fetch',
        method: data && data.method,
        url: requestUrl,
        status: response.status,
        responseText: originalResponseText,
      });
      return response;
    })
  }
}

// --- Domain whitelist matching -------------------------------------------------
// The mock layer only activates on hostnames the user explicitly allowlisted.
// Patterns: '*' = all, '*.foo.com' = foo.com + subdomains, 'foo.com' = exact.
function patternToRegExp(pattern) {
  if (!pattern) return /^$/;
  if (pattern === '*') return /^.*$/;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  if (pattern.startsWith('*.')) {
    const rest = escaped.substring(4);
    return new RegExp('^(?:.*\\.)?' + rest + '$', 'i');
  }
  return new RegExp('^' + escaped + '$', 'i');
}

function isHostnameWhitelisted(hostname, patterns) {
  if (!hostname) return false;
  if (!patterns || patterns.length === 0) return false;
  return patterns.some(function (pattern) {
    try { return patternToRegExp(pattern).test(hostname); } catch (e) { return false; }
  });
}

function currentHostWhitelisted() {
  return isHostnameWhitelisted(window.location.hostname, ajax_tools_space.domainWhitelist);
}

// --- Animation pause: rAF + setTimeout + setInterval neutralization ----------
// The Web Animations API (used by content.js) can pause CSS animations and
// transitions, but it CANNOT reach animations driven by JS loops:
//  - requestAnimationFrame loops (canvas, WebGL, hand-rolled frame loops)
//  - setTimeout / setInterval loops (carousels, GSAP tickers, React state
//    polling, banner rotators — the most common "轮播" driver)
//
// Naively replacing `window.setTimeout` only catches callers who go through
// `window.setTimeout` at call time. Many libraries CACHE the reference at
// init (`const t = window.setTimeout`) and call the cached fn afterwards,
// bypassing any later replacement. To cover both cases we install WRAPPERS
// via `Object.defineProperty` at the very top of the page script (before any
// library has a chance to cache). The wrapper checks a `timerPaused` flag on
// every call: when paused, it queues the callback (rAF/setTimeout) or
// registers the interval (setInterval) instead of scheduling; when resumed,
// queued callbacks are replayed via the real native timers.
const nativeRAF = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null;
const nativeCAF = window.cancelAnimationFrame ? window.cancelAnimationFrame.bind(window) : null;
const nativeST = window.setTimeout ? window.setTimeout.bind(window) : null;
const nativeCT = window.clearTimeout ? window.clearTimeout.bind(window) : null;
const nativeSI = window.setInterval ? window.setInterval.bind(window) : null;
const nativeCI = window.clearInterval ? window.clearInterval.bind(window) : null;

let timerPaused = false;
let timerFakeIdCounter = 1;
// Pending one-shot callbacks queued during pause (rAF + setTimeout). Keyed by
// fake ID. On resume, replayed via the real native timers.
const pendingOneShots = new Map();
// Pending intervals queued during pause. Keyed by fake ID. On resume,
// re-installed via native setInterval.
const pendingIntervals = new Map();

function wrappedRAF(cb) {
  if (!timerPaused) return nativeRAF ? nativeRAF(cb) : 0;
  const id = timerFakeIdCounter++;
  pendingOneShots.set(id, { kind: 'raf', cb, args: [] });
  return id;
}
function wrappedCAF(id) {
  pendingOneShots.delete(id);
  if (nativeCAF) nativeCAF(id);
}
function wrappedST(cb, delay, ...args) {
  if (!timerPaused) return nativeST ? nativeST(cb, delay, ...args) : 0;
  const id = timerFakeIdCounter++;
  pendingOneShots.set(id, { kind: 'timeout', cb, args, delay: Math.max(0, delay || 0) });
  return id;
}
function wrappedCT(id) {
  pendingOneShots.delete(id);
  if (nativeCT) nativeCT(id);
}
function wrappedSI(cb, delay, ...args) {
  if (!timerPaused) return nativeSI ? nativeSI(cb, delay, ...args) : 0;
  const id = timerFakeIdCounter++;
  pendingIntervals.set(id, { cb, args, delay: Math.max(0, delay || 0) });
  return id;
}
function wrappedCI(id) {
  pendingIntervals.delete(id);
  if (nativeCI) nativeCI(id);
}

// Install wrappers as writable properties so libraries that cache
// `window.setTimeout` get our wrapper (not the native fn). The wrapper
// checks `timerPaused` on every call, so even a cached reference respects
// the pause. This is installed at page-script load (document_start, before
// most page JS) so the wrappers are in place before any library caches them.
function installTimerWrappers() {
  try {
    window.requestAnimationFrame = wrappedRAF;
    window.cancelAnimationFrame = wrappedCAF;
    window.setTimeout = wrappedST;
    window.clearTimeout = wrappedCT;
    window.setInterval = wrappedSI;
    window.clearInterval = wrappedCI;
  } catch (e) {
    // Some embedders lock these properties; fall back silently — the pause
    // will only cover rAF loops in that case.
  }
}
installTimerWrappers();

function applyTimerPatch(paused) {
  timerPaused = paused;
  if (!paused) {
    // Resume: replay queued one-shots via the real native timers, and
    // re-install queued intervals. Wrappers are already in place, but since
    // timerPaused is now false they'll pass through to native scheduling.
    for (const [id, entry] of pendingOneShots) {
      if (entry.kind === 'raf') {
        if (nativeRAF) nativeRAF(entry.cb);
      } else {
        if (nativeST) nativeST(entry.cb, entry.delay, ...entry.args);
      }
    }
    pendingOneShots.clear();
    for (const [id, entry] of pendingIntervals) {
      if (nativeSI) nativeSI(entry.cb, entry.delay, ...entry.args);
    }
    pendingIntervals.clear();
  }
}

// Install/restore XHR/fetch hooks based on the Interceptor master switch.
// Called on initial load AND on every state-change message. The Interceptor is
// the single chokepoint: when it is off, hooks are removed so the page runs
// unhooked (no mock, no capture). The Sniffer is subordinate to the Interceptor
// and cannot keep hooks alive on its own.
function syncHooks() {
  if (ajax_tools_space.ajaxToolsSwitchOn && currentHostWhitelisted()) {
    // https://github.com/PengChen96/ajax-tools/pull/14
    for (const k in ajax_tools_space.originalXHR) {
      ajax_tools_space.myXHR[k] = ajax_tools_space.originalXHR[k];
    }
    window.XMLHttpRequest = ajax_tools_space.myXHR;
    window.fetch = ajax_tools_space.myFetch;
  } else {
    window.XMLHttpRequest = ajax_tools_space.originalXHR;
    window.fetch = ajax_tools_space.originalFetch;
  }
}

// Initial install on script load — defaults are ajaxToolsSwitchOn: true, so
// hooks are active immediately, capturing XHRs the page fires at document_start
// before content.js has a chance to relay stored state.
syncHooks();

window.addEventListener("message", function (event) {
  const data = event.data;
  if (data.type === 'ajaxTools' && data.to === 'pageScript') {
    // logDev('【pageScripts/index.js】', data);
    ajax_tools_space[data.key] = data.value;
    // Animation pause toggle from content.js's Animation Control module.
    // WAAPI handles CSS animations/transitions; the timer patch below covers
    // JS driven animation loops (rAF + setTimeout + setInterval, e.g.
    // carousels/轮播, GSAP tickers, canvas loops) so pause truly freezes the
    // whole page.
    if (data.key === 'animationPaused') {
      applyTimerPatch(data.value === true);
    }
    // Re-evaluate hook installation on every state change.
    syncHooks();
  }
}, false);
