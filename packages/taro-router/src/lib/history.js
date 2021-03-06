import resolvePathname from './resolvePathname'
import EventEmitter from './eventEmitter'
import {
  pushHash,
  replaceHash,
  getCurrentHash,
  normalizeUrl,
  createLocation
} from './utils'

const history = window.history
const eventEmitter = new EventEmitter()

let historyState = parseInt(history.state, 10) || 0
const initUrl = normalizeUrl(getCurrentHash())
const initLocation = createLocation(initUrl, historyState)

const HISTORYKEY = 'taroRouterHistory'

const generateSerializer = (obj) => {
  return () => {
    localStorage.setItem(HISTORYKEY, JSON.stringify(obj))
  }
}

class History {
  constructor () {
    history.replaceState(historyState, '', null)

    window.addEventListener('hashchange', this.onHashchange)
    window.addEventListener('popstate', this.onPopstate)

    const stack = this.deserialize()
    if (this.validateStack(stack)) {
      this.locationStack = stack
      this.serializeStack = generateSerializer(this.locationStack)
    } else {
      this.locationStack = [ initLocation ]
      this.serializeStack = generateSerializer(this.locationStack)
      this.serializeStack()
    }
  }

  validateStack (stack) {
    if (stack.length === 0) return false

    const historyMap = {}
    const hasDuplicateState = stack.some(v => {
      const state = v.state
      if (historyMap[state]) return true
      historyMap[state] = true
    })
    if (hasDuplicateState) return false

    const stackCurrent = stack[stack.length - 1]
    const isThisone = stackCurrent.state === initLocation.state &&
      stackCurrent.fullUrl === initLocation.fullUrl
    if (isThisone) return true
    else return false
  }

  deserialize () {
    try {
      const stackStr = localStorage.getItem(HISTORYKEY)
      const stack = JSON.parse(stackStr)
      if (!Array.isArray(stack)) return []
      return stack
    } catch (e) {
      return []
    }
  }

  onHashchange = (e) => {
    history.replaceState(historyState, '', '')
  }

  onPopstate = (e) => {
    const nextUrl = normalizeUrl(getCurrentHash())
    const isBackPage = e.state < historyState
    if (typeof e.state !== 'number') return
    if (isBackPage) {
      navigateBack({
        url: nextUrl,
        state: e.state,
        delta: 1
      })
    } else {
      navigateTo({
        url: nextUrl,
        state: e.state,
        isForward: true
      })
    }
  }

  listen = (fn) => {
    eventEmitter.on('change', fn)
  }
  unlisten = (fn) => {
    eventEmitter.off('change', fn)
  }
  emit = (location, type, opts) => {
    eventEmitter.emit('change', location, type, opts)
  }

  /**
   * 返回当前的location
   *
   * @returns {location} location对象
   */
  now () {
    const current = this.locationStack.length - 1
    return this.locationStack[current]
  }

  /**
   * 返回当前的history栈长度
   *
   * @returns {number} history.stack的长度
   */
  len () {
    return this.locationStack.length
  }

  /**
   * 在history.stack中push新的location
   *
   * @param {object} param0 push的对象
   */
  push = ({ url, isForward, state }) => {
    const nextUrl = normalizeUrl(url)
    const currentUrl = this.now().url

    if (!isForward && (nextUrl === currentUrl)) return

    /**
     * 带state 是forward 否则是navigate
     */
    if (!state) {
      historyState += 1
    } else {
      historyState = state
    }
    const location = createLocation(nextUrl, historyState)

    this.locationStack.push(location)
    this.serializeStack()
    this.emit(location, 'PUSH')
    // ignoredUrl = nextUrl
    if (!isForward) {
      pushHash(nextUrl)
    }
  }

  /**
   * 在history.stack中replace新的location
   *
   * @param {object} param0 replace的对象
   */
  replace = ({ url }) => {
    const nextUrl = normalizeUrl(url)
    const currentUrl = this.now().url
    if (nextUrl === currentUrl) return

    const location = createLocation(nextUrl, historyState)
    this.locationStack.pop()
    this.locationStack.push(location)
    this.serializeStack()
    this.emit(location, 'REPLACE')
    // ignoredUrl = nextUrl
    replaceHash({
      url: nextUrl,
      state: historyState
    })
    history.replaceState
  }

  /**
   * 从history.stack中回退
   *
   * @param {object} param0 回退的配置项
   */
  goBack = ({ delta, url, state }) => {
    if (typeof delta !== 'number' || delta < 1) return console.warn('goBack delta out of range')

    const len = this.len()
    if (len > delta) {
      this.locationStack.splice(-delta)
      this.serializeStack()

      const location = this.now()
      historyState = location.state
      this.emit(location, 'BACK', { delta })
    } else if (delta <= 1 && url) {
      const location = createLocation(normalizeUrl(url), state)
      historyState = state
      this.locationStack.length = 1
      this.locationStack[0] = location
      this.serializeStack()

      this.emit(location, 'BACK', { delta })
    } else {
      return console.warn('goBack delta out of range')
    }
  }
}

const h = new History()

let navigateLock = false
const waitForlock = (fn) => {
  if (navigateLock) return false
  navigateLock = true
  setTimeout(() => {
    navigateLock = false
  }, 0)
  return fn()
}

const navigateTo = function (opts) {
  waitForlock(() => {
    const current = h.now()
    const currentUrl = current.url
    opts.url = resolvePathname(opts.url, currentUrl)
    h.push(opts)
  })
}

const navigateBack = function (opts = { delta: 1 }) {
  return waitForlock(() => {
    h.goBack(opts)
  })
}

const redirectTo = function (opts) {
  waitForlock(() => {
    const success = opts.success
    const fail = opts.fail
    const complete = opts.complete

    h.replace({
      url: opts.url,
      success,
      fail,
      complete
    })
  })
}

export {
  navigateTo,
  navigateBack,
  redirectTo
}

export default h
