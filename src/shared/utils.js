import { outputJsonSync } from 'fs-extra'
import fs from 'fs'
import path from 'path'
import Base64 from 'urlsafe-base64'
import { loadConfigsFromString } from './v2ray'
import { isWin } from '../shared/env'

const STRING_PROTOTYPE = '[object String]'
const NUMBER_PROTOTYPE = '[object Number]'
const REGEXP_PROTOTYPE = '[object RegExp]'
const DATE_PROTOTYPE = '[object Date]'
const BOOL_PROTOTYPE = '[object Boolean]'
const ARRAY_PROTOTYPE = '[object Array]'
const OBJECT_PROTOTYPE = '[object Object]'
const FUNCTION_PROTOTYPE = '[object Function]'

function protoString (obj) {
  return Object.prototype.toString.call(obj)
}

export function isString (str) {
  return protoString(str) === STRING_PROTOTYPE
}

export function isNumber (num) {
  return protoString(num) === NUMBER_PROTOTYPE
}

export function isRegExp (reg) {
  return protoString(reg) === REGEXP_PROTOTYPE
}

export function isBool (bool) {
  return protoString(bool) === BOOL_PROTOTYPE
}

export function isDate (date) {
  return protoString(date) === DATE_PROTOTYPE
}

export function isArray (arr) {
  return protoString(arr) === ARRAY_PROTOTYPE
}

export function isObject (obj) {
  return protoString(obj) === OBJECT_PROTOTYPE
}

export function isFunction (fn) {
  return protoString(fn) === FUNCTION_PROTOTYPE
}

export function debounce (fn, delay) {
  let timer
  return function (...args) {
    timer && clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}

/**
 * Vue data merge
 * @param  {Object} to      object that want to be merget to
 * @param  {Object} origins origin object sources
 */
export function merge (to, ...origins) {
  origins.forEach(from => {
    for (const key in from) {
      const value = from[key]
      // Just merge existed property in origin data
      if (to[key] !== undefined) {
        switch (protoString(value)) {
          case OBJECT_PROTOTYPE:
            merge(to[key], value)
            break
          default:
            to[key] = value
            break
        }
      }
    }
  })
}

/**
 * 合并应用配置对象
 * @param {Object} to 待合并的应用配置
 * @param {Object} from 用于合并的应用配置
 * @param {Boolean} appendArray 是否将新数组追加到源数组中而不是覆盖到方式
 */
export function configMerge (to, from, appendArray = false) {
  for (const key in from) {
    const value = from[key]
    switch (protoString(value)) {
      case OBJECT_PROTOTYPE:
        if (to[key] === undefined) {
          to[key] = value
        } else {
          configMerge(to[key], value, appendArray)
        }
        break
      // 配置数组采用直接覆盖的形式
      case ARRAY_PROTOTYPE:
        if (appendArray) {
          Array.prototype.push.apply(to[key], from[key])
        } else {
          to[key] = from[key]
        }
        break
      default:
        to[key] = value
        break
    }
  }
}

/**
 * 获取应用配置对象中发生更新的字段
 * @param {Object} appConfig 当前的应用配置
 * @param {Object} targetConfig 新的应用配置
 */
export function getUpdatedKeys (appConfig = {}, targetConfig) {
  return Object.keys(targetConfig).filter(key => {
    // 如果原对象类型和新的类型不一致直接返回true
    const value = targetConfig[key]
    if (protoString(appConfig[key]) !== protoString(value)) {
      return true
    }
    switch (protoString(value)) {
      case OBJECT_PROTOTYPE:
        return getUpdatedKeys(appConfig[key], value).length
      case ARRAY_PROTOTYPE:
        if (appConfig[key] === value) {
          return false
        }
        return (
          appConfig[key].length !== value.length ||
          appConfig[key].some(
            (item, index) => getUpdatedKeys(item, value[index]).length > 0
          )
        )
      default:
        return appConfig[key] !== value
    }
  })
}

// deep assign
export function assign (to, ...origins) {
  origins.forEach(from => {
    if (!isObject(from)) {
      return
    }
    for (const key in from) {
      const value = from[key]
      switch (protoString(value)) {
        case OBJECT_PROTOTYPE:
          if (to[key] === undefined) {
            to[key] = {}
          }
          assign(to[key], value)
          break
        default:
          to[key] = value
          break
      }
    }
  })
  return to
}

// clone obj
export function clone (obj, deep = false) {
  if (obj === undefined || obj === null) {
    return
  }
  let r = {}
  switch (protoString(obj)) {
    case DATE_PROTOTYPE:
      return new Date(obj)
    case REGEXP_PROTOTYPE:
      return new RegExp(obj)
    case ARRAY_PROTOTYPE:
      return !deep ? obj.slice(0) : obj.map(item => clone(item))
    case OBJECT_PROTOTYPE:
      // const r = {}
      for (const key in obj) {
        r[key] = deep ? clone(obj[key], deep) : obj[key]
      }
      return r
    default:
      return obj
  }
}

// 配置是否相同
export function isConfigEqual (config1, config2) {
  return (
    isObject(config1) &&
    isObject(config2) &&
    Object.keys(config1).every(key => {
      // 只关心这些键是否一致
      const validKeys = ['add', 'port', 'uid', 'aid', 'net', 'type', 'host', 'path', 'tls', 'group', 'enable']
      if (validKeys.indexOf(key) > -1) {
        return config1[key] === config2[key]
      }
      return true
    })
  )
}

// 生成随机ID
export function generateID () {
  const seed = 'ABCDEF01234567890'
  const arr = []
  for (let i = 0; i < 32; i++) {
    arr.push(seed[Math.floor(Math.random() * seed.length)])
  }
  return arr.join('')
}

// 为配置分组
export function groupConfigs (configs, selectedIndex) {
  const groups = {}
  const ungrouped = []
  configs.forEach((node, index) => {
    if (selectedIndex !== undefined) {
      node.checked = index === selectedIndex
    }
    if (node.group) {
      if (groups[node.group]) {
        groups[node.group].push(node)
      } else {
        groups[node.group] = [node]
      }
    } else {
      ungrouped.push(node)
    }
  })
  if (ungrouped.length) {
    groups['未分组'] = ungrouped
  }
  return groups
}

/**
 * 判断选择的 v2ray 的路径是否正确
 * @param {*String} path v2ray 所在的目录
 */
export function isV2rayPathAvaliable (folderPath) {
  let v2rayFilename = isWin ? 'v2ray.exe' : 'v2ray'
  const localV2rayPath = path.join(folderPath, v2rayFilename)
  return fs.existsSync(localV2rayPath)
}

export function somePromise (promiseArr) {
  return new Promise((resolve, reject) => {
    let count = 0
    for (const p of promiseArr) {
      p.then(resolve).catch(() => {
        count++
        if (count === promiseArr.length) {
          reject()
        }
      })
    }
  })
}

/**
 * 发起网络请求
 * @param {String} url 请求的路径
 */
export function request (url, fromRenderer) {
  let _net
  if (fromRenderer) {
    _net = require('electron').remote.net
  } else {
    const { net } = require('electron')
    _net = net
  }
  return new Promise((resolve, reject) => {
    _net
      .request(url)
      .on('response', response => {
        const body = []
        response.on('data', chunk => {
          body.push(chunk.toString())
        })
        response.on('end', () => {
          const stringRes = body.join('')
          if (response.headers['content-type'] === 'application/json') {
            try {
              resolve(JSON.parse(stringRes))
            } catch (error) {
              resolve(stringRes)
            }
          } else {
            resolve(stringRes)
          }
        })
      })
      .on('error', reject)
      .end()
  })
}

/**
 * 根据订阅返回值判断其是否为可用的订阅内容
 */
export function isSubscribeContentValid (content) {
  if (!content) {
    return null
  }
  const decoded = Base64.decode(content).toString('utf-8')
  const configs = loadConfigsFromString(decoded)
  if (!configs.length) {
    return null
  } else {
    return configs
  }
}

/**
 * 根据配置生成 config.json
 */
export function v2rayConfigHandler (appConfig, v2rayConfig) {
  const configFile = path.join(appConfig.v2rayPath, 'config.json')

  // log 日志配置
  const log = {
    access: '',
    error: '',
    loglevel: appConfig.logLevel,
  }

  // inbounds 传入连接配置
  const inbounds = [
    {
      port: appConfig.localPort,
      listen: '127.0.0.1',
      protocol: 'socks',
      sniffing: {
        enabled: true,
        destOverride: ["http", "tls"]
      },
      settings: {
        auth: 'noauth',
        udp: true,
        ip: null,
        clients: null
      },
      streamSettings: null
    },
  ]

  // outbounds 传出连接配置
  let streamSettings
  switch (v2rayConfig.net) {
    case 'kcp':
      streamSettings = {
        network: 'kcp',
        security: v2rayConfig.tls,
        kcpSettigns: {
          mtu: 1350,
        },
      }
      break
    case 'ws':
      streamSettings = {
        network: 'ws',
        security: v2rayConfig.tls,
        tlsSettings: {
          allowInsecure: true,
          serverName: null,
        },
        wsSettings: {
          connectionReuse: true,
          path: null,
          headers: null,
        },
      }
      break
    case 'quic':
      streamSettings = {
        network: 'quic',
        security: v2rayConfig.tls,
      }
      break
    default:
      // tcp
      streamSettings = {
        network: 'tcp',
        security: v2rayConfig.tls,
        tlsSettings: null,
        tcpSettings: {
          connectionReuse: true,
          header: {
            type: 'http',
            request: {
              version: '1.1',
              method: 'GET',
              path: ['/'],
              headers: {
                Host: [v2rayConfig.host],
                'User-Agent': ['Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.75 Safari/537.36'],
                'Accept-Encoding': ['gzip, deflate'],
                Connection: ['keep-alive'],
                Pragma: 'no-cache',
              },
            },
          }
        }
      }
  }
  const outbounds = [
    {
      tag: 'proxy',
      protocol: 'vmess',
      settings: {
        vnext: [
          {
            address: v2rayConfig.add,
            port: parseInt(v2rayConfig.port),
            users: [{
              id: v2rayConfig.uid,
              alterId: v2rayConfig.aid,
              email: "t@t.tt",
              security: 'auto',
            }],
          },
        ],
      },
      streamSettings: streamSettings,
    },
    {
      tag: 'direct',
      protocol: 'freedom',
      settings: {
        vnext: null,
        servers: null,
        response: null
      },
      streamSettings: null,
      mux: null,
    },
  ]

  // DNS配置
  const dns = null

  // routing 路由配置
  const routing = {
    domainStrategy: 'IPIfNonMatch',
    rules: []
  }
  const routing1 = {
    domainStrategy: 'IPOnDemand',
    rules: [
      {
        type: 'field',
        domain: ['geosite:cn'],
        ip: ['geoip:cn', 'geoip:private'],
        outboundTag: 'R_direct',
      },
    ],
  }

  const config = {
    log: log,
    inbounds: inbounds,
    outbounds: outbounds,
    dns: dns,
    routing: routing,
  }

  outputJsonSync(configFile, config, { spaces: '\t' })
  // fs.writeFileSync(configFile, JSON.stringify(config))
}
