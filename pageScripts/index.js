
const ajax_tools_space = {
  ajaxToolsSwitchOn: true,
  ajaxToolsSwitchOnNot200: true,
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
  getOverrideText: (responseText, args, toJson= false) => {
    let overrideText = responseText;
    try {
      JSON.parse(responseText);
    } catch (e) {
      try {
        const returnText = (new Function(responseText))(args);
        if (returnText) {
          overrideText = typeof returnText === 'object' ? JSON.stringify(returnText) : returnText;
        }
      } catch (e) {
        console.error('【Executing your function reports an error】\n', e);
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
  myXHR: function () {
    const modifyResponse = () => {
      const [method, requestUrl] = this._openArgs;
      const queryStringParameters = ajax_tools_space.getRequestParams(requestUrl);
      const [requestPayload] = this._sendArgs;
      const matchedInterface = this._matchedInterface;
      if (matchedInterface && matchedInterface.responseText) {
        console.log("【mock match url】🟢 : "+"%c" + `${requestUrl}`, "color: #f50; font-weight: bold;");
        const funcArgs = {
          method,
          payload: {
            queryStringParameters,
            requestPayload
          },
          originalResponse: this.responseText
        };
        const overrideText = ajax_tools_space.getOverrideText(matchedInterface.responseText, funcArgs);
        this.responseText = overrideText;
        this.response = overrideText;
        if (ajax_tools_space.ajaxToolsSwitchOnNot200 && this.status !== 200) {
          this.status = 200;
        }
        if (matchedInterface.replacementStatusCode) {
          this.status = matchedInterface.replacementStatusCode;
        }
        // console.info('ⓢ ►►►►►►►►►►►►►►►►►►►►►►►►►►►►►►►► ⓢ');
        console.groupCollapsed(`%cMatched XHR Response modified：${matchedInterface.request}`, 'background-color: #108ee9; color: white; padding: 4px');
        console.info(`%cOriginal Request Url：`, 'background-color: #ff8040; color: white;', this.responseURL);
        console.info('%cModified Response Payload：', 'background-color: #ff5500; color: white;', JSON.parse(overrideText));
        console.groupEnd();
        // console.info('ⓔ ▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣ ⓔ')
      }
    }

    const xhr = new ajax_tools_space.originalXHR;
    for (const attr in xhr) {
      if (attr === 'onreadystatechange') {
        xhr.onreadystatechange = (...args) => {
          // 下载成功
          if (this.readyState === this.DONE) {
            // 开启拦截
            modifyResponse();
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
              console.info(`%cOriginal Request Url：`, 'background-color: #ff8040; color: white;', requestUrl);
            }
            if (matchedInterface.replacementUrl && args[1]) {
              args[1] = matchedInterface.replacementUrl;
              console.info(`%cModified Url：`, 'background-color: #ff8040; color: white;', matchedInterface.replacementUrl);
            }
            if (matchedInterface.replacementMethod && args[0]) {
              args[0] = matchedInterface.replacementMethod;
              console.info(`%cModified Method：`, 'background-color: #ff8040; color: white;', matchedInterface.replacementMethod);
            }
            if (matchedInterface.requestPayloadText && args[0] && args[1] && args[0].toUpperCase() === 'GET') {
              const queryStringParameters = ajax_tools_space.getRequestParams(args[1]);
              const data = {
                requestUrl: args[1],
                queryStringParameters
              }
              args[1] = ajax_tools_space.executeStringFunction(matchedInterface.requestPayloadText, data);
              console.info(`%cModified Request Payload, GET：`, 'background-color: #ff8040; color: white;', args[1]);
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
              console.info(`%cModified Rule Headers：`, 'background-color: #ff8040; color: white;', ruleHeaders);
            }
            const [method] = this._openArgs;
            if (matchedInterface.requestPayloadText && method !== 'GET') { // Not GET
              args[0] = ajax_tools_space.executeStringFunction(matchedInterface.requestPayloadText, args[0]);
              console.info(`%cModified Request Payload, ${method}：`, 'background-color: #ff8040; color: white;', args[0]);
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
        console.info(`%cOriginal Request Url：`, 'background-color: #ff8040; color: white;', requestUrl);
      }
      if (matchedInterface.replacementUrl && args[0]) {
        args[0] = matchedInterface.replacementUrl;
        console.info(`%cModified Url：`, 'background-color: #ff8040; color: white;', matchedInterface.replacementUrl);
      }
      if (matchedInterface.replacementMethod && args[1]) {
        args[1].method = matchedInterface.replacementMethod;
        console.info(`%cModified Method：`, 'background-color: #ff8040; color: white;', matchedInterface.replacementMethod);
      }
      if (matchedInterface.headers && args[1]) {
        ruleHeaders = ajax_tools_space.getOverrideText(matchedInterface.headers, data, true);
        console.info(`%cModified Rule Headers：`, 'background-color: #ff8040; color: white;', ruleHeaders);
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
          console.info(`%cModified Request Payload, GET：`, 'background-color: #ff8040; color: white;', args[0]);
        } else {
          data.body = ajax_tools_space.executeStringFunction(matchedInterface.requestPayloadText, data.body);
          console.info(`%cModified Request Payload, ${method}：`, 'background-color: #ff8040; color: white;', data.body);
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
      if (matchedInterface && matchedInterface.responseText) {
        const queryStringParameters = ajax_tools_space.getRequestParams(requestUrl);
        const originalResponse = await getOriginalResponse(response.body);
        const funcArgs = {
          method: data.method,
          payload: {
            queryStringParameters,
            requestPayload: data.body
          },
          originalResponse
        };
        overrideText = ajax_tools_space.getOverrideText(matchedInterface.responseText, funcArgs);
        // console.info('ⓢ ►►►►►►►►►►►►►►►►►►►►►►►►►►►►►►►► ⓢ');
        console.groupCollapsed(`%cMatched Fetch Response modified：${matchedInterface.request}`, 'background-color: #108ee9; color: white; padding: 4px');
        console.info(`%cOriginal Request Url：`, 'background-color: #ff8040; color: white;', response.url);
        console.info('%cModified Response Payload：', 'background-color: #ff5500; color: white;', JSON.parse(overrideText));
        console.groupEnd();
        // console.info('ⓔ ▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣ ⓔ')
      }
      if (overrideText !== undefined) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(overrideText));
            controller.close();
          }
        });
        const newResponse = new Response(stream, {
          headers: response.headers,
          status: matchedInterface && matchedInterface.replacementStatusCode || response.status,
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

window.addEventListener("message", function (event) {
  const data = event.data;
  if (data.type === 'ajaxTools' && data.to === 'pageScript') {
    // console.log('【pageScripts/index.js】', data);
    ajax_tools_space[data.key] = data.value;
  }
  if (ajax_tools_space.ajaxToolsSwitchOn && currentHostWhitelisted()) {
    // https://github.com/PengChen96/ajax-tools/pull/14
    for (const k in ajax_tools_space.originalXHR) {
      ajax_tools_space.myXHR[k] = ajax_tools_space.originalXHR[k]
    }
    window.XMLHttpRequest = ajax_tools_space.myXHR;
    window.fetch = ajax_tools_space.myFetch;
  } else {
    window.XMLHttpRequest = ajax_tools_space.originalXHR;
    window.fetch = ajax_tools_space.originalFetch;
  }

}, false);
